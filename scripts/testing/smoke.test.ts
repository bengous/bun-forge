import { describe, expect, test } from "bun:test";
import { smokeScenariosFromArgv } from "./smoke.ts";

describe("smokeScenariosFromArgv", () => {
  test("returns the full matrix by default", () => {
    expect(smokeScenariosFromArgv(["bun", "scripts/testing/smoke.ts"])).toEqual([
      "none-plain",
      "none-ai",
      "tanstack-plain",
      "tanstack-ai",
    ]);
  });

  test("returns a single requested scenario", () => {
    expect(
      smokeScenariosFromArgv(["bun", "scripts/testing/smoke.ts", "--scenario", "tanstack-ai"]),
    ).toEqual(["tanstack-ai"]);
  });

  test("rejects unknown scenarios", () => {
    expect(() =>
      smokeScenariosFromArgv(["bun", "scripts/testing/smoke.ts", "--scenario", "nope"]),
    ).toThrow("Expected --scenario to be one of");
  });
});
