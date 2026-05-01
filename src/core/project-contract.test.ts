import type { InitOptions } from "../types.ts";
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultGenerationRuntime, generateProjectWithRuntime } from "./generator.ts";
import { objectField, readJsonObject } from "./json.ts";
import { toBinName, toPackageName, toProjectName } from "./naming.ts";

type Scenario = {
  readonly name: string;
  readonly backend: boolean;
  readonly frontend: "none" | "tanstack";
  readonly ai: boolean;
  readonly effect: boolean;
};

const scenarios: readonly Scenario[] = [
  { name: "none-plain", backend: true, frontend: "none", ai: false, effect: false },
  { name: "none-ai", backend: true, frontend: "none", ai: true, effect: false },
  { name: "none-effect", backend: true, frontend: "none", ai: false, effect: true },
  { name: "none-ai-effect", backend: true, frontend: "none", ai: true, effect: true },
  { name: "tanstack-plain", backend: true, frontend: "tanstack", ai: false, effect: false },
  { name: "tanstack-ai", backend: true, frontend: "tanstack", ai: true, effect: false },
  { name: "tanstack-ai-frontend", backend: false, frontend: "tanstack", ai: true, effect: false },
];

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function writeFile(path: string, content: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, content);
}

async function scaffoldBackendNative(destination: string): Promise<void> {
  await writeFile(join(destination, ".gitignore"), "node_modules\n");
  await writeFile(join(destination, "README.md"), "NATIVE BACKEND README");
  await writeFile(join(destination, "tsconfig.json"), '{"compilerOptions":{}}');
  await writeFile(join(destination, "CLAUDE.md"), "NATIVE CLAUDE");
  await writeFile(join(destination, "index.ts"), 'console.log("native backend");');
  await writeFile(join(destination, "bun.lock"), "native lock");
  await writeFile(join(destination, "node_modules/native.txt"), "native dependency");
}

async function scaffoldFrontendNative(destination: string): Promise<void> {
  const root = join(destination, "apps/frontend");
  await writeFile(join(root, ".cta.json"), "{}");
  await writeFile(join(root, ".vscode/settings.json"), "{}");
  await writeFile(join(root, "README.md"), "NATIVE FRONTEND README");
  await writeFile(join(root, "public/icon.svg"), "<svg />");
  await writeFile(join(root, "src/components/demo.tsx"), "export function Demo() { return null; }");
  await writeFile(join(root, "src/router.tsx"), "export const router = null;");
  await writeFile(
    join(root, "src/routes/about.tsx"),
    "export default function About() { return null; }",
  );
  await writeFile(join(root, "src/routes/__root.tsx"), "native-root");
  await writeFile(join(root, "src/routes/index.tsx"), "native-index");
  await writeFile(join(root, "src/main.tsx"), "native-main");
  await writeFile(join(root, "src/routeTree.gen.ts"), "native-route-tree");
  await writeFile(join(root, "package.json"), '{"name":"native-frontend"}');
}

function makeOptions(destination: string, scenario: Scenario): InitOptions {
  return {
    destination,
    projectName: toProjectName(`forge-${scenario.name}`),
    packageName: toPackageName(`forge-${scenario.name}`),
    binName: toBinName(`forge-${scenario.name}`),
    backend: scenario.backend,
    frontend: scenario.frontend,
    ai: scenario.ai,
    effect: scenario.effect,
    install: false,
    gitInit: false,
    yes: true,
  };
}

async function generateScenario(scenario: Scenario): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), `bun-forge-contract-${scenario.name}-`));
  tempDirs.push(destination);

  await generateProjectWithRuntime(makeOptions(destination, scenario), {
    ...defaultGenerationRuntime,
    bootstrapBackendNative: async (dir) => {
      await scaffoldBackendNative(dir);
    },
    bootstrapFrontendNative: async (dir) => {
      await scaffoldFrontendNative(dir);
    },
  });

  return destination;
}

