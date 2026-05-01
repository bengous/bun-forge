#!/usr/bin/env bun

import { readHookInput, runStopValidation } from "./lib";

const result = await runStopValidation(await readHookInput());

if (result.blockReason !== undefined) {
  console.log(
    JSON.stringify({
      decision: "block",
      reason: result.blockReason,
    }),
  );
  process.exit(0);
}

console.log(
  JSON.stringify({
    continue: true,
    ...(result.systemMessage === undefined ? {} : { systemMessage: result.systemMessage }),
  }),
);
