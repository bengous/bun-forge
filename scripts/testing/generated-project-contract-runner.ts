import type { GeneratedProjectDescription } from "../../src/core/generated-project-contract.ts";
import type { JsonObject } from "../../src/core/json.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { objectField, readJsonObject } from "../../src/core/json.ts";

function assertPathExists(root: string, relativePath: string): void {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Expected generated path to exist: ${relativePath}`);
  }
}

function assertPathMissing(root: string, relativePath: string): void {
  if (existsSync(join(root, relativePath))) {
    throw new Error(`Expected generated path to be absent: ${relativePath}`);
  }
}

function formatUnknown(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  const serialized = JSON.stringify(value);
  return serialized ?? `[${typeof value}]`;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${label} to be ${formatUnknown(expected)}, got ${formatUnknown(actual)}`,
    );
  }
}

function assertUndefined(actual: unknown, label: string): void {
  if (actual !== undefined) {
    throw new Error(`Expected ${label} to be absent, got ${formatUnknown(actual)}`);
  }
}

function assertDefined(actual: unknown, label: string): void {
  if (actual === undefined) {
    throw new Error(`Expected ${label} to be defined`);
  }
}

function assertObjectHasKey(source: JsonObject, key: string, label: string): void {
  if (source[key] === undefined) {
    throw new Error(`Expected ${label} to include ${key}`);
  }
}

function assertDependencyVersion(
  source: JsonObject,
  packageName: string,
  expectedVersion: string,
  label: string,
): void {
  assertEqual(source[packageName], expectedVersion, `${label} ${packageName}`);
}

async function assertFileContains(
  root: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await Bun.file(join(root, relativePath)).text();
  if (!content.includes(expected)) {
    throw new Error(`Expected ${relativePath} to contain ${JSON.stringify(expected)}`);
  }
}

async function assertFileExcludes(
  root: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await Bun.file(join(root, relativePath)).text();
  if (content.includes(expected)) {
    throw new Error(`Expected ${relativePath} to exclude ${JSON.stringify(expected)}`);
  }
}

function assertGeneratedFileSet(root: string, description: GeneratedProjectDescription): void {
  const generatedPaths = new Set(description.generatedFileSpecs.map((spec) => spec.relativePath));

  for (const spec of description.generatedFileSpecs) {
    assertPathExists(root, spec.relativePath);
  }

  for (const relativePath of description.cleanupPaths) {
    if (generatedPaths.has(relativePath)) {
      continue;
    }
    assertPathMissing(root, relativePath);
  }
}

async function assertRootContract(
  root: string,
  description: GeneratedProjectDescription,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const projectName = description.templateContext.projectName;
  const packageName = description.templateContext.packageName;
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();
  const devDependencies = objectField(packageJson, "devDependencies");

  assertPathExists(root, "package.json");
  assertPathExists(root, "README.md");
  assertPathExists(root, "bunfig.toml");
  assertPathExists(root, "scripts/validation/validate.ts");
  assertPathExists(root, "knip.jsonc");
  assertPathExists(root, "scripts/quality/check-links-local.ts");

  await assertFileContains(root, "README.md", `# ${projectName}`);
  await assertFileContains(root, "README.md", "Hooks and validation");
  await assertFileContains(root, "README.md", "glob_matcher: doublestar");
  await assertFileContains(root, "lefthook.yml", "glob_matcher: doublestar");
  await assertFileContains(
    root,
    "lefthook.yml",
    "Keep these globs aligned with the repo surfaces they protect.",
  );
  if (lefthook.includes('glob: "src/**/*.ts,scripts/**/*.ts"')) {
    throw new Error("Expected Lefthook globs to use YAML lists, not CSV strings");
  }

  assertEqual(packageJson["name"], packageName, "root package name");
  assertDependencyVersion(devDependencies, "@types/bun", "1.3.13", "root devDependencies");
  assertDependencyVersion(devDependencies, "dependency-cruiser", "17.4.0", "root devDependencies");
  assertDependencyVersion(devDependencies, "jscpd", "4.0.9", "root devDependencies");
  assertDependencyVersion(devDependencies, "knip", "6.12.0", "root devDependencies");
  assertDependencyVersion(devDependencies, "lefthook", "2.1.6", "root devDependencies");
  assertDependencyVersion(devDependencies, "oxfmt", "0.48.0", "root devDependencies");
  assertDependencyVersion(devDependencies, "oxlint", "1.63.0", "root devDependencies");
  assertDependencyVersion(
    devDependencies,
    "oxlint-plugin-complexity",
    "2.1.2",
    "root devDependencies",
  );
  assertDependencyVersion(devDependencies, "oxlint-tsgolint", "0.22.1", "root devDependencies");
  assertDependencyVersion(devDependencies, "typescript", "6.0.3", "root devDependencies");
  assertEqual(
    packageScripts["check:links"],
    "bun scripts/quality/check-links-local.ts",
    "check:links script",
  );
  assertPathMissing(root, "index.ts");
  assertPathMissing(root, "bun.lock");
  assertPathMissing(root, "node_modules");
}

