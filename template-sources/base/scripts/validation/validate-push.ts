#!/usr/bin/env bun

import { expandConfigScope, getChangedScopes } from "./detect-scope";
import { resolveProjectRoot } from "./resolve-bin";
import { GENERATED_PROJECT_PUSH_VALIDATION_POLICY } from "./validation-plan.ts";

async function main(): Promise<void> {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const scopes = expandConfigScope(await getChangedScopes("push"));

  if (scopes.size === 0) {
    console.log("No scoped changes detected, skipping validation.");
    process.exit(0);
  }

  const errors: string[] = [];

  async function runScript(script: string): Promise<void> {
    const result = await Bun.$`bun run --silent ${script}`.cwd(projectRoot).nothrow().quiet();
    if (result.exitCode !== 0) {
      const output = [result.stderr.toString(), result.stdout.toString()]
        .filter(Boolean)
        .join("\n")
        .trim();
      errors.push(`[${script}] ${output || `exited with code ${result.exitCode}`}`);
    }
  }

  async function runSteps(steps: readonly string[]): Promise<void> {
    await steps.reduce(async (previous, step) => {
      await previous;
      await runScript(step);
    }, Promise.resolve());
  }

  if (scopes.has("backend") || scopes.has("scripts")) {
    await runSteps(GENERATED_PROJECT_PUSH_VALIDATION_POLICY.codeSteps);
  }
  if (scopes.has("frontend")) {
    await runSteps(GENERATED_PROJECT_PUSH_VALIDATION_POLICY.frontendSteps);
  }

  if (errors.length > 0) {
    console.error(`Push validation failed:\n\n${errors.join("\n\n")}`);
    process.exit(1);
  }

  console.log(`Push validation passed (scopes: ${[...scopes].join(", ")}).`);
}

if (import.meta.main) {
  await main();
}
