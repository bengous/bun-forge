import { expect, test } from "bun:test";
import { LIVE_PUSH_VALIDATION_POLICY, LIVE_VALIDATE_PLAN } from "./validation-plan.ts";

test("live validate plan keeps live-only rails out of generated validation", () => {
  expect(LIVE_VALIDATE_PLAN.defaultSteps).toContain("guard-destructive:check");
  expect(LIVE_VALIDATE_PLAN.defaultSteps).not.toContain("validate:frontend");
});

test("live push policy keeps product contract validation explicit", () => {
  expect(LIVE_PUSH_VALIDATION_POLICY.productSteps).toContain("test:project-contract");
  expect(LIVE_PUSH_VALIDATION_POLICY.productSteps).not.toContain("validate:frontend");
});
