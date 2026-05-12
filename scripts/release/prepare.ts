#!/usr/bin/env bun

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJsonObject } from "../../src/core/json.ts";

type CommandResult = {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

function run(command: readonly string[], cwd = process.cwd()): CommandResult {
  const proc = Bun.spawnSync([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    command,
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function commandLine(command: readonly string[]): string {
  return command.join(" ");
}

function runOrThrow(command: readonly string[], cwd = process.cwd()): CommandResult {
  console.log(`$ ${commandLine(command)}`);
  const result = run(command, cwd);
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr.trim());
  }
  if (result.exitCode !== 0) {
    throw new Error(`${commandLine(command)} failed with exit code ${result.exitCode}`);
  }
  return result;
}

function readPackageVersion(): string {
  const packageJson = readJsonObject("package.json");
  const version = packageJson["version"];
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json must define a non-empty version");
  }
  return version;
}

function readJsonObject(path: string): Record<string, unknown> {
  return parseJsonObject(readFileSync(path, "utf8"), path);
}

function assertCleanWorktree(): void {
  const status = runOrThrow(["git", "status", "--porcelain=v1"]);
  if (status.stdout.trim().length > 0) {
    throw new Error("Release prepare requires a clean worktree");
  }
}

function assertTagAvailable(tag: string): void {
  const localTag = run(["git", "tag", "--list", tag]);
  if (localTag.exitCode !== 0) {
    throw new Error(localTag.stderr || "Unable to inspect local tags");
  }
  if (localTag.stdout.trim().length > 0) {
    throw new Error(`Local tag already exists: ${tag}`);
  }

  const remoteTag = run(["git", "ls-remote", "--tags", "origin", `refs/tags/${tag}`]);
  if (remoteTag.exitCode !== 0) {
    throw new Error(remoteTag.stderr || "Unable to inspect remote tags");
  }
  if (remoteTag.stdout.trim().length > 0) {
    throw new Error(`Remote tag already exists: ${tag}`);
  }
}

function assertNpmVersionAvailable(version: string): void {
  const result = runOrThrow(["npm", "view", "kitsmith", "version", "dist-tags", "--json"]);
  const parsed = parseJsonObject(result.stdout, "npm view kitsmith");
  if (parsed["version"] === version) {
    throw new Error(`npm already reports kitsmith@${version}`);
  }
}

function latestTag(): string {
  const result = runOrThrow(["git", "describe", "--tags", "--abbrev=0"]);
  return result.stdout.trim();
}

function smokeTarballCli(tarballPath: string, expectedVersion: string): void {
  const version = runOrThrow([
    "npx",
    "--yes",
    "--package",
    tarballPath,
    "kitsmith",
    "--version",
  ]).stdout.trim();
  if (version !== expectedVersion) {
    throw new Error(`Expected tarball CLI version ${expectedVersion}, got ${version}`);
  }
}

function packTarball(): string {
  const packDir = mkdtempSync(join(tmpdir(), "kitsmith-pack-"));
  const pack = runOrThrow(["npm", "pack", "--pack-destination", packDir]);
  const fileName = pack.stdout
    .trim()
    .split(/\r?\n/)
    .findLast((line) => line.endsWith(".tgz"));
  if (fileName === undefined) {
    throw new Error("Unable to find packed tarball name in npm pack output");
  }
  return join(packDir, fileName);
}

function main(): void {
  const version = readPackageVersion();
  const tag = `v${version}`;
  console.log(`Preparing kitsmith@${version}`);

  assertCleanWorktree();
  assertTagAvailable(tag);
  assertNpmVersionAvailable(version);

  runOrThrow(["cog", "check"]);
  const previousTag = latestTag();
  runOrThrow(["cog", "changelog", `${previousTag}..HEAD`]);
  const suggestedVersion = runOrThrow(["cog", "bump", "--auto", "--dry-run"]).stdout.trim();
  if (suggestedVersion !== tag) {
    throw new Error(`Expected cog dry-run bump ${tag}, got ${suggestedVersion}`);
  }

  runOrThrow(["bun", "run", "--silent", "validate"]);
  runOrThrow(["npm", "publish", "--access", "public", "--dry-run"]);

  const tarballPath = packTarball();
  smokeTarballCli(tarballPath, version);

  runOrThrow(["git", "diff", "--check"]);
  runOrThrow(["git", "status", "--short", "--branch"]);

  console.log(`Release prepare OK for kitsmith@${version}`);
  console.log(`Tarball: ${tarballPath}`);
  console.log("Next step requires explicit human approval: npm publish, tag, push.");
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
