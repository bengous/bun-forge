import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 300_000;
const timedOut = Symbol("timedOut");

export type RunCommandOptions = {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
};

export function commandTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["BUN_FORGE_TEST_COMMAND_TIMEOUT_MS"];
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function kitsmithTempPath(name: string): string {
  return join(tmpdir(), name);
}

export function runCommandEnv(
  env: NodeJS.ProcessEnv = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const tempPath = env["TMPDIR"] ?? baseEnv["TMPDIR"] ?? kitsmithTempPath("bun-tmp");

  return {
    ...baseEnv,
    ...env,
    // Keep generated-project commands off Unix-only /tmp without forcing a shared BUN_INSTALL.
    TMPDIR: tempPath,
    BUN_TMPDIR: env["BUN_TMPDIR"] ?? baseEnv["BUN_TMPDIR"] ?? tempPath,
  };
}

export async function runCommand(
  command: readonly string[],
  options: RunCommandOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? commandTimeoutMs(options.env);
  const env = options.env ?? {};
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: runCommandEnv(env),
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });

  let timer: NodeJS.Timeout;
  const timeout = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => {
      proc.kill();
      resolve(timedOut);
    }, timeoutMs);
    timer.unref();
  });

  const exitCode = await Promise.race([proc.exited, timeout]);
  clearTimeout(timer!);

  if (exitCode === timedOut) {
    throw new Error(`${command.join(" ")} timed out after ${timeoutMs}ms`);
  }
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}
