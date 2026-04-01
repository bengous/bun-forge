import { describe, expect, test } from "bun:test";
import { e2eContractScenariosFromArgv } from "./e2e-contract.ts";

describe("e2eContractScenariosFromArgv", () => {
  test("returns the reduced real-e2e matrix by default", () => {
    expect(e2eContractScenariosFromArgv(["bun", "scripts/testing/e2e-contract.ts"])).toEqual([
      "none-ai",
      "tanstack-ai",
    ]);
  });

  test("returns a single requested scenario", () => {
    expect(
      e2eContractScenariosFromArgv([
        "bun",
        "scripts/testing/e2e-contract.ts",
        "--scenario",
        "tanstack-plain",
      ]),
    ).toEqual(["tanstack-plain"]);
  });

  test("rejects unknown scenarios", () => {
    expect(() =>
      e2eContractScenariosFromArgv([
        "bun",
        "scripts/testing/e2e-contract.ts",
        "--scenario",
        "invalid",
      ]),
    ).toThrow("Expected --scenario to be one of");
  });
});
