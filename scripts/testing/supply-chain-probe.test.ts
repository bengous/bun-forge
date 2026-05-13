import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isKnownMaliciousPayloadHash,
  isLegitimateTanStackPayloadPath,
  scanSupplyChainPayloads,
} from "./supply-chain-probe.ts";

async function withTempProject<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "kitsmith-probe-test-"));

  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("isLegitimateTanStackPayloadPath", () => {
  test("allows TanStack payload filenames only under node_modules/@tanstack", () => {
    expect(isLegitimateTanStackPayloadPath("node_modules/@tanstack/router/router_init.js")).toBe(
      true,
    );
    expect(isLegitimateTanStackPayloadPath("src/router_init.js")).toBe(false);
  });
});

describe("isKnownMaliciousPayloadHash", () => {
  test("recognizes the published malicious payload hashes", () => {
    expect(
      isKnownMaliciousPayloadHash(
        "ab4fcadaec49c03278063dd269ea5eef82d24f2124a8e15d7b90f2fa8601266c",
      ),
    ).toBe(true);
    expect(isKnownMaliciousPayloadHash("00")).toBe(false);
  });
});

describe("scanSupplyChainPayloads", () => {
  test("flags payload filenames outside legitimate TanStack packages", async () => {
    await withTempProject(async (root) => {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src", "router_init.js"), "benign fixture");

      expect(await scanSupplyChainPayloads(root)).toEqual([
        { kind: "unexpected-payload-path", path: "src/router_init.js" },
      ]);
    });
  });

  test("allows benign payload filenames inside legitimate TanStack packages", async () => {
    await withTempProject(async (root) => {
      const legitimatePath = join(root, "node_modules", "@tanstack", "router");
      await mkdir(legitimatePath, { recursive: true });
      await writeFile(join(legitimatePath, "router_init.js"), "benign fixture");

      expect(await scanSupplyChainPayloads(root)).toEqual([]);
    });
  });
});
