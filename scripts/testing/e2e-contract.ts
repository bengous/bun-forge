#!/usr/bin/env bun

import type { ScaffoldScenario } from "./scenarios.ts";
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
  "tanstack-ai-frontend",
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
  config: {
    readonly backend: boolean;
    readonly frontend: "none" | "tanstack";
    readonly ai: boolean;
    readonly effect: boolean;
  },
  projectName: string,
): Promise<void> {
  const packageJson = await readJsonObject(join(root, "package.json"));
  const packageScripts = objectField(packageJson, "scripts");
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();

  expectExists(root, "package.json");
  expectExists(root, "README.md");
  expectExists(root, "bunfig.toml");
  expectExists(root, "scripts/validation/validate.ts");
  expectExists(root, "knip.jsonc");

  await expectFileContains(root, "README.md", `# ${projectName}`);
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
  expectMissing(root, "index.ts");
  expectMissing(root, "bun.lock");
  expectMissing(root, "node_modules");

  if (config.backend) {
    expectExists(root, "src/index.ts");
    expectExists(root, "src/index.test.ts");
    await expectFileContains(root, "src/index.ts", `export const projectName = "${projectName}"`);
    const expectedTestScript = config.ai
      ? "bun test ./src && bun run test:hooks"
      : "bun test ./src";
    if (packageScripts["test"] !== expectedTestScript) {
      throw new Error(`Expected root test script to be ${JSON.stringify(expectedTestScript)}`);
    }
  } else {
    expectMissing(root, "src/index.ts");
    expectMissing(root, "src/index.test.ts");
    if (packageJson["bin"] !== undefined) {
      throw new Error("Did not expect a root bin for frontend-only scenario");
    }
    if (packageScripts["dev"] !== "bun run dev:frontend") {
      throw new Error("Expected frontend-only dev script to delegate to the frontend workspace");
    }
    if (packageScripts["test"] !== "bun run test:unit && bun run test:hooks") {
      throw new Error("Expected frontend-only test script to run frontend unit tests and hooks");
    }
  }

  if (config.ai) {
    expectExists(root, "CLAUDE.md");
    expectExists(root, ".claude/rules/project-conventions.md");
    expectExists(root, "AGENTS.md");
    if (config.backend) {
      expectExists(root, "src/AGENTS.md");
    } else {
      expectMissing(root, "src/AGENTS.md");
    }
    expectExists(root, ".agents/agents-md-manifest.json");
    expectExists(root, ".mcp.json");
    expectExists(root, ".codex/config.toml");
    expectMissing(root, ".codex/hooks.json");
    expectExists(root, ".codex/hooks/guard-destructive.ts");
    expectExists(root, ".codex/hooks/guard-destructive.test.ts");
    expectExists(root, ".codex/hooks/guard-edit-paths.ts");
    expectExists(root, ".codex/hooks/post-edit-quality.ts");
    expectExists(root, ".codex/hooks/stop-validate.ts");
    expectExists(root, ".codex/hooks/lib.ts");
    expectExists(root, ".codex/hooks/lib.test.ts");
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
    await expectFileContains(root, ".codex/config.toml", "git rev-parse --show-toplevel");
    await expectFileContains(root, ".codex/config.toml", ".codex/hooks/guard-destructive.ts");
    await expectFileNotContains(root, ".codex/config.toml", "CLAUDE_PROJECT_DIR");
    await expectFileNotContains(root, ".codex/config.toml", "hooks.json");
    await expectFileContains(root, ".claude/settings.json", "$CLAUDE_PROJECT_DIR");
    await expectFileNotContains(root, ".claude/settings.json", ".codex/");
    await expectFileContains(
      root,
      ".dependency-cruiser.cjs",
      "^\\\\.codex/hooks/guard-destructive\\\\.ts$",
    );
    await expectFileNotContains(root, ".dependency-cruiser.cjs", '"^\\\\.codex/hooks/",');

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
    if (config.backend) {
      await expectFileContains(root, "src/index.ts", "BunRuntime");
      await expectFileContains(root, "src/index.ts", "Effect.gen");
      await expectFileContains(root, "src/index.ts", "Context.Tag");
    }
  } else {
    await expectFileNotContains(root, "package.json", '"effect"');
    await expectFileNotContains(root, "package.json", '"@effect/language-service"');
    await expectFileNotContains(root, "package.json", '"effect:diagnose"');
    await expectFileNotContains(root, "tsconfig.json", "plugins");
    if (config.backend) {
      await expectFileContains(root, "src/index.ts", "createGreeting");
    }
  }

  if (config.frontend === "tanstack") {
    const frontendPackage = await readJsonObject(join(root, "apps/frontend/package.json"));
    const frontendScripts = objectField(frontendPackage, "scripts");

    expectExists(root, "apps/frontend/package.json");
    expectExists(root, "apps/frontend/src/routes/index.tsx");
    expectExists(root, "apps/frontend/src/routes/-index.test.tsx");
    expectExists(root, "apps/frontend/src/routeTree.gen.ts");
    expectExists(root, "apps/frontend/src/testing/setup.ts");
    expectExists(root, "apps/frontend/playwright.config.ts");
    expectExists(root, "apps/frontend/e2e/home.spec.ts");

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
    if (!packageScripts["validate:frontend"].includes("test:e2e")) {
      throw new Error("Expected validate:frontend to include Playwright e2e");
    }
    if (frontendScripts["test"] !== "vitest run --environment jsdom") {
      throw new Error("Expected frontend test script to use Vitest + jsdom");
    }
    if (
      frontendScripts["lint"] !==
      "oxlint --type-aware -c .oxlintrc.jsonc --format=unix src/ e2e/ vite.config.ts playwright.config.ts"
    ) {
      throw new Error("Expected frontend lint script to cover source, e2e, and config files");
    }
    if (
      frontendScripts["format:check"] !==
      "oxfmt --check -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts"
    ) {
      throw new Error("Expected frontend format check to cover source, e2e, and config files");
    }
    await expectFileContains(
      root,
      "apps/frontend/.oxlintrc.jsonc",
      '"files": ["vite.config.ts", "playwright.config.ts"]',
    );
    await expectFileContains(
      root,
      "apps/frontend/.oxlintrc.jsonc",
      '"import/no-default-export": "off"',
    );

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
  backend: boolean,
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
        "--backend",
        String(backend),
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

    await assertGeneratedProject(dir, { backend, frontend, ai, effect }, projectName);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const scenario of e2eContractScenariosFromArgv(process.argv)) {
    const config = SCAFFOLD_SCENARIO_CONFIG[scenario];
    await e2eContract(config.backend, config.frontend, config.ai, config.effect, scenario);
  }
}
