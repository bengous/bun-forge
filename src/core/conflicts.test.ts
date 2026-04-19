import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDestinationIsSafe } from "./conflicts.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => Bun.$`rm -rf ${dir}`.quiet()));
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bun-forge-conflicts-"));
  tempDirs.push(dir);
  return dir;
}

describe("ensureDestinationIsSafe", () => {
  test("allows a missing destination", () => {
    const dir = join(makeTempDir(), "missing");
    expect(() => ensureDestinationIsSafe(dir)).not.toThrow();
  });

  test("allows an empty directory", () => {
    const dir = makeTempDir();
    expect(() => ensureDestinationIsSafe(dir)).not.toThrow();
  });

  test("rejects a non-empty directory", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "note.txt"), "occupied");
    expect(() => ensureDestinationIsSafe(dir)).toThrow(`Destination is not empty: ${dir}`);
  });

  test("rejects known sensitive files explicitly", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude/settings.json"), "{}");
    expect(() => ensureDestinationIsSafe(dir)).toThrow(
      "Refusing to overwrite existing sensitive file: .claude/settings.json",
    );
  });
});
