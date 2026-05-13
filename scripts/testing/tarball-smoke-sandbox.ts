#!/usr/bin/env bun

import type { SandboxPaths } from "./sandbox-runner.ts";
import { readFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseJsonObject } from "../../src/core/json.ts";
import {
  buildSandboxCommand,
  createSandboxPaths,
  hostSecretAbsenceChecks,
  prepareSandboxRoot,
  requireLinuxBubblewrap,
  runSandboxCommand,
  sandboxTimeoutMs,
  SANDBOX_ROOT,
  shellQuote,
} from "./sandbox-runner.ts";

const DEFAULT_TARBALL_SMOKE_TIMEOUT_MS = 600_000;
const SANDBOX_TARBALL = `${SANDBOX_ROOT}/tarball/kitsmith.tgz`;
const SANDBOX_INSPECTION = `${SANDBOX_ROOT}/out/tarball-inspection.json`;
const SANDBOX_PROJECT = `${SANDBOX_ROOT}/project`;
const SANDBOX_GENERATED = `${SANDBOX_ROOT}/generated/minimal`;

export type TarballSmokeOptions = {
  readonly tarballPath: string;
  readonly keep: boolean;
};

export function tarballSmokeOptionsFromArgv(argv: readonly string[]): TarballSmokeOptions {
  const tarballPath = argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
  if (tarballPath === undefined) {
    throw new Error("Usage: bun scripts/testing/tarball-smoke-sandbox.ts <tarball.tgz> [--keep]");
  }

  return {
    tarballPath,
    keep: argv.includes("--keep"),
  };
}

export function tarballSmokeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return sandboxTimeoutMs(
    env,
    "KITSMITH_TARBALL_SMOKE_TIMEOUT_MS",
    DEFAULT_TARBALL_SMOKE_TIMEOUT_MS,
  );
}

function buildInspectionInnerScript(paths: SandboxPaths): string {
  const inspector = shellQuote(join(paths.repoRoot, "scripts/release/inspect-tarball.ts"));

  return [
    "set -euo pipefail",
    ...hostSecretAbsenceChecks(paths.hostHome),
    `bun run ${inspector} ${shellQuote(SANDBOX_TARBALL)} --no-network > ${shellQuote(
      SANDBOX_INSPECTION,
    )}`,
  ].join("\n");
}

export function buildTarballInspectionSandboxCommand(
  paths: SandboxPaths,
  tarballPath: string,
): string[] {
  return buildSandboxCommand({
    paths,
    chdir: paths.repoRoot,
    innerScript: buildInspectionInnerScript(paths),
    mounts: [
      { kind: "read-only", source: paths.repoRoot, target: paths.repoRoot },
      { kind: "read-only", source: tarballPath, target: SANDBOX_TARBALL },
    ],
    network: "none",
  });
}

function expectedVersionFromInspection(path: string): string {
  const inspection = parseJsonObject(readFileSync(path, "utf8"), path);
  const version = inspection["version"];
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("Tarball inspection must record a package version");
  }
  return version;
}

function buildSmokeInnerScript(paths: SandboxPaths, expectedVersion: string): string {
  return [
    "set -euo pipefail",
    ...hostSecretAbsenceChecks(paths.hostHome),
    "mkdir -p /sandbox/project /sandbox/generated",
    "cd /sandbox/project",
    "cat > package.json <<'JSON'",
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          kitsmith: "file:/sandbox/tarball/kitsmith.tgz",
        },
      },
      null,
      2,
    ),
    "JSON",
    "bun install --ignore-scripts",
    `test "$(/sandbox/project/node_modules/.bin/kitsmith --version)" = ${shellQuote(
      expectedVersion,
    )}`,
    `${shellQuote("/sandbox/project/node_modules/.bin/kitsmith")} ${shellQuote(
      SANDBOX_GENERATED,
    )} --yes --name tarball-smoke --backend true --frontend none --ai false --effect false --git-init false --install false`,
    `test -f ${shellQuote(join(SANDBOX_GENERATED, "package.json"))}`,
  ].join("\n");
}

export function buildTarballSmokeSandboxCommand(
  paths: SandboxPaths,
  tarballPath: string,
  expectedVersion: string,
): string[] {
  return buildSandboxCommand({
    paths,
    chdir: SANDBOX_PROJECT,
    innerScript: buildSmokeInnerScript(paths, expectedVersion),
    mounts: [{ kind: "read-only", source: tarballPath, target: SANDBOX_TARBALL }],
    network: "enabled",
  });
}

export async function tarballSmokeSandbox(options: TarballSmokeOptions): Promise<void> {
  requireLinuxBubblewrap("tarball smoke sandbox");

  const hostSandboxRoot = await mkdtemp(
    join(tmpdir(), `kitsmith-tarball-smoke-${basename(options.tarballPath, ".tgz")}-`),
  );
  const paths = await createSandboxPaths(hostSandboxRoot);
  const tarballPath = await realpath(options.tarballPath);

  try {
    await prepareSandboxRoot(hostSandboxRoot, ["generated", "out", "project", "tarball"]);

    console.log(`Tarball smoke sandbox: ${hostSandboxRoot}`);
    console.log(`Tarball smoke tarball: ${tarballPath}`);

    await runSandboxCommand(
      buildTarballInspectionSandboxCommand(paths, tarballPath),
      tarballSmokeTimeoutMs(),
      "tarball no-network inspection",
    );

    const expectedVersion = expectedVersionFromInspection(
      join(hostSandboxRoot, "out/tarball-inspection.json"),
    );
    await runSandboxCommand(
      buildTarballSmokeSandboxCommand(paths, tarballPath, expectedVersion),
      tarballSmokeTimeoutMs(),
      "tarball install smoke",
    );

    console.log("Tarball smoke OK");
  } finally {
    if (options.keep) {
      console.log(`Tarball smoke kept sandbox: ${hostSandboxRoot}`);
    } else {
      await rm(hostSandboxRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  await tarballSmokeSandbox(tarballSmokeOptionsFromArgv(process.argv));
}
