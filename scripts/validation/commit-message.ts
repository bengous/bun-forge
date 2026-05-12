#!/usr/bin/env bun

import { commitTypes } from "../../commitlint.config.js";

const messageFile = Bun.argv[2];

function printGuidance(): void {
  console.error("");
  console.error("Commit message rejected.");
  console.error("");
  console.error("Use Conventional Commits with a concrete title:");
  console.error("  <type>(optional-scope): <imperative summary>");
  console.error("");
  console.error("Allowed types:");
  console.error(`  ${commitTypes.join(", ")}`);
  console.error("");
  console.error("Good examples:");
  console.error("  feat(generator): add commit message guardrails");
  console.error("  fix(cli): preserve existing commit hooks");
  console.error("  chore(tooling): update validation hooks");
  console.error("");
  console.error("Agents: rewrite the commit message. Do not bypass this hook.");
  console.error(
    "When the title does not explain the product impact, add a body that explains why.",
  );
}

if (messageFile === undefined) {
  console.error("Missing commit message file path.");
  printGuidance();
  process.exit(1);
}

const commitlint =
  process.platform === "win32"
    ? "./node_modules/.bin/commitlint.cmd"
    : "./node_modules/.bin/commitlint";
const result = Bun.spawnSync([commitlint, "--edit", messageFile], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = result.stdout.toString().trim();
const stderr = result.stderr.toString().trim();
if (stdout.length > 0) {
  console.error(stdout);
}
if (stderr.length > 0) {
  console.error(stderr);
}

if (result.exitCode !== 0) {
  printGuidance();
  process.exit(result.exitCode);
}
