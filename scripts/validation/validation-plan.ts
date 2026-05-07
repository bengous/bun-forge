export type ValidationPlan = {
  readonly defaultSteps: readonly string[];
};

export type LivePushValidationPolicy = {
  readonly codeSteps: readonly string[];
  readonly productFormatStep: string;
  readonly productSteps: readonly string[];
};

export const LIVE_VALIDATE_PLAN: ValidationPlan = {
  defaultSteps: [
    "agents:check",
    "guard-destructive:check",
    "format:check",
    "lint:errors",
    "lint:arch",
    "typecheck",
    "test",
    "lint:audit",
  ],
};

export const LIVE_PUSH_VALIDATION_POLICY: LivePushValidationPolicy = {
  codeSteps: ["typecheck", "lint:errors", "format:check", "lint:arch", "test"],
  productFormatStep: "format:check",
  productSteps: ["test:project-contract"],
};
