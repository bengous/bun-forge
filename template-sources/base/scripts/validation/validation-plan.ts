export type ValidationPlan = {
  readonly defaultSteps: readonly string[];
};

export type GeneratedProjectPushValidationPolicy = {
  readonly codeSteps: readonly string[];
  readonly frontendSteps: readonly string[];
};

export const GENERATED_PROJECT_VALIDATE_PLAN: ValidationPlan = {
  defaultSteps: [
    "agents:check",
    "format:check",
    "lint:errors",
    "lint:arch",
    "typecheck",
    "test",
    "validate:frontend",
    "lint:audit",
  ],
};

export const GENERATED_PROJECT_PUSH_VALIDATION_POLICY: GeneratedProjectPushValidationPolicy = {
  codeSteps: ["typecheck", "lint:errors", "format:check", "lint:arch", "test"],
  frontendSteps: ["validate:frontend"],
};