async function assertBackendContract(
  root: string,
  description: GeneratedProjectDescription,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const { ai, backend, effect } = description.shape;
  const projectName = description.templateContext.projectName;
  const tsconfig = await Bun.file(join(root, "tsconfig.json")).text();
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();

  if (backend) {
    assertPathExists(root, "src/index.ts");
    assertPathExists(root, "src/index.test.ts");
    assertDefined(packageJson["bin"], "root bin");
    assertEqual(
      packageScripts["test"],
      ai ? "bun test ./src && bun run test:hooks" : "bun test ./src",
      "root test script",
    );
    if (!lefthook.includes('- "src/**/*.ts"')) {
      throw new Error('Expected Lefthook to include the backend "src/**/*.ts" glob');
    }
    await assertFileContains(root, "src/index.ts", `export const projectName = "${projectName}"`);

    if (effect) {
      await assertFileContains(root, "src/index.ts", "Context.Tag");
      await assertFileContains(root, "src/index.ts", "BunRuntime.runMain");
      await assertFileContains(root, "src/index.ts", "Effect.gen");
    } else {
      await assertFileContains(root, "src/index.ts", "export function createGreeting");
      await assertFileContains(root, "src/index.ts", "console.log(createGreeting())");
    }
    return;
  }

  assertUndefined(packageJson["bin"], "root bin");
  assertEqual(packageScripts["dev"], "bun run dev:frontend", "frontend-only dev script");
  assertEqual(
    packageScripts["test"],
    "bun run test:unit && bun run test:hooks",
    "frontend-only test script",
  );
  assertEqual(packageScripts["test:unit"], "cd apps/frontend && bun run test", "test:unit script");
  assertPathMissing(root, "src/index.ts");
  assertPathMissing(root, "src/index.test.ts");
  if (lefthook.includes('- "src/**/*.ts"')) {
    throw new Error('Did not expect Lefthook to include the backend "src/**/*.ts" glob');
  }
  if (tsconfig.includes('"src/**/*.ts"')) {
    throw new Error('Did not expect frontend-only tsconfig to include "src/**/*.ts"');
  }
}

async function assertEffectContract(
  root: string,
  description: GeneratedProjectDescription,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const dependencies = objectField(packageJson, "dependencies");
  const devDependencies = objectField(packageJson, "devDependencies");
  const tsconfig = await Bun.file(join(root, "tsconfig.json")).text();

  if (description.shape.effect) {
    assertPathExists(root, ".gitkeep");
    assertObjectHasKey(dependencies, "effect", "dependencies");
    assertObjectHasKey(dependencies, "@effect/cli", "dependencies");
    assertObjectHasKey(dependencies, "@effect/platform", "dependencies");
    assertObjectHasKey(dependencies, "@effect/platform-bun", "dependencies");
    assertObjectHasKey(devDependencies, "@effect/language-service", "devDependencies");
    assertDependencyVersion(dependencies, "effect", "3.21.2", "dependencies");
    assertDependencyVersion(dependencies, "@effect/cli", "0.75.1", "dependencies");
    assertDependencyVersion(dependencies, "@effect/platform", "0.96.1", "dependencies");
    assertDependencyVersion(dependencies, "@effect/platform-bun", "0.89.0", "dependencies");
    assertDependencyVersion(
      devDependencies,
      "@effect/language-service",
      "0.85.1",
      "devDependencies",
    );
    assertDefined(packageScripts["effect:diagnose"], "effect:diagnose script");
    assertDefined(packageScripts["effect:quickfixes"], "effect:quickfixes script");
    if (!tsconfig.includes("@effect/language-service")) {
      throw new Error("Expected tsconfig to include @effect/language-service");
    }
    return;
  }

  assertUndefined(packageJson["dependencies"], "dependencies");
  assertUndefined(packageScripts["effect:diagnose"], "effect:diagnose script");
  if (tsconfig.includes("plugins")) {
    throw new Error("Did not expect tsconfig plugins without Effect");
  }
}

