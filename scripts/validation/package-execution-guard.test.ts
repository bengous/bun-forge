import { describe, expect, test } from "bun:test";
import {
  ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV,
  assertUnsafeHostPackageExecutionAllowed,
  isUnsafeHostPackageExecutionAllowed,
} from "./package-execution-guard.ts";

describe("isUnsafeHostPackageExecutionAllowed", () => {
  test("requires an explicit manual override value", () => {
    expect(isUnsafeHostPackageExecutionAllowed({})).toBe(false);
    expect(
      isUnsafeHostPackageExecutionAllowed({ [ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV]: "0" }),
    ).toBe(false);
    expect(
      isUnsafeHostPackageExecutionAllowed({ [ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV]: "1" }),
    ).toBe(true);
  });
});

describe("assertUnsafeHostPackageExecutionAllowed", () => {
  test("fails closed by default with the safer command", () => {
    expect(() =>
      assertUnsafeHostPackageExecutionAllowed(
        {
          action: "test action",
          saferCommand: "bun run test:safe-install",
        },
        {},
      ),
    ).toThrow("Safer command: bun run test:safe-install.");
  });

  test("allows an explicit manual override", () => {
    expect(() =>
      assertUnsafeHostPackageExecutionAllowed(
        { action: "test action" },
        { [ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV]: "1" },
      ),
    ).not.toThrow();
  });
});
