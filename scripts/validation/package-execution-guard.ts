export const ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV =
  "KITSMITH_ALLOW_UNSANDBOXED_PACKAGE_EXECUTION";

export type UnsafeHostPackageExecutionGuard = {
  readonly action: string;
  readonly saferCommand?: string;
};

export function isUnsafeHostPackageExecutionAllowed(env: NodeJS.ProcessEnv): boolean {
  return env[ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV] === "1";
}

export function assertUnsafeHostPackageExecutionAllowed(
  guard: UnsafeHostPackageExecutionGuard,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isUnsafeHostPackageExecutionAllowed(env)) {
    return;
  }

  const saferCommand =
    guard.saferCommand === undefined ? "" : ` Safer command: ${guard.saferCommand}.`;
  throw new Error(
    `${guard.action} would execute package-manager code on the host. Refusing by default.${saferCommand} Set ${ALLOW_UNSANDBOXED_PACKAGE_EXECUTION_ENV}=1 only for an explicit, manual override.`,
  );
}