function expectExists(root: string, relativePath: string): void {
  expect(existsSync(join(root, relativePath))).toBe(true);
}

function expectMissing(root: string, relativePath: string): void {
  expect(existsSync(join(root, relativePath))).toBe(false);
}

async function expectFileContains(
  root: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  expect(await Bun.file(join(root, relativePath)).text()).toContain(expected);
}

for (const scenario of scenarios) {
  test(`generated project contract: ${scenario.name}`, async () => {
    const destination = await generateScenario(scenario);
    const packageJson = await readJsonObject(join(destination, "package.json"));
    const packageScripts = objectField(packageJson, "scripts");
    const dependencies = objectField(packageJson, "dependencies");
    const devDependencies = objectField(packageJson, "devDependencies");
    const readme = await Bun.file(join(destination, "README.md")).text();
    const lefthook = await Bun.file(join(destination, "lefthook.yml")).text();

    expect(readme).toContain(`# forge-${scenario.name}`);
    expect(readme).not.toContain("NATIVE BACKEND README");
    expect(readme).toContain("Hooks and validation");
    expect(readme).toContain("glob_matcher: doublestar");
    expectExists(destination, "bunfig.toml");
    expectExists(destination, "scripts/validation/validate.ts");
    expectExists(destination, "knip.jsonc");
    expectExists(destination, "scripts/quality/check-links-local.ts");
    expect(lefthook).toContain("glob_matcher: doublestar");
    expect(lefthook).toContain("Keep these globs aligned with the repo surfaces they protect.");
    expect(lefthook).not.toContain('glob: "src/**/*.ts,scripts/**/*.ts"');

    expect(packageJson["name"]).toBe(`forge-${scenario.name}`);
    expect(packageScripts["check:links"]).toBe("bun scripts/quality/check-links-local.ts");
    expectMissing(destination, "index.ts");
    expectMissing(destination, "bun.lock");
    expectMissing(destination, "node_modules");

    const tsconfig = await Bun.file(join(destination, "tsconfig.json")).text();
    if (scenario.backend) {
      const backendEntry = await Bun.file(join(destination, "src/index.ts")).text();
      expect(packageJson["bin"]).toBeDefined();
      expect(packageScripts["test"]).toBe(
        scenario.ai ? "bun test ./src && bun run test:hooks" : "bun test ./src",
      );
      expect(lefthook).toContain('- "src/**/*.ts"');
      expect(backendEntry).toContain(`export const projectName = "forge-${scenario.name}"`);
      if (scenario.effect) {
        expect(backendEntry).toContain("Context.Tag");
        expect(backendEntry).toContain("BunRuntime.runMain");
        expect(backendEntry).toContain("Effect.gen");
      } else {
        expect(backendEntry).toContain("export function createGreeting");
        expect(backendEntry).toContain("console.log(createGreeting())");
      }
    } else {
      expect(packageJson["bin"]).toBeUndefined();
      expect(packageScripts["dev"]).toBe("bun run dev:frontend");
      expect(packageScripts["test"]).toBe("bun run test:unit && bun run test:hooks");
      expect(packageScripts["test:unit"]).toBe("cd apps/frontend && bun run test");
      expectMissing(destination, "src/index.ts");
      expectMissing(destination, "src/index.test.ts");
      expect(lefthook).not.toContain('- "src/**/*.ts"');
      expect(tsconfig).not.toContain('"src/**/*.ts"');
    }

    if (scenario.effect) {
      expectExists(destination, ".gitkeep");
      expect(dependencies["effect"]).toBeDefined();
      expect(dependencies["@effect/cli"]).toBeDefined();
      expect(dependencies["@effect/platform"]).toBeDefined();
      expect(dependencies["@effect/platform-bun"]).toBeDefined();
      expect(devDependencies["@effect/language-service"]).toBeDefined();
      expect(packageScripts["effect:diagnose"]).toBeDefined();
      expect(packageScripts["effect:quickfixes"]).toBeDefined();
      expect(tsconfig).toContain("@effect/language-service");
    } else {
      expect(packageJson["dependencies"]).toBeUndefined();
      expect(packageScripts["effect:diagnose"]).toBeUndefined();
      expect(tsconfig).not.toContain("plugins");
    }

    if (scenario.ai) {
      const claude = await Bun.file(join(destination, "CLAUDE.md")).text();
      const projectConventions = await Bun.file(
        join(destination, ".claude/rules/project-conventions.md"),
      ).text();
      expect(claude).toContain("Opinionated Bun project bootstrapped");
      expectExists(destination, ".claude/rules/project-conventions.md");
      expectExists(destination, "AGENTS.md");
      if (scenario.backend) {
        expectExists(destination, "src/AGENTS.md");
      } else {
        expectMissing(destination, "src/AGENTS.md");
      }
      expectExists(destination, ".agents/agents-md-manifest.json");
      expectExists(destination, ".mcp.json");
      expectExists(destination, ".codex/config.toml");
      expectMissing(destination, ".codex/hooks.json");
      expectExists(destination, ".codex/hooks/guard-destructive.ts");
      expectExists(destination, ".codex/hooks/guard-destructive.test.ts");
      expectExists(destination, ".codex/hooks/guard-edit-paths.ts");
      expectExists(destination, ".codex/hooks/post-edit-quality.ts");
      expectExists(destination, ".codex/hooks/stop-validate.ts");
      expectExists(destination, ".codex/hooks/lib.ts");
      expectExists(destination, ".codex/hooks/lib.test.ts");
      expectExists(destination, ".claude/hooks/guard-destructive.ts");
      expectExists(destination, ".claude/hooks/guard-destructive.test.ts");
      expectExists(destination, "scripts/validation/format-and-lint.ts");
      expectExists(destination, "scripts/validation/validate-on-stop.ts");
      const codexConfig = await Bun.file(join(destination, ".codex/config.toml")).text();
      const codexHookLib = await Bun.file(join(destination, ".codex/hooks/lib.ts")).text();
      const claudeSettings = await Bun.file(join(destination, ".claude/settings.json")).text();
      const dependencyCruiser = await Bun.file(join(destination, ".dependency-cruiser.cjs")).text();
      expect(codexConfig).toContain("git rev-parse --show-toplevel");
      expect(codexConfig).toContain(".codex/hooks/guard-destructive.ts");
      expect(codexConfig).not.toContain("CLAUDE_PROJECT_DIR");
      expect(codexConfig).not.toContain("hooks.json");
      expect(codexHookLib).toContain("stop_hook_active");
      expect(claudeSettings).toContain("$CLAUDE_PROJECT_DIR");
      expect(claudeSettings).not.toContain(".codex/");
      expect(lefthook).toContain('- ".codex/hooks/**/*.ts"');
      expect(lefthook).toContain('- ".claude/hooks/**/*.ts"');
      expect(tsconfig).toContain('".codex/hooks/**/*.ts"');
      expect(tsconfig).toContain('".claude/hooks/**/*.ts"');
      expect(packageScripts["test:hooks"]).toBe("bun test ./.codex/hooks ./.claude/hooks");
      expect(dependencyCruiser).toContain(
        "^\\\\.codex/hooks/(guard-destructive|guard-edit-paths|post-edit-quality|stop-validate)\\\\.ts$",
      );
      expect(dependencyCruiser).toContain("^\\\\.claude/hooks/guard-destructive\\\\.ts$");
      expect(dependencyCruiser).not.toContain('"^\\\\.codex/hooks/",');
      expect(projectConventions).toContain("Keep `lefthook.yml` globs aligned");
      expect(projectConventions).toContain(
        "If the repo layout changes, update Lefthook and validation scripts in the same change",
      );
      expect(packageScripts["agents:sync"]).toBeDefined();
      expect(packageScripts["agents:check"]).toBeDefined();
    } else {
      expectMissing(destination, "CLAUDE.md");
      expectMissing(destination, ".claude");
      expectMissing(destination, ".mcp.json");
      expectMissing(destination, ".codex");
      expectMissing(destination, "scripts/validation/format-and-lint.ts");
      expectMissing(destination, "scripts/validation/validate-on-stop.ts");
      expect(packageScripts["agents:sync"]).toBeUndefined();
    }

    if (scenario.frontend === "tanstack") {
      const frontendPackage = await readJsonObject(join(destination, "apps/frontend/package.json"));
      const frontendScripts = objectField(frontendPackage, "scripts");
      const frontendDevDependencies = objectField(frontendPackage, "devDependencies");
      const frontendRoute = await Bun.file(
        join(destination, "apps/frontend/src/routes/index.tsx"),
      ).text();

      expect(packageJson["workspaces"]).toEqual(["apps/*"]);
      expect(packageScripts["validate:frontend"]).toContain("bun run --silent test");
      expect(packageScripts["validate:frontend"]).toContain("bun run --silent test:e2e");
      expect(frontendScripts["lint"]).toBe(
        "oxlint --type-aware -c .oxlintrc.jsonc --format=unix src/ e2e/ vite.config.ts playwright.config.ts",
      );
      expect(frontendScripts["format:check"]).toBe(
        "oxfmt --check -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts",
      );
      expect(frontendScripts["test"]).toBe("vitest run --environment jsdom");
      expect(frontendDevDependencies["@playwright/test"]).toBeDefined();
      expect(frontendDevDependencies["@testing-library/jest-dom"]).toBeDefined();
      expect(frontendRoute).toContain(`forge-${scenario.name}`);
      expect(frontendRoute).not.toContain("native-index");
      expect(lefthook).toContain("frontend-oxc:");
      expect(lefthook).toContain('- "apps/frontend/**/*.{ts,tsx}"');
      const frontendOxlint = await Bun.file(
        join(destination, "apps/frontend/.oxlintrc.jsonc"),
      ).text();
      expect(frontendOxlint).toContain('"files": ["vite.config.ts", "playwright.config.ts"]');
      expect(frontendOxlint).toContain('"import/no-default-export": "off"');
      expectExists(destination, "apps/frontend/src/routes/-index.test.tsx");
      expectExists(destination, "apps/frontend/src/routeTree.gen.ts");
      expectExists(destination, "apps/frontend/src/testing/setup.ts");
      expectExists(destination, "apps/frontend/playwright.config.ts");
      await expectFileContains(destination, "apps/frontend/playwright.config.ts", "--strictPort");
      expectExists(destination, "apps/frontend/e2e/home.spec.ts");
      await expectFileContains(destination, "apps/frontend/e2e/home.spec.ts", "page.getByRole");
      expectMissing(destination, "apps/frontend/.cta.json");
      expectMissing(destination, "apps/frontend/.vscode");
      expectMissing(destination, "apps/frontend/README.md");
      expectMissing(destination, "apps/frontend/public");
      expectMissing(destination, "apps/frontend/src/components");
      expectMissing(destination, "apps/frontend/src/router.tsx");
      expectMissing(destination, "apps/frontend/src/routes/about.tsx");

      if (scenario.ai) {
        expectExists(destination, "apps/frontend/src/AGENTS.md");
        expectExists(destination, ".claude/rules/frontend-conventions.md");
      } else {
        expectMissing(destination, "apps/frontend/src/AGENTS.md");
      }
    } else {
      expect(packageJson["workspaces"]).toBeUndefined();
      expect(packageScripts["validate:frontend"]).toBeUndefined();
      expect(lefthook).not.toContain("frontend-oxc:");
      expect(lefthook).not.toContain("apps/frontend/**/*.{ts,tsx}");
      expectMissing(destination, "apps/frontend");
    }
  });
}
