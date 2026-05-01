#!/usr/bin/env bun

import { CODE_PATTERN, classifyScopes, expandConfigScope, getChangedFiles } from "./detect-scope";
import { resolveProjectRoot } from "./resolve-bin";

type StopHookInput = {
  readonly stop_hook_active?: boolean;
};

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

async function readStopHookInput(): Promise<StopHookInput> {
  const text = await Bun.stdin.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "stop_hook_active" in parsed &&
      typeof parsed.stop_hook_active === "boolean"
    ) {
      return { stop_hook_active: parsed.stop_hook_active };
    }
  } catch {
    return {};
  }

  return {};
}

async function hasPackageScript(projectRoot: string, scriptName: string): Promise<boolean> {
  try {
    const packageJson = (await Bun.file(`${projectRoot}/package.json`).json()) as unknown;
    return (
      typeof packageJson === "object" &&
      packageJson !== null &&
      "scripts" in packageJson &&
      typeof packageJson.scripts === "object" &&
      packageJson.scripts !== null &&
      scriptName in packageJson.scripts
    );
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const hookInput = await readStopHookInput();
  if (hookInput.stop_hook_active === true) {
    process.exit(0);
  }

  const projectRoot = resolveProjectRoot(import.meta.dir);
  const files = await getChangedFiles("working");
  const codeFiles = files.filter((file) => CODE_PATTERN.test(file));

  if (codeFiles.length === 0) {
    process.exit(0);
  }

  const scopes = expandConfigScope(classifyScopes(codeFiles));
  const errors: string[] = [];

  if (scopes.has("backend") || scopes.has("scripts")) {
    run("typecheck", ["bun", "run", "--silent", "typecheck"], projectRoot, errors);
    run("lint:errors", ["bun", "run", "--silent", "lint:errors"], projectRoot, errors);
  }

  if (scopes.has("backend") || scopes.has("scripts") || scopes.has("product")) {
    run("format:check", ["bun", "run", "--silent", "format:check"], projectRoot, errors);
  }

  if (scopes.has("product")) {
    run(
      "test:project-contract",
      ["bun", "run", "--silent", "test:project-contract"],
      projectRoot,
      errors,
    );
  }

  if (scopes.has("config") && (await hasPackageScript(projectRoot, "agents:check"))) {
    run("agents:check", ["bun", "run", "--silent", "agents:check"], projectRoot, errors);
  }

  if (errors.length > 0) {
    process.stderr.write(`Validation failed:\n${errors.join("\n\n")}\n`);
    process.exit(2);
  }
}

if (import.meta.main) {
  await main();
}
