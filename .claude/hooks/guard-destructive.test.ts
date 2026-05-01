import { describe, expect, test } from "bun:test";

const SCRIPT_PATH = `${import.meta.dir}/guard-destructive.ts`;

async function runGuard(command: string): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const proc = Bun.spawn([process.execPath, SCRIPT_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.stdin.write(JSON.stringify({ tool_input: { command } }));
  await proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseHookOutput(stdout: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    throw new Error("hook output must be an object");
  }
  const hookOutput = parsed["hookSpecificOutput"];
  if (!isRecord(hookOutput)) {
    throw new Error("hook output must include hookSpecificOutput");
  }
  return hookOutput;
}

describe("destructive command guard wrapper", () => {
  test("denies destructive commands using the PreToolUse envelope", async () => {
    const result = await runGuard("git push --force");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const hookOutput = parseHookOutput(result.stdout);
    expect(hookOutput["hookEventName"]).toBe("PreToolUse");
    expect(hookOutput["permissionDecision"]).toBe("deny");
    expect(hookOutput["permissionDecisionReason"]).toBe(
      "Destructive command blocked: git push --force\nCommand: git push --force",
    );
  });

  test("allows non-destructive commands without output", async () => {
    const result = await runGuard("git status");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
});
