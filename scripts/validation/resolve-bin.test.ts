import { describe, expect, test } from "bun:test";
import { resolveBin, resolveProjectRoot } from "./resolve-bin.ts";

describe("resolveProjectRoot", () => {
  test("trims the validation script suffix", () => {
    expect(resolveProjectRoot("/repo/scripts/validation")).toBe("/repo");
    expect(resolveProjectRoot("C:\\repo\\scripts\\validation")).toBe("C:\\repo");
  });
});

describe("resolveBin", () => {
  test("builds the node_modules binary path", () => {
    const expectedSuffix = process.platform === "win32" ? "oxlint.exe" : "oxlint";
    expect(resolveBin("/repo", "oxlint")).toBe(`/repo/node_modules/.bin/${expectedSuffix}`);
  });
});
