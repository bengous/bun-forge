#!/usr/bin/env bun

import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCommand } from "./run-command.ts";

const DEFAULT_VEX_SOURCE = "/home/b3ngous/projects/vex";

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

  await runCommand(
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

  await runCommand(
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

  await runCommand(["bun", "run", "agents:sync"], { cwd: destination });
  await runCommand(["bun", "run", "agents:check"], { cwd: destination });
  await runCommand(["bun", "install"], { cwd: destination });
  await runCommand(["bun", "run", "typecheck"], { cwd: destination });
  await runCommand(["bun", "test", "src/", "--ignore", "**/*e2e*/**"], { cwd: destination });

  console.log(`Vex adoption fixture: ${destination}`);
}

if (import.meta.main) {
  await main();
}
