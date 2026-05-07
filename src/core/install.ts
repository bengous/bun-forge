import type { InitOptions } from "../types.ts";
import { confirm, isCancel } from "@clack/prompts";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunOptions = {
  readonly env?: NodeJS.ProcessEnv;
};

type ConfirmOptions = {
  readonly message: string;
  readonly initialValue?: boolean;
};

export type InstallRuntime = {
  readonly mkdir: typeof mkdir;
  readonly runCommand: typeof runCommand;
  readonly hasCommand: typeof hasCommand;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean | symbol>;
  readonly warn: (message: string) => void;
};

export async function runCommand(
  command: string[],
  cwd: string,
  options: RunOptions = {},
): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

function hasCommand(name: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which";
  const result = Bun.spawnSync([lookup, name], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  return result.exitCode === 0;
}

export const defaultInstallRuntime: InstallRuntime = {
  mkdir,
  runCommand,
  hasCommand,
  confirm,
  warn: console.warn,
};

export function bunForgeTempPath(name: string): string {
  return join(tmpdir(), name);
}

export function bunInstallEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const tempPath = env["TMPDIR"] ?? bunForgeTempPath("bun-tmp");

  return {
    ...env,
    // Bun documents TMPDIR for intermediate files. BUN_INSTALL is user/global state,
    // so preserve it only when the caller already set it.
    TMPDIR: tempPath,
    BUN_TMPDIR: env["BUN_TMPDIR"] ?? tempPath,
  };
}

async function syncAgentsIfEnabled(
  options: InitOptions,
  runtime: InstallRuntime = defaultInstallRuntime,
): Promise<void> {
  if (!options.ai) {
    return;
  }

  await runtime.runCommand(
    ["bun", "scripts/agents/sync-agents-md.ts", "--write"],
    options.destination,
  );
}

export async function maybeInstallMiseWithRuntime(
  options: InitOptions,
  runtime: InstallRuntime = defaultInstallRuntime,
): Promise<void> {
  if (runtime.hasCommand("mise")) {
    try {
      await runtime.runCommand(["mise", "install"], options.destination);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `\`mise install\` failed: ${reason}`;

      if (options.yes) {
        runtime.warn(`${message}. Continuing without a successful \`mise install\`.`);
        return;
      }

      runtime.warn(message);
      const answer = await runtime.confirm({
        message: "Continue without a successful `mise install` for now?",
        initialValue: true,
      });

      if (isCancel(answer) || answer) {
        return;
      }

      runtime.warn("Continuing without a successful `mise install`. Fix it manually afterwards.");
    }
    return;
  }

  const message =
    "mise is not installed. Install it from https://mise.jdx.dev/getting-started.html";

  if (options.yes) {
    runtime.warn(`${message}. Skipping \`mise install\`.`);
    return;
  }

  runtime.warn(message);
  const answer = await runtime.confirm({
    message: "Continue without running `mise install` for now?",
    initialValue: true,
  });

  if (isCancel(answer) || answer) {
    return;
  }

  runtime.warn("Skipping `mise install`. Run it manually after installing mise.");
}

export async function finalizeProject(
  options: InitOptions,
  runtime: InstallRuntime = defaultInstallRuntime,
): Promise<void> {
  await runtime.mkdir(options.destination, { recursive: true });
  await syncAgentsIfEnabled(options, runtime);

  if (options.gitInit) {
    await runtime.runCommand(["git", "init"], options.destination);
  }

  if (options.install) {
    await runtime.runCommand(["bun", "install"], options.destination, { env: bunInstallEnv() });
    await runtime.runCommand(["bun", "run", "prepare"], options.destination, {
      env: bunInstallEnv(),
    });
    await maybeInstallMiseWithRuntime(options, runtime);
  }
}