async function assertAiContract(
  root: string,
  description: GeneratedProjectDescription,
  packageScripts: JsonObject,
): Promise<void> {
  const { ai, backend } = description.shape;

  if (!ai) {
    assertPathMissing(root, "CLAUDE.md");
    assertPathMissing(root, ".claude");
    assertPathMissing(root, ".mcp.json");
    assertPathMissing(root, ".codex");
    assertPathMissing(root, "scripts/validation/format-and-lint.ts");
    assertPathMissing(root, "scripts/validation/validate-on-stop.ts");
    assertUndefined(packageScripts["agents:sync"], "agents:sync script");
    return;
  }

  assertPathExists(root, "CLAUDE.md");
  assertPathExists(root, ".claude/rules/project-conventions.md");
  assertPathExists(root, "AGENTS.md");
  if (backend) {
    assertPathExists(root, "src/AGENTS.md");
  } else {
    assertPathMissing(root, "src/AGENTS.md");
  }
  assertPathExists(root, ".agents/agents-md-manifest.json");
  assertPathExists(root, ".mcp.json");
  assertPathExists(root, ".codex/config.toml");
  assertPathMissing(root, ".codex/hooks.json");
  assertPathExists(root, ".codex/hooks/guard-destructive.ts");
  assertPathExists(root, ".codex/hooks/guard-destructive.test.ts");
  assertPathExists(root, ".codex/hooks/guard-edit-paths.ts");
  assertPathExists(root, ".codex/hooks/post-edit-quality.ts");
  assertPathExists(root, ".codex/hooks/stop-validate.ts");
  assertPathExists(root, ".codex/hooks/lib.ts");
  assertPathExists(root, ".codex/hooks/lib.test.ts");
  assertPathExists(root, ".claude/hooks/guard-destructive.ts");
  assertPathExists(root, ".claude/hooks/guard-destructive.test.ts");
  assertPathExists(root, "scripts/validation/format-and-lint.ts");
  assertPathExists(root, "scripts/validation/validate-on-stop.ts");

  await assertFileContains(root, "CLAUDE.md", "Opinionated Bun project bootstrapped");
  await assertFileContains(
    root,
    ".claude/rules/project-conventions.md",
    "Keep `lefthook.yml` globs aligned with the repo surfaces they protect",
  );
  await assertFileContains(
    root,
    ".claude/rules/project-conventions.md",
    "If the repo layout changes, update Lefthook and validation scripts in the same change",
  );
  await assertFileContains(root, ".codex/config.toml", "git rev-parse --show-toplevel");
  await assertFileContains(root, ".codex/config.toml", ".codex/hooks/guard-destructive.ts");
  await assertFileContains(
    root,
    ".codex/config.toml",
    'matcher = "^(apply_patch|Edit|Write|MultiEdit)$"',
  );
  await assertFileContains(root, ".codex/config.toml", "timeout = 90");
  await assertFileContains(root, ".codex/config.toml", "timeout = 240");
  await assertFileExcludes(root, ".codex/config.toml", "CLAUDE_PROJECT_DIR");
  await assertFileExcludes(root, ".codex/config.toml", "hooks.json");
  await assertFileExcludes(root, ".codex/config.toml", 'matcher = "^(apply_patch|Edit|Write)$"');
  await assertFileExcludes(root, ".codex/config.toml", "timeout = 45");
  await assertFileExcludes(root, ".codex/config.toml", "timeout = 180");
  assertPathExists(root, ".codex/hooks/guard-destructive-core.ts");
  assertPathExists(root, ".codex/hooks/guard-destructive-core.test.ts");
  assertPathExists(root, ".claude/hooks/guard-destructive-core.ts");
  assertPathExists(root, ".claude/hooks/guard-destructive-core.test.ts");
  await assertFileContains(
    root,
    ".codex/hooks/guard-destructive.ts",
    "./guard-destructive-core.ts",
  );
  await assertFileContains(
    root,
    ".claude/hooks/guard-destructive.ts",
    "./guard-destructive-core.ts",
  );
  await assertFileContains(root, ".codex/hooks/lib.ts", "stop_hook_active");
  await assertFileContains(root, ".claude/settings.json", "$CLAUDE_PROJECT_DIR");
  await assertFileExcludes(root, ".claude/settings.json", ".codex/");
  await assertFileContains(root, "lefthook.yml", '- ".codex/hooks/**/*.ts"');
  await assertFileContains(root, "lefthook.yml", '- ".claude/hooks/**/*.ts"');
  await assertFileContains(root, "tsconfig.json", '".codex/hooks/**/*.ts"');
  await assertFileContains(root, "tsconfig.json", '".claude/hooks/**/*.ts"');
  await assertFileContains(
    root,
    ".dependency-cruiser.cjs",
    "^\\\\.codex/hooks/(guard-destructive|guard-edit-paths|post-edit-quality|stop-validate)\\\\.ts$",
  );
  await assertFileContains(
    root,
    ".dependency-cruiser.cjs",
    "^\\\\.claude/hooks/guard-destructive\\\\.ts$",
  );
  await assertFileExcludes(root, ".dependency-cruiser.cjs", '"^\\\\.codex/hooks/",');

  assertDefined(packageScripts["agents:sync"], "agents:sync script");
  assertDefined(packageScripts["agents:check"], "agents:check script");
  assertEqual(
    packageScripts["test:hooks"],
    "bun test ./.codex/hooks ./.claude/hooks",
    "test:hooks script",
  );
}

