import { expect, test } from "bun:test";

const RUN_READ_ONLY_COMMANDS = process.env["KITSMITH_RUN_READ_ONLY_COMMANDS"] === "1";

type CommandResult = {
  readonly exitCode: number;
  readonly output: string;
};

function assertTrackedDiffUnchanged(commandLabel: string, before: string, after: string): void {
  if (before !== after) {
    throw new Error(`${commandLabel} modified tracked files`);
  }
}

async function runCommand(command: readonly string[], env = process.env): Promise<CommandResult> {
  const proc = Bun.spawn([...command], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  return { exitCode, output: [stdout, stderr].filter(Boolean).join("\n").trim() };
}

async function trackedDiff(): Promise<string> {
  const result = await runCommand(["git", "diff", "--binary", "--no-ext-diff", "HEAD", "--"]);
  if (result.exitCode !== 0) {
    throw new Error(result.output || "git diff failed");
  }
  return result.output;
}

async function expectReadOnlyCommand(command: readonly string[]): Promise<void> {
  const label = command.join(" ");
  const before = await trackedDiff();
  const result = await runCommand(command, {
    ...process.env,
    KITSMITH_RUN_READ_ONLY_COMMANDS: "0",
  });
  const after = await trackedDiff();

  assertTrackedDiffUnchanged(label, before, after);
  expect(result.exitCode, result.output).toBe(0);
}

test("tracked diff guard detects read-only command mutations", () => {
  expect(() => assertTrackedDiffUnchanged("mutating command", "before", "after")).toThrow(
    "mutating command modified tracked files",
  );
});

test.skipIf(!RUN_READ_ONLY_COMMANDS)("check does not modify tracked files", async () => {
  await expectReadOnlyCommand(["bun", "run", "--silent", "check"]);
});

test.skipIf(!RUN_READ_ONLY_COMMANDS)("validate does not modify tracked files", async () => {
  await expectReadOnlyCommand(["bun", "run", "--silent", "validate"]);
});
