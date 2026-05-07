import type { GeneratedProjectContract } from "../../src/core/generated-project-contract.ts";
import type { JsonObject } from "../../src/core/json.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isJsonObject, objectField, readJsonObject } from "../../src/core/json.ts";

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
  return JSON.stringify(value);
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

function sortedKeys(source: JsonObject | Readonly<Record<string, string>>): string[] {
  return Object.keys(source).toSorted();
}

function assertJsonRecordExact(
  source: JsonObject,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actualKeys = sortedKeys(source);
  const expectedKeys = sortedKeys(expected);
  assertEqual(JSON.stringify(actualKeys), JSON.stringify(expectedKeys), `${label} keys`);

  for (const [key, value] of Object.entries(expected)) {
    assertEqual(source[key], value, `${label} ${key}`);
  }
}

function assertOptionalJsonRecordExact(
  source: unknown,
  expected: Readonly<Record<string, string>> | undefined,
  label: string,
): void {
  if (expected === undefined) {
    assertUndefined(source, label);
    return;
  }
  if (!isJsonObject(source)) {
    throw new TypeError(`Expected ${label} to be an object`);
  }
  assertJsonRecordExact(source, expected, label);
}

function assertStringArrayExact(actual: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(actual)) {
    throw new TypeError(`Expected ${label} to be an array`);
  }
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
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

function assertGeneratedFileSet(root: string, contract: GeneratedProjectContract): void {
  const generatedPaths = new Set(contract.generatedFileSpecs.map((spec) => spec.relativePath));

  for (const spec of contract.generatedFileSpecs) {
    assertPathExists(root, spec.relativePath);
  }

  for (const relativePath of contract.cleanupPaths) {
    if (generatedPaths.has(relativePath)) {
      continue;
    }
    assertPathMissing(root, relativePath);
  }
}

async function assertRootContract(
  root: string,
  contract: GeneratedProjectContract,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const projectName = contract.templateContext.projectName;
  const packageName = contract.templateContext.packageName;
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();
  const devDependencies = objectField(packageJson, "devDependencies");

  assertPathExists(root, "package.json");
  assertPathExists(root, "README.md");
  assertPathExists(root, "bunfig.toml");
  assertPathExists(root, "scripts/validation/validate.ts");
  const validationPlanPath = "scripts/validation/validation-plan.ts";
  assertPathExists(root, validationPlanPath);
  assertPathExists(root, "scripts/validation/validation-runner.ts");
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
  assertEqual(packageJson["version"], contract.packageJson.version, "root package version");
  assertEqual(packageJson["type"], contract.packageJson.type, "root package type");
  assertEqual(packageJson["private"], contract.packageJson.private, "root package private");
  assertOptionalJsonRecordExact(packageJson["bin"], contract.packageJson.bin, "root bin");
  if (contract.packageJson.workspaces === undefined) {
    assertUndefined(packageJson["workspaces"], "workspaces");
  } else {
    assertStringArrayExact(
      packageJson["workspaces"],
      contract.packageJson.workspaces,
      "workspaces",
    );
  }
  assertOptionalJsonRecordExact(
    packageJson["dependencies"],
    contract.packageJson.dependencies,
    "root dependencies",
  );
  assertJsonRecordExact(
    devDependencies,
    contract.packageJson.devDependencies,
    "root devDependencies",
  );
  assertJsonRecordExact(packageScripts, contract.packageJson.scripts, "root scripts");
  assertPathMissing(root, "index.ts");
  assertPathMissing(root, "bun.lock");
  assertPathMissing(root, "node_modules");
  await assertFileContains(root, validationPlanPath, "GENERATED_PROJECT_VALIDATE_PLAN");
  await assertFileContains(root, validationPlanPath, "GENERATED_PROJECT_PUSH_VALIDATION_POLICY");
  await assertFileContains(root, validationPlanPath, "validate:frontend");
  await assertFileExcludes(root, validationPlanPath, "guard-destructive:check");
  await assertFileExcludes(root, validationPlanPath, "test:project-contract");
}