async function assertFrontendContract(
  root: string,
  description: GeneratedProjectDescription,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const { ai, frontend } = description.shape;
  const projectName = description.templateContext.projectName;

  if (frontend !== "tanstack") {
    assertPathMissing(root, "apps/frontend");
    await assertFileExcludes(root, "lefthook.yml", "frontend-oxc:");
    await assertFileExcludes(root, "lefthook.yml", "apps/frontend/**/*.{ts,tsx}");
    assertUndefined(packageJson["workspaces"], "workspaces");
    assertUndefined(packageScripts["validate:frontend"], "validate:frontend script");
    return;
  }

  const frontendPackage = await readJsonObject(join(root, "apps/frontend/package.json"));
  const frontendScripts = objectField(frontendPackage, "scripts");
  const frontendDependencies = objectField(frontendPackage, "dependencies");
  const frontendDevDependencies = objectField(frontendPackage, "devDependencies");
  const workspaces = packageJson["workspaces"];

  if (!Array.isArray(workspaces) || workspaces.length !== 1 || workspaces[0] !== "apps/*") {
    throw new Error('Expected root workspaces to equal ["apps/*"] for TanStack scenario');
  }
  const validateFrontend = packageScripts["validate:frontend"];
  if (typeof validateFrontend !== "string") {
    throw new TypeError("Expected validate:frontend script for TanStack scenario");
  }
  if (!validateFrontend.includes("bun run --silent test")) {
    throw new Error("Expected validate:frontend to run frontend tests");
  }
  if (!validateFrontend.includes("bun run --silent test:e2e")) {
    throw new Error("Expected validate:frontend to include Playwright e2e");
  }

  assertPathExists(root, "apps/frontend/package.json");
  assertPathExists(root, "apps/frontend/src/routes/index.tsx");
  assertPathExists(root, "apps/frontend/src/routes/-index.test.tsx");
  assertPathExists(root, "apps/frontend/src/routeTree.gen.ts");
  assertPathExists(root, "apps/frontend/src/testing/setup.ts");
  assertPathExists(root, "apps/frontend/playwright.config.ts");
  assertPathExists(root, "apps/frontend/e2e/home.spec.ts");
  await assertFileContains(root, "apps/frontend/playwright.config.ts", "--strictPort");
  await assertFileContains(root, "apps/frontend/e2e/home.spec.ts", "page.getByRole");
  await assertFileContains(root, "apps/frontend/src/routes/index.tsx", projectName);
  await assertFileContains(root, "apps/frontend/src/routes/index.tsx", "normalized by bun-forge");
  await assertFileExcludes(root, "apps/frontend/src/routes/index.tsx", "Welcome to TanStack");
  await assertFileContains(root, "lefthook.yml", "frontend-oxc:");
  await assertFileContains(root, "lefthook.yml", '- "apps/frontend/**/*.{ts,tsx}"');
  await assertFileContains(
    root,
    "apps/frontend/.oxlintrc.jsonc",
    '"files": ["vite.config.ts", "playwright.config.ts"]',
  );
  await assertFileContains(
    root,
    "apps/frontend/.oxlintrc.jsonc",
    '"import/no-default-export": "off"',
  );

  assertEqual(
    frontendScripts["lint"],
    "oxlint --type-aware -c .oxlintrc.jsonc --format=unix src/ e2e/ vite.config.ts playwright.config.ts",
    "frontend lint script",
  );
  assertEqual(
    frontendScripts["format:check"],
    "oxfmt --check -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts",
    "frontend format:check script",
  );
  assertEqual(frontendScripts["test"], "vitest run --environment jsdom", "frontend test script");
  assertObjectHasKey(frontendDevDependencies, "@playwright/test", "frontend devDependencies");
  assertObjectHasKey(
    frontendDevDependencies,
    "@testing-library/jest-dom",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDependencies,
    "@tanstack/react-router",
    "1.169.2",
    "frontend dependencies",
  );
  assertDependencyVersion(frontendDependencies, "react", "19.2.6", "frontend dependencies");
  assertDependencyVersion(frontendDependencies, "react-dom", "19.2.6", "frontend dependencies");
  assertDependencyVersion(
    frontendDevDependencies,
    "@playwright/test",
    "1.59.1",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@tanstack/router-plugin",
    "1.167.35",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@testing-library/dom",
    "10.4.1",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@testing-library/jest-dom",
    "6.9.1",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@testing-library/react",
    "16.3.2",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@types/node",
    "25.6.0",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@types/react",
    "19.2.14",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@types/react-dom",
    "19.2.3",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "@vitejs/plugin-react",
    "6.0.1",
    "frontend devDependencies",
  );
  assertDependencyVersion(frontendDevDependencies, "jsdom", "29.1.1", "frontend devDependencies");
  assertDependencyVersion(frontendDevDependencies, "oxfmt", "0.48.0", "frontend devDependencies");
  assertDependencyVersion(frontendDevDependencies, "oxlint", "1.63.0", "frontend devDependencies");
  assertDependencyVersion(
    frontendDevDependencies,
    "oxlint-tsgolint",
    "0.22.1",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "typescript",
    "6.0.3",
    "frontend devDependencies",
  );
  assertDependencyVersion(
    frontendDevDependencies,
    "stylelint",
    "17.11.0",
    "frontend devDependencies",
  );
  assertDependencyVersion(frontendDevDependencies, "vite", "8.0.11", "frontend devDependencies");
  assertDependencyVersion(frontendDevDependencies, "vitest", "4.1.5", "frontend devDependencies");

  assertPathMissing(root, "apps/frontend/.cta.json");
  assertPathMissing(root, "apps/frontend/.vscode");
  assertPathMissing(root, "apps/frontend/README.md");
  assertPathMissing(root, "apps/frontend/public");
  assertPathMissing(root, "apps/frontend/src/components");
  assertPathMissing(root, "apps/frontend/src/router.tsx");
  assertPathMissing(root, "apps/frontend/src/routes/about.tsx");

  if (ai) {
    assertPathExists(root, "apps/frontend/src/AGENTS.md");
    assertPathExists(root, ".claude/rules/frontend-conventions.md");
  } else {
    assertPathMissing(root, "apps/frontend/src/AGENTS.md");
  }
}

export async function assertGeneratedProjectContract(
  root: string,
  description: GeneratedProjectDescription,
): Promise<void> {
  assertGeneratedFileSet(root, description);

  const packageJson = await readJsonObject(join(root, "package.json"));
  const packageScripts = objectField(packageJson, "scripts");

  await assertRootContract(root, description, packageJson, packageScripts);
  await assertBackendContract(root, description, packageJson, packageScripts);
  await assertEffectContract(root, description, packageJson, packageScripts);
  await assertAiContract(root, description, packageScripts);
  await assertFrontendContract(root, description, packageJson, packageScripts);
}
