#!/usr/bin/env bun

// This wrapper is byte-synced while Codex and Claude share the same hook I/O
// envelope. If the protocols diverge, split wrappers and keep the core synced.
import { checkCommand, checkMergeGuard, parseHookInput } from "./guard-destructive-core.ts";

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const command = parseHookInput(input);
  if (command === null) {
    process.exit(0);
  }

  const match = checkCommand(command) ?? checkMergeGuard(command);
  if (match !== null) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Destructive command blocked: ${match}\nCommand: ${command}`,
        },
      }),
    );
  }
}
