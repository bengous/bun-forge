#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const CANONICAL_DIR = "template-sources/ai/.codex/hooks";
const TARGET_DIRS = ["template-sources/ai/.claude/hooks", ".codex/hooks", ".claude/hooks"] as const;
const SYNC_FILENAMES = [
  "guard-destructive-core.ts",
  "guard-destructive-core.test.ts",
  "guard-destructive.ts",
  "guard-destructive.test.ts",
] as const;

type Mode = "write" | "check";

type SyncFile = {
  readonly source: string;
  readonly targets: readonly string[];
};

function isString(value: string | null): value is string {
  return value !== null;
}

function parseMode(): Mode {
  return process.argv.includes("--write") ? "write" : "check";
}

function buildSyncFiles(): SyncFile[] {
  return SYNC_FILENAMES.map((filename) => ({
    source: join(CANONICAL_DIR, filename),
    targets: TARGET_DIRS.map((dir) => join(dir, filename)),
  }));
}

async function readFile(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`${path}: missing`);
  }
  return file.text();
}

async function writeFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, content);
}

async function runWrite(syncFiles: readonly SyncFile[]): Promise<void> {
  const writtenTargets = await Promise.all(
    syncFiles.map(async (file) => {
      const content = await readFile(file.source);
      return Promise.all(
        file.targets.map(async (target) => {
          await writeFile(target, content);
          return target;
        }),
      );
    }),
  );

  for (const target of writtenTargets.flat()) {
    console.log(`wrote ${target}`);
  }
}

async function runCheck(syncFiles: readonly SyncFile[]): Promise<string[]> {
  const errors = await Promise.all(
    syncFiles.map(async (file) => {
      const expected = await readFile(file.source);
      const targetErrors = await Promise.all(
        file.targets.map(async (target) => {
          const targetFile = Bun.file(target);
          if (!(await targetFile.exists())) {
            return `${target}: missing; run \`bun run guard-destructive:sync\``;
          }

          const actual = await targetFile.text();
          if (actual !== expected) {
            return `${target}: drift from ${file.source}`;
          }
          return null;
        }),
      );

      return targetErrors.filter(isString);
    }),
  );

  return errors.flat();
}

async function main(): Promise<void> {
  const mode = parseMode();
  const syncFiles = buildSyncFiles();

  if (mode === "write") {
    await runWrite(syncFiles);
    return;
  }

  const errors = await runCheck(syncFiles);
  if (errors.length === 0) {
    console.log("OK");
    return;
  }

  for (const error of errors) {
    console.error(error);
  }
  console.error(
    `\nFound ${errors.length} guard-destructive sync issue(s). Run \`bun run guard-destructive:sync\` to fix.`,
  );
  process.exit(1);
}

if (import.meta.main) {
  await main();
}
