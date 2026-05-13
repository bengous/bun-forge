#!/usr/bin/env bun

import type { ValidationPlan } from "./validation-plan.ts";
import {
  LIVE_CHECK_PLAN,
  LIVE_DEEP_PLAN,
  LIVE_GENERATED_PLAN,
  LIVE_SANDBOX_PLAN,
  LIVE_VALIDATE_PLAN,
} from "./validation-plan.ts";
import { executeValidationPlan } from "./validation-runner.ts";

function selectedPlan(args: readonly string[]): ValidationPlan {
  const planIndex = args.indexOf("--plan");
  if (planIndex === -1) {
    return LIVE_VALIDATE_PLAN;
  }

  const planName = args[planIndex + 1] ?? "";
  switch (planName) {
    case "check":
      return LIVE_CHECK_PLAN;
    case "validate":
      return LIVE_VALIDATE_PLAN;
    case "deep":
      return LIVE_DEEP_PLAN;
    case "generated":
      return LIVE_GENERATED_PLAN;
    case "sandbox":
      return LIVE_SANDBOX_PLAN;
    default:
      throw new Error(`Unknown live validation plan: ${planName ?? ""}`);
  }
}

if (import.meta.main) {
  await executeValidationPlan(selectedPlan(process.argv));
}
