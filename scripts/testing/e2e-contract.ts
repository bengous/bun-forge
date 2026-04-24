#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { objectField, readJsonObject } from "../../src/core/json.ts";
import { parseScenariosFromArgv, SCAFFOLD_SCENARIO_CONFIG } from "./scenarios.ts";

export type E2eContractScenario = ScaffoldScenario;

const DEFAULT_E2E_CONTRACT_SCENARIOS = [
  "none-ai",
  "none-effect",
  "tanstack-ai",
  "tanstack-ai-effect",
] as const satisfies readonly E2eContractScenario[];

async function run(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? "/tmp",
      BUN_INSTALL: process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
    },
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

export function e2eContractScenariosFromArgv(argv: readonly string[]): E2eContractScenario[] {
  return parseScenariosFromArgv(argv, DEFAULT_E2E_CONTRACT_SCENARIOS);
}

function expectExists(root: string, relativePath: string): void {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Expected generated path to exist: ${relativePath}`);
  }
}

function expectMissing(root: string, relativePath: string): void {
  if (existsSync(join(root, relativePath))) {
    throw new Error(`Expected generated path to be absent: ${relativePath}`);
  }
}

async function expectFileContains(
  root: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await Bun.file(join(root, relativePath)).text();
  if (!content.includes(expected)) {
    throw new Error(`Expected ${relativePath} to contain ${JSON.stringify(expected)}`);
  }
}

async function expectFileNotContains(
  root: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await Bun.file(join(root, relativePath)).text();
  if (content.includes(expected)) {
    throw new Error(`Expected ${relativePath} to exclude ${JSON.stringify(expected)}`);
  }
}

async function assertGeneratedProject(
  root: string,
  config: ScenarioConfig,
  projectName: string,
): Promise<void> {
  const packageJson = await readJsonObject(join(root, "package.json"));
  const packageScripts = objectField(packageJson, "scripts");
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();

  expectExists(root, "package.json");
  expectExists(root, "README.md");
  expectExists(root, "src/index.ts");
  expectExists(root, "src/index.test.ts");
  expectExists(root, "bunfig.toml");
  expectExists(root, "scripts/validation/validate.ts");

  await expectFileContains(root, "README.md", `# ${projectName}`);
  await expectFileContains(root, "src/index.ts", `export const projectName = "${projectName}"`);
  await expectFileContains(root, "README.md", "Hooks and validation");
  await expectFileContains(root, "README.md", "glob_matcher: doublestar");
  await expectFileContains(root, "lefthook.yml", "glob_matcher: doublestar");
  await expectFileContains(
    root,
    "lefthook.yml",
    "Keep these globs aligned with the repo surfaces they protect.",
  );
  if (lefthook.includes('glob: "src/**/*.ts,scripts/**/*.ts"')) {
    throw new Error("Expected Lefthook globs to use YAML lists, not CSV strings");
  }

  if (packageJson["name"] !== projectName) {
    throw new Error(
      `Expected root package name ${projectName}, got ${String(packageJson["name"])}`,
    );
  }
  if (packageScripts["test"] !== "bun test ./src") {
    throw new Error("Expected root test script to be `bun test ./src`");
  }

  expectMissing(root, "index.ts");
  expectMissing(root, "bun.lock");
  expectMissing(root, "node_modules");

  if (config.ai) {
    expectExists(root, "CLAUDE.md");
    expectExists(root, ".claude/rules/project-conventions.md");
    expectExists(root, "AGENTS.md");
    expectExists(root, "src/AGENTS.md");
    expectExists(root, ".agents/agents-md-manifest.json");
    expectExists(root, ".mcp.json");
    expectExists(root, ".codex/config.toml");
    expectExists(root, "scripts/validation/format-and-lint.ts");
    expectExists(root, "scripts/validation/validate-on-stop.ts");
    await expectFileContains(root, "CLAUDE.md", "Opinionated Bun project bootstrapped");
    await expectFileContains(
      root,
      ".claude/rules/project-conventions.md",
      "Keep `lefthook.yml` globs aligned with the repo surfaces they protect",
    );
    await expectFileContains(
      root,
      ".claude/rules/project-conventions.md",
      "If the repo layout changes, update Lefthook and validation scripts in the same change",
    );

    if (typeof packageScripts["agents:sync"] !== "string") {
      throw new TypeError("Expected agents:sync script for AI scenario");
    }
    if (typeof packageScripts["agents:check"] !== "string") {
      throw new TypeError("Expected agents:check script for AI scenario");
    }
  } else {
    expectMissing(root, "CLAUDE.md");
    expectMissing(root, ".claude");
    expectMissing(root, ".mcp.json");
    expectMissing(root, ".codex");
    expectMissing(root, "scripts/validation/format-and-lint.ts");
    expectMissing(root, "scripts/validation/validate-on-stop.ts");
    if (packageScripts["agents:sync"] !== undefined) {
      throw new Error("Did not expect agents:sync script without AI");
    }
  }

  if (config.effect) {
    await expectFileContains(root, "package.json", '"effect"');
    await expectFileContains(root, "package.json", '"@effect/cli"');
    await expectFileContains(root, "package.json", '"@effect/platform"');
    await expectFileContains(root, "package.json", '"@effect/platform-bun"');
    await expectFileContains(root, "package.json", '"@effect/language-service"');
    await expectFileContains(root, "package.json", '"effect:diagnose"');
    await expectFileContains(root, "package.json", '"effect:quickfixes"');
    await expectFileContains(root, "tsconfig.json", "@effect/language-service");
    await expectFileContains(root, "src/index.ts", "BunRuntime");
    await expectFileContains(root, "src/index.ts", "Effect.gen");
    await expectFileContains(root, "src/index.ts", "Context.Tag");
  } else {
    await expectFileNotContains(root, "package.json", '"effect"');
    await expectFileNotContains(root, "package.json", '"@effect/language-service"');
    await expectFileNotContains(root, "package.json", '"effect:diagnose"');
    await expectFileNotContains(root, "tsconfig.json", "plugins");
    await expectFileContains(root, "src/index.ts", "createGreeting");
  }

  if (config.frontend === "tanstack") {
    const frontendPackage = await readJsonObject(join(root, "apps/frontend/package.json"));
    const frontendScripts = objectField(frontendPackage, "scripts");

    expectExists(root, "apps/frontend/package.json");
    expectExists(root, "apps/frontend/src/routes/index.tsx");
    expectExists(root, "apps/frontend/src/routes/-index.test.tsx");
    expectExists(root, "apps/frontend/src/routeTree.gen.ts");

    await expectFileContains(root, "apps/frontend/src/routes/index.tsx", projectName);
    await expectFileContains(root, "apps/frontend/src/routes/index.tsx", "normalized by bun-forge");
    await expectFileNotContains(root, "apps/frontend/src/routes/index.tsx", "Welcome to TanStack");
    await expectFileContains(root, "lefthook.yml", "frontend-oxc:");
    await expectFileContains(root, "lefthook.yml", '- "apps/frontend/**/*.{ts,tsx}"');

    expectMissing(root, "apps/frontend/.cta.json");
    expectMissing(root, "apps/frontend/.vscode");
    expectMissing(root, "apps/frontend/README.md");
    expectMissing(root, "apps/frontend/public");
    expectMissing(root, "apps/frontend/src/components");
    expectMissing(root, "apps/frontend/src/router.tsx");
    expectMissing(root, "apps/frontend/src/routes/about.tsx");

    if (!Array.isArray(packageJson["workspaces"]) || packageJson["workspaces"][0] !== "apps/*") {
      throw new Error("Expected root workspaces to include apps/* for TanStack scenario");
    }
    if (typeof packageScripts["validate:frontend"] !== "string") {
      throw new TypeError("Expected validate:frontend script for TanStack scenario");
    }
    if (frontendScripts["test"] !== "vitest run --environment jsdom") {
      throw new Error("Expected frontend test script to use Vitest + jsdom");
    }

    if (config.ai) {
      expectExists(root, "apps/frontend/src/AGENTS.md");
      expectExists(root, ".claude/rules/frontend-conventions.md");
    } else {
      expectMissing(root, "apps/frontend/src/AGENTS.md");
    }
  } else {
    expectMissing(root, "apps/frontend");
    await expectFileNotContains(root, "lefthook.yml", "frontend-oxc:");
    await expectFileNotContains(root, "lefthook.yml", "apps/frontend/**/*.{ts,tsx}");
    if (packageJson["workspaces"] !== undefined) {
      throw new Error("Did not expect root workspaces without frontend");
    }
    if (packageScripts["validate:frontend"] !== undefined) {
      throw new Error("Did not expect validate:frontend script without frontend");
    }
  }
}

export async function e2eContract(
  frontend: "none" | "tanstack",
  ai: boolean,
  effect: boolean,
  scenario: E2eContractScenario,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `bun-forge-e2e-contract-${scenario}-`));
  const projectName = `forge-e2e-${scenario}`;

  try {
    await run(
      [
        "bun",
        "run",
        "src/index.ts",
        dir,
        "--yes",
        "--name",
        projectName,
        "--frontend",
        frontend,
        "--ai",
        String(ai),
        "--effect",
        String(effect),
        "--git-init",
        "false",
        "--install",
        "false",
      ],
      process.cwd(),
    );

    await assertGeneratedProject(dir, { frontend, ai, effect }, projectName);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const scenario of e2eContractScenariosFromArgv(process.argv)) {
    const config = SCAFFOLD_SCENARIO_CONFIG[scenario];
    await e2eContract(config.frontend, config.ai, config.effect, scenario);
  }
}
