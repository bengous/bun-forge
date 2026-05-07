#!/usr/bin/env bun

import { GENERATED_PROJECT_VALIDATE_PLAN } from "./validation-plan.ts";
import { executeValidationPlan } from "./validation-runner.ts";

if (import.meta.main) {
  await executeValidationPlan(GENERATED_PROJECT_VALIDATE_PLAN);
}
