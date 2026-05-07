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
    env: {
      ...process.env,
      ...env,
      BUN_TMPDIR: env["BUN_TMPDIR"] ?? process.env["BUN_TMPDIR"] ?? "/tmp",
      BUN_INSTALL: env["BUN_INSTALL"] ?? process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
    },
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
