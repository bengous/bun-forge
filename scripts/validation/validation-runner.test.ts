import type { ValidationResult } from "./validation-runner.ts";
import { describe, expect, test } from "bun:test";
import { summarizeValidationResults } from "./validation-runner.ts";

function result(step: string, exit: number): ValidationResult {
  return { step, exit, output: "", ms: 1 };
}

describe("summarizeValidationResults", () => {
  test("counts passed and failed validation results", () => {
    expect(
      summarizeValidationResults([result("typecheck", 0), result("lint", 1), result("test", 0)]),
    ).toEqual({
      total: 3,
      passed: 2,
      failed: 1,
    });
  });

  test("handles empty validation plans", () => {
    expect(summarizeValidationResults([])).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
    });
  });
});
