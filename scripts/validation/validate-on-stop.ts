#!/usr/bin/env bun

import { CODE_PATTERN, classifyScopes, expandConfigScope, getChangedFiles } from "./detect-scope";
import { resolveBin, resolveProjectRoot } from "./resolve-bin";

function run(label: string, cmd: string[], cwd: string, errors: string[]): void {
  const result = Bun.spawnSync(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const output = [result.stderr.toString(), result.stdout.toString()]
      .filter(Boolean)
      .join("\n")
      .trim();
    errors.push(`[${label}] ${output || `exited with code ${result.exitCode}`}`);
  }
}

async function main(): Promise<void> {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const files = await getChangedFiles("working");
  const codeFiles = files.filter((file) => CODE_PATTERN.test(file));

  if (codeFiles.length === 0) {
    process.exit(0);
  }

  const scopes = expandConfigScope(classifyScopes(codeFiles));
  const oxlint = resolveBin(projectRoot, "oxlint");
  const oxfmt = resolveBin(projectRoot, "oxfmt");
  const errors: string[] = [];

  if (scopes.has("backend") || scopes.has("scripts")) {
    run(
      "lint:errors",
      [oxlint, "-c", ".oxlintrc.jsonc", "--quiet", "--format=unix", "src/", "scripts/"],
      projectRoot,
      errors,
    );
    run(
      "format:check",
      [oxfmt, "--check", "-c", ".oxfmtrc.jsonc", "src/", "scripts/"],
      projectRoot,
      errors,
    );
  }

  if (errors.length > 0) {
    process.stderr.write(`Validation failed:\n${errors.join("\n\n")}\n`);
    process.exit(2);
  }
}

if (import.meta.main) {
  await main();
}
