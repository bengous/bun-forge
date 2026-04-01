import type { InitOptions } from "../types.ts";
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultGenerationRuntime, generateProjectWithRuntime } from "./generator.ts";

type Scenario = {
  readonly name: string;
  readonly frontend: "none" | "tanstack";
  readonly ai: boolean;
};

const scenarios: readonly Scenario[] = [
  { name: "none-plain", frontend: "none", ai: false },
  { name: "none-ai", frontend: "none", ai: true },
  { name: "tanstack-plain", frontend: "tanstack", ai: false },
  { name: "tanstack-ai", frontend: "tanstack", ai: true },
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
    projectName: `forge-${scenario.name}`,
    packageName: `forge-${scenario.name}`,
    binName: `forge-${scenario.name}`,
    frontend: scenario.frontend,
    ai: scenario.ai,
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

for (const scenario of scenarios) {
  test(`generated project contract: ${scenario.name}`, async () => {
    const destination = await generateScenario(scenario);
    const packageJson = await Bun.file(join(destination, "package.json")).json();
    const readme = await Bun.file(join(destination, "README.md")).text();
    const backendEntry = await Bun.file(join(destination, "src/index.ts")).text();
    const lefthook = await Bun.file(join(destination, "lefthook.yml")).text();

    expect(readme).toContain(`# forge-${scenario.name}`);
    expect(readme).not.toContain("NATIVE BACKEND README");
    expect(readme).toContain("Hooks and validation");
    expect(readme).toContain("glob_matcher: doublestar");
    expect(backendEntry).toContain(`export const projectName = "forge-${scenario.name}"`);
    expect(backendEntry).toContain("export function createGreeting");
    expect(backendEntry).toContain("console.log(createGreeting())");
    expectExists(destination, "bunfig.toml");
    expectExists(destination, "scripts/validation/validate.ts");
    expectExists(destination, "scripts/quality/check-links-local.ts");
    expect(lefthook).toContain("glob_matcher: doublestar");
    expect(lefthook).toContain("Keep these globs aligned with the repo surfaces they protect.");
    expect(lefthook).not.toContain('glob: "src/**/*.ts,scripts/**/*.ts"');
    expect(lefthook).toContain('glob:\n        - "src/**/*.ts"');

    expect(packageJson["name"]).toBe(`forge-${scenario.name}`);
    expect(packageJson["scripts"]["test"]).toBe("bun test ./src");
    expect(packageJson["scripts"]["check:links"]).toBe("bun scripts/quality/check-links-local.ts");
    expectMissing(destination, "index.ts");
    expectMissing(destination, "bun.lock");
    expectMissing(destination, "node_modules");

    if (scenario.ai) {
      const claude = await Bun.file(join(destination, "CLAUDE.md")).text();
      const projectConventions = await Bun.file(
        join(destination, ".claude/rules/project-conventions.md"),
      ).text();
      expect(claude).toContain("Opinionated Bun project bootstrapped");
      expectExists(destination, ".claude/rules/project-conventions.md");
      expectExists(destination, "AGENTS.md");
      expectExists(destination, "src/AGENTS.md");
      expectExists(destination, ".agents/agents-md-manifest.json");
      expectExists(destination, ".mcp.json");
      expectExists(destination, ".codex/config.toml");
      expectExists(destination, "scripts/validation/format-and-lint.ts");
      expectExists(destination, "scripts/validation/validate-on-stop.ts");
      expect(projectConventions).toContain("Keep `lefthook.yml` globs aligned");
      expect(projectConventions).toContain(
        "If the repo layout changes, update Lefthook and validation scripts in the same change",
      );
      expect(packageJson["scripts"]["agents:sync"]).toBeDefined();
      expect(packageJson["scripts"]["agents:check"]).toBeDefined();
    } else {
      expectMissing(destination, "CLAUDE.md");
      expectMissing(destination, ".claude");
      expectMissing(destination, ".mcp.json");
      expectMissing(destination, ".codex");
      expectMissing(destination, "scripts/validation/format-and-lint.ts");
      expectMissing(destination, "scripts/validation/validate-on-stop.ts");
      expect(packageJson["scripts"]["agents:sync"]).toBeUndefined();
    }

    if (scenario.frontend === "tanstack") {
      const frontendPackage = await Bun.file(
        join(destination, "apps/frontend/package.json"),
      ).json();
      const frontendRoute = await Bun.file(
        join(destination, "apps/frontend/src/routes/index.tsx"),
      ).text();

      expect(packageJson["workspaces"]).toEqual(["apps/*"]);
      expect(packageJson["scripts"]["validate:frontend"]).toContain("bun run --silent test");
      expect(frontendPackage["scripts"]["test"]).toBe("vitest run --environment jsdom");
      expect(frontendRoute).toContain(`forge-${scenario.name}`);
      expect(frontendRoute).not.toContain("native-index");
      expect(lefthook).toContain("frontend-oxc:");
      expect(lefthook).toContain('- "apps/frontend/**/*.{ts,tsx}"');
      expectExists(destination, "apps/frontend/src/routes/-index.test.tsx");
      expectExists(destination, "apps/frontend/src/routeTree.gen.ts");
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
      expect(packageJson["scripts"]["validate:frontend"]).toBeUndefined();
      expect(lefthook).not.toContain("frontend-oxc:");
      expect(lefthook).not.toContain("apps/frontend/**/*.{ts,tsx}");
      expectMissing(destination, "apps/frontend");
    }
  });
}
