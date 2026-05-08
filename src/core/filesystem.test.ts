import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureParentDir, listFilesRecursive } from "./filesystem.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => Bun.$`rm -rf ${dir}`.quiet()));
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kitsmith-fs-"));
  tempDirs.push(dir);
  return dir;
}

describe("listFilesRecursive", () => {
  test("returns sorted paths relative to the root", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src/nested"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Root");
    writeFileSync(join(dir, "src/nested/b.ts"), "export {};");
    writeFileSync(join(dir, "src/a.ts"), "export {};");

    expect(await listFilesRecursive(dir)).toEqual(["README.md", "src/a.ts", "src/nested/b.ts"]);
  });
});

describe("ensureParentDir", () => {
  test("creates missing parent directories", async () => {
    const dir = makeTempDir();
    const target = join(dir, "deep/path/file.txt");

    await ensureParentDir(target);

    expect(existsSync(join(dir, "deep/path"))).toBe(true);
  });
});
