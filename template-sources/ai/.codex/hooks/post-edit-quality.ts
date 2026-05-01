#!/usr/bin/env bun

import { readHookInput, runPostEditQuality } from "./lib";

const result = await runPostEditQuality(await readHookInput());

if (result.blockReason !== undefined) {
  console.log(
    JSON.stringify({
      decision: "block",
      reason: result.blockReason,
    }),
  );
  process.exit(0);
}

if (result.systemMessage !== undefined) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: result.systemMessage,
      },
    }),
  );
}
