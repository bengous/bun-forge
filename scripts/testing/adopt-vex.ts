#!/usr/bin/env bun

import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const DEFAULT_VEX_SOURCE = "/home/b3ngous/projects/vex";

type RunOptions = {
  readonly cwd: string;
};

async function run(command: string[], options: RunOptions): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? "/tmp",
      BUN_INSTALL: process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
    },
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function shouldCopy(path: string): boolean {
  const name = basename(path);
  return name !== ".git" && name !== "node_modules" && name !== ".bun-forge";
}

async function main(): Promise<void> {
  const source = argValue("--source") ?? DEFAULT_VEX_SOURCE;
  const destination =
    argValue("--destination") ?? (await mkdtemp(join(tmpdir(), "bun-forge-adopt-vex-")));

  await cp(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: shouldCopy,
  });

  await run(
    [
      "bun",
      "run",
      "src/index.ts",
      "adopt",
      destination,
      "--yes",
      "--ai",
      "true",
      "--effect",
      "true",
      "--frontend",
      "none",
      "--install",
      "false",
    ],
    { cwd: process.cwd() },
  );

  if (await Bun.file(join(destination, ".bun-forge")).exists()) {
    throw new Error("Dry-run wrote .bun-forge state");
  }

  await run(
    [
      "bun",
      "run",
      "src/index.ts",
      "adopt",
      destination,
      "--yes",
      "--apply",
      "--ai",
      "true",
      "--effect",
      "true",
      "--frontend",
      "none",
      "--install",
      "false",
    ],
    { cwd: process.cwd() },
  );

  await run(["bun", "install"], { cwd: destination });
  await run(["bun", "run", "typecheck"], { cwd: destination });
  await run(["bun", "test", "src/", "--ignore", "**/*e2e*/**"], { cwd: destination });

  console.log(`Vex adoption fixture: ${destination}`);
}

if (import.meta.main) {
  await main();
}
