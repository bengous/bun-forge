import { expect, test } from "bun:test";
import { stopValidationSteps } from "./validate-on-stop.ts";

test("stop validation targets code changes with check-level steps", () => {
  expect(
    stopValidationSteps(new Set(["backend", "scripts"]), {
      hasAgentsCheck: true,
      hasGuardDestructiveCheck: true,
    }),
  ).toEqual(["format:check", "lint:errors", "typecheck", "test"]);
});

test("stop validation keeps product contract checks out of PostToolUse", () => {
  expect(
    stopValidationSteps(new Set(["product"]), {
      hasAgentsCheck: true,
      hasGuardDestructiveCheck: true,
    }),
  ).toEqual(["format:check", "test:project-contract"]);
});

test("stop validation includes config sync checks without deep or sandbox lanes", () => {
  expect(
    stopValidationSteps(new Set(["config", "backend", "scripts", "product"]), {
      hasAgentsCheck: true,
      hasGuardDestructiveCheck: true,
    }),
  ).toEqual([
    "format:check",
    "lint:errors",
    "typecheck",
    "test",
    "test:project-contract",
    "agents:check",
    "guard-destructive:check",
  ]);
});
