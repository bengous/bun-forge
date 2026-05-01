import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectLinkCheckFiles, filesContainLinks } from "./check-links-local.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("filesContainLinks", () => {
  test("returns false for docs without links", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "# Readme\n\nNo links here.");

    expect(filesContainLinks(["README.md"], dir)).toBe(false);
  });

  test("detects markdown and html links", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "[docs](./docs/guide.md)");
    writeFileSync(join(dir, "page.html"), '<a href="/docs">Docs</a>');

    expect(filesContainLinks(["README.md"], dir)).toBe(true);
    expect(filesContainLinks(["page.html"], dir)).toBe(true);
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bun-forge-links-"));
  tempDirs.push(dir);
  return dir;
}

describe("collectLinkCheckFiles", () => {
  test("finds README.md even when git has no tracked files", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "# Readme");
    expect(collectLinkCheckFiles(dir)).toEqual(["README.md"]);
  });

  test("collects markdown and html docs recursively", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs/nested"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Readme");
    writeFileSync(join(dir, "docs/guide.md"), "# Guide");
    writeFileSync(join(dir, "docs/nested/index.html"), "<h1>Guide</h1>");
    writeFileSync(join(dir, "docs/ignore.txt"), "ignore");

    expect(collectLinkCheckFiles(dir)).toEqual([
      "docs/guide.md",
      "docs/nested/index.html",
      "README.md",
    ]);
  });
});
