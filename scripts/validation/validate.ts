#!/usr/bin/env bun

import { LIVE_VALIDATE_PLAN } from "./validation-plan.ts";
import { executeValidationPlan } from "./validation-runner.ts";

if (import.meta.main) {
  await executeValidationPlan(LIVE_VALIDATE_PLAN);
}