async function assertBackendContract(
  root: string,
  contract: GeneratedProjectContract,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const { backend, effect } = contract.shape;
  const projectName = contract.templateContext.projectName;
  const tsconfig = await Bun.file(join(root, "tsconfig.json")).text();
  const lefthook = await Bun.file(join(root, "lefthook.yml")).text();

  if (backend) {
    assertPathExists(root, "src/index.ts");
    assertPathExists(root, "src/index.test.ts");
    assertDefined(packageJson["bin"], "root bin");
    assertEqual(packageScripts["test"], contract.packageJson.scripts["test"], "root test script");
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
  assertEqual(
    packageScripts["dev"],
    contract.packageJson.scripts["dev"],
    "frontend-only dev script",
  );
  assertEqual(
    packageScripts["test"],
    contract.packageJson.scripts["test"],
    "frontend-only test script",
  );
  assertEqual(
    packageScripts["test:unit"],
    contract.packageJson.scripts["test:unit"],
    "test:unit script",
  );
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
  contract: GeneratedProjectContract,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const dependencies = objectField(packageJson, "dependencies");
  const devDependencies = objectField(packageJson, "devDependencies");
  const tsconfig = await Bun.file(join(root, "tsconfig.json")).text();

  if (contract.shape.effect) {
    assertPathExists(root, ".gitkeep");
    assertObjectHasKey(dependencies, "effect", "dependencies");
    assertObjectHasKey(dependencies, "@effect/cli", "dependencies");
    assertObjectHasKey(dependencies, "@effect/platform", "dependencies");
    assertObjectHasKey(dependencies, "@effect/platform-bun", "dependencies");
    assertObjectHasKey(devDependencies, "@effect/language-service", "devDependencies");
    assertOptionalJsonRecordExact(
      packageJson["dependencies"],
      contract.packageJson.dependencies,
      "dependencies",
    );
    assertJsonRecordExact(devDependencies, contract.packageJson.devDependencies, "devDependencies");
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
  contract: GeneratedProjectContract,
  packageScripts: JsonObject,
): Promise<void> {
  const { ai, backend, frontend } = contract.shape;

  if (!ai) {
    assertPathMissing(root, "CLAUDE.md");
    assertPathMissing(root, ".claude");
    assertPathMissing(root, ".mcp.json");
    assertPathMissing(root, ".codex");
    assertPathMissing(root, "scripts/validation/format-and-lint.ts");
    assertPathMissing(root, "scripts/validation/format-and-lint-routing.ts");
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
  await assertFileContains(root, ".codex/config.toml", "hooks = true");
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
  assertPathExists(root, "scripts/validation/format-and-lint-routing.ts");
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
  await assertFileContains(root, ".codex/hooks/lib.ts", "generatedAgentPathsFromManifest");
  await assertFileContains(root, ".codex/hooks/lib.ts", "agents-md-manifest.json");
  await assertGeneratedAgentsManifest(root, {
    backend,
    frontend: frontend === "tanstack",
  });
  await assertFileContains(
    root,
    "scripts/validation/format-and-lint.ts",
    "resolveGeneratedProjectWorkspace",
  );
  await assertFileContains(
    root,
    "scripts/validation/format-and-lint-routing.ts",
    "resolveGeneratedProjectWorkspace",
  );
  await assertFileContains(
    root,
    "scripts/validation/format-and-lint-routing.ts",
    "hasRoutableExtension",
  );
  await assertFileExcludes(
    root,
    "scripts/validation/format-and-lint-routing.ts",
    "resolveLiveRepoWorkspace",
  );
  await assertFileExcludes(
    root,
    "scripts/validation/format-and-lint-routing.ts",
    "isProductSurface",
  );
  await assertFileExcludes(
    root,
    "scripts/validation/format-and-lint-routing.ts",
    "template-sources/",
  );
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
    contract.packageJson.scripts["test:hooks"],
    "test:hooks script",
  );
}

async function assertGeneratedAgentsManifest(
  root: string,
  shape: { readonly backend: boolean; readonly frontend: boolean },
): Promise<void> {
  const manifest = await readJsonObject(join(root, ".agents/agents-md-manifest.json"));
  assertEqual(manifest["version"], 2, "agents manifest version");
  const generated = manifest["generated"];
  const outputs = objectField(manifest, "outputs");
  const sources = objectField(manifest, "sources");
  const expectedGenerated = [
    "AGENTS.md",
    ...(shape.frontend ? ["apps/frontend/src/AGENTS.md"] : []),
    "scripts/AGENTS.md",
    ...(shape.backend ? ["src/AGENTS.md"] : []),
  ].toSorted((left, right) => left.localeCompare(right));

  assertStringArrayExact(generated, expectedGenerated, "agents manifest generated");
  assertObjectHasKey(outputs, "AGENTS.md", "agents manifest outputs");
  if (shape.backend) {
    assertObjectHasKey(outputs, "src/AGENTS.md", "agents manifest outputs");
  }
  if (shape.frontend) {
    assertObjectHasKey(outputs, "apps/frontend/src/AGENTS.md", "agents manifest outputs");
  }
  assertObjectHasKey(outputs, "scripts/AGENTS.md", "agents manifest outputs");
  const rootOutput = objectField(outputs, "AGENTS.md");
  assertEqual(rootOutput["kind"], "root", "AGENTS.md manifest kind");
  assertEqual(rootOutput["sourcePath"], "CLAUDE.md", "AGENTS.md manifest sourcePath");
  if (typeof rootOutput["checksum"] !== "string" || !rootOutput["checksum"].startsWith("sha256-")) {
    throw new Error("Expected AGENTS.md manifest checksum to be sha256-prefixed");
  }
  assertObjectHasKey(sources, "CLAUDE.md", "agents manifest sources");
}

async function assertFrontendContract(
  root: string,
  contract: GeneratedProjectContract,
  packageJson: JsonObject,
  packageScripts: JsonObject,
): Promise<void> {
  const { ai, frontend } = contract.shape;
  const projectName = contract.templateContext.projectName;

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

  if (!contract.frontend.enabled) {
    throw new Error("Expected frontend contract to be enabled for TanStack scenario");
  }

  assertEqual(frontendPackage["name"], contract.frontend.packageJson.name, "frontend package name");
  assertEqual(
    frontendPackage["version"],
    contract.frontend.packageJson.version,
    "frontend package version",
  );
  assertEqual(frontendPackage["type"], contract.frontend.packageJson.type, "frontend package type");
  assertEqual(
    frontendPackage["private"],
    contract.frontend.packageJson.private,
    "frontend package private",
  );
  assertJsonRecordExact(frontendScripts, contract.frontend.packageJson.scripts, "frontend scripts");
  assertObjectHasKey(frontendDevDependencies, "@playwright/test", "frontend devDependencies");
  assertObjectHasKey(
    frontendDevDependencies,
    "@testing-library/jest-dom",
    "frontend devDependencies",
  );
  assertOptionalJsonRecordExact(
    frontendPackage["dependencies"],
    contract.frontend.packageJson.dependencies,
    "frontend dependencies",
  );
  assertJsonRecordExact(
    frontendDevDependencies,
    contract.frontend.packageJson.devDependencies,
    "frontend devDependencies",
  );

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
  contract: GeneratedProjectContract,
): Promise<void> {
  assertGeneratedFileSet(root, contract);

  const packageJson = await readJsonObject(join(root, "package.json"));
  const packageScripts = objectField(packageJson, "scripts");

  await assertRootContract(root, contract, packageJson, packageScripts);
  await assertBackendContract(root, contract, packageJson, packageScripts);
  await assertEffectContract(root, contract, packageJson, packageScripts);
  await assertAiContract(root, contract, packageScripts);
  await assertFrontendContract(root, contract, packageJson, packageScripts);
}
