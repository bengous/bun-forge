#!/usr/bin/env bun

import {
  extractTouchedPaths,
  forbiddenTouchedPaths,
  readHookInput,
  recordTouchedPaths,
  repoRoot,
} from "./lib";

const input = await readHookInput();
const paths = extractTouchedPaths(input, repoRoot(input));
const forbidden = forbiddenTouchedPaths(paths);

if (forbidden.length > 0) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Generated files must not be edited directly: ${forbidden.join(
          ", ",
        )}. Edit the source file and run the matching generator.`,
      },
    }),
  );
  process.exit(0);
}

await recordTouchedPaths(input, paths);
