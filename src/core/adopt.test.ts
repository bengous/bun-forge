import type { AdoptOptions } from "../types.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  applyAdoptionPlan,
  buildAdoptionPlan,
  deriveAdoptOptions,
  rollbackAdoption,
} from "./adopt.ts";
import { toExistingBinName, toExistingPackageName, toProjectName } from "./naming.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })),
  );
});

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "bun-forge-adopt-test-"));
  tempDirs.push(dir);
  return dir;
}

async function makeAsyncTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bun-forge-adopt-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function seedBunTsProject(root: string): void {
  writeProjectFile(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "vex",
        private: true,
        bin: { vex: "./src/cli/index.ts" },
        scripts: {
          dev: "bun src/cli/index.ts",
          lint: "biome check src/",
          typecheck: "tsc --noEmit",
        },
        dependencies: {
          effect: "^3.19.15",
          "@effect/platform-bun": "^0.87.1",
        },
        devDependencies: {
          "@types/bun": "^1.3.8",
          typescript: "5.9.3",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeProjectFile(
    root,
    "tsconfig.json",
    `${JSON.stringify({ compilerOptions: { types: ["bun"], strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
  );
  writeProjectFile(root, "src/cli/index.ts", "console.log('vex');\n");
}

function makeOptions(destination: string, overrides: Partial<AdoptOptions> = {}): AdoptOptions {
  return {
    destination,
    projectName: toProjectName("vex"),
    packageName: toExistingPackageName("vex"),
    binName: toExistingBinName("vex"),
    frontend: "none",
    ai: true,
    effect: true,
    install: false,
    apply: false,
    rollback: undefined,
    yes: true,
    ...overrides,
  };
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isUnknownRecord(value)) {
    throw new TypeError("Expected string record");
  }

  const record: Record<string, string> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === "string") {
      record[key] = fieldValue;
    }
  }
  return record;
}

function packageJsonShape(value: unknown): {
  readonly scripts: Record<string, string>;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
} {
  if (
    isUnknownRecord(value) &&
    "scripts" in value &&
    "dependencies" in value &&
    "devDependencies" in value
  ) {
    return {
      scripts: stringRecord(value["scripts"]),
      dependencies: stringRecord(value["dependencies"]),
      devDependencies: stringRecord(value["devDependencies"]),
    };
  }

  throw new TypeError("Expected package JSON shape");
}

describe("deriveAdoptOptions", () => {
  test("derives project metadata from an existing Bun TypeScript package", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const options = await deriveAdoptOptions(dir, { ai: false });

    expect(String(options.projectName)).toBe("vex");
    expect(String(options.packageName)).toBe("vex");
    expect(String(options.binName)).toBe("vex");
    expect(options.frontend).toBe("none");
    expect(options.install).toBe(false);
  });

  test("rejects non-Bun TypeScript packages", async () => {
    const dir = makeTempProject();
    writeProjectFile(
      dir,
      "package.json",
      '{"name":"node-app","scripts":{"test":"node test.js"}}\n',
    );
    writeProjectFile(dir, "tsconfig.json", '{"compilerOptions":{}}\n');

    try {
      await deriveAdoptOptions(dir, {});
      throw new Error("Expected deriveAdoptOptions to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toContain("Adoption currently supports Bun/TypeScript projects only");
    }
  });
});

describe("buildAdoptionPlan", () => {
  test("plans a dry run without touching existing files", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);
    const before = await Bun.file(join(dir, "package.json")).text();

    const plan = await buildAdoptionPlan(makeOptions(dir), {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async () => {},
      finalizeProject: async () => {},
    });

    expect(String(plan.runId)).toBe("2026-04-24T00-00-00-000Z");
    expect(
      plan.actions.some((action) => action.kind === "modify" && action.path === "package.json"),
    ).toBe(true);
    expect(
      plan.actions.some((action) => action.kind === "create" && action.path === "lefthook.yml"),
    ).toBe(true);
    expect(
      plan.actions.some((action) => action.kind === "conflict" && action.path === "tsconfig.json"),
    ).toBe(true);
    expect(await Bun.file(join(dir, "package.json")).text()).toBe(before);
  });

  test("preserves existing package scripts and dependency versions", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: false }), {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async () => {},
      finalizeProject: async () => {},
    });
    const packageAction = plan.actions.find(
      (action) => action.kind === "modify" && action.path === "package.json",
    );

    expect(packageAction?.kind).toBe("modify");
    if (packageAction?.kind !== "modify") {
      throw new Error("Expected package.json modify action");
    }

    const packageJson = packageJsonShape(JSON.parse(packageAction.content) as unknown);
    expect(packageJson.scripts["lint"]).toBe("biome check src/");
    expect(packageJson.scripts["lint:arch"]).toBeDefined();
    expect(packageJson.dependencies["effect"]).toBe("^3.19.15");
    expect(packageJson.dependencies["@effect/platform-bun"]).toBe("^0.87.1");
    expect(packageJson.dependencies["@effect/platform"]).toBe("0.96.1");
    expect(packageJson.devDependencies["@types/bun"]).toBe("^1.3.8");
  });

  test("uses preserve-root agent scripts for adopted projects", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: true }));
    const packageAction = plan.actions.find(
      (action) => action.kind === "modify" && action.path === "package.json",
    );

    expect(packageAction?.kind).toBe("modify");
    if (packageAction?.kind !== "modify") {
      throw new Error("Expected package.json modify action");
    }

    const packageJson = packageJsonShape(JSON.parse(packageAction.content) as unknown);
    expect(packageJson.scripts["agents:sync"]).toBe(
      "bun scripts/agents/sync-agents-md.ts --write --preserve-root",
    );
    expect(packageJson.scripts["agents:check"]).toBe(
      "bun scripts/agents/sync-agents-md.ts --check --preserve-root",
    );
  });

  test("plans generated contract preset outputs for AI and Effect adoption", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: true, effect: true }));

    expect(
      plan.actions.some(
        (action) => action.kind === "create" && action.path === ".codex/hooks/lib.ts",
      ),
    ).toBe(true);
    expect(
      plan.actions.some(
        (action) =>
          action.kind === "create" && action.path === ".claude/hooks/guard-destructive.test.ts",
      ),
    ).toBe(true);
    expect(
      plan.actions.some((action) => action.kind === "create" && action.path === ".gitkeep"),
    ).toBe(true);
  });

  test("plans the full frontend contract when adopting a new frontend", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const plan = await buildAdoptionPlan(makeOptions(dir, { frontend: "tanstack", ai: false }));

    expect(
      plan.actions.some(
        (action) =>
          action.kind === "create" && action.path === "apps/frontend/playwright.config.ts",
      ),
    ).toBe(true);
    expect(
      plan.actions.some(
        (action) =>
          action.kind === "create" && action.path === "apps/frontend/src/testing/setup.ts",
      ),
    ).toBe(true);
    expect(
      plan.actions.some(
        (action) => action.kind === "create" && action.path === "apps/frontend/e2e/home.spec.ts",
      ),
    ).toBe(true);
    expect(plan.actions.some((action) => action.path === "apps/frontend")).toBe(false);
  });

  test("does not inject backend starter source into adopted projects", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: false, effect: false }));

    expect(
      plan.actions.some(
        (action) =>
          action.kind === "skip" &&
          action.path === "src/index.ts" &&
          action.reason.includes("starter source skipped"),
      ),
    ).toBe(true);
    expect(
      plan.actions.some(
        (action) =>
          action.kind === "skip" &&
          action.path === "src/index.test.ts" &&
          action.reason.includes("starter source skipped"),
      ),
    ).toBe(true);
  });

  test("does not convert an existing frontend in adopt v1", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);
    writeProjectFile(dir, "apps/frontend/package.json", '{"name":"existing-frontend"}\n');

    const plan = await buildAdoptionPlan(makeOptions(dir, { frontend: "tanstack" }));

    expect(
      plan.actions.some(
        (action) =>
          action.kind === "conflict" &&
          action.path === "apps/frontend" &&
          action.reason.includes("does not convert frontends"),
      ),
    ).toBe(true);
  });

  test("reports parent path file conflicts before apply", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);
    writeProjectFile(dir, ".codex", "legacy codex marker\n");

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: true }));

    expect(
      plan.actions.some(
        (action) =>
          action.kind === "skip" &&
          action.path === ".codex/config.toml" &&
          action.reason.includes("Codex config preserved"),
      ),
    ).toBe(true);
  });

  test("preserves Vex-like root AI files and adds a Bun Forge rule", async () => {
    const dir = makeTempProject();
    seedBunTsProject(dir);
    writeProjectFile(dir, "AI.md", "Existing Vex guidance\n");
    symlinkSync("AI.md", join(dir, "CLAUDE.md"));
    symlinkSync("AI.md", join(dir, "AGENTS.md"));
    writeProjectFile(dir, ".codex", "legacy codex marker\n");
    mkdirSync(join(dir, ".claude/worktrees"), { recursive: true });

    const plan = await buildAdoptionPlan(makeOptions(dir, { ai: true }));

    expect(
      plan.actions.some(
        (action) =>
          action.kind === "skip" &&
          action.path === "CLAUDE.md" &&
          action.reason.includes("preserved"),
      ),
    ).toBe(true);
    expect(
      plan.actions.some(
        (action) =>
          action.kind === "create" &&
          action.path === ".claude/rules/bun-forge-project-conventions.md",
      ),
    ).toBe(true);
    expect(
      plan.actions.some((action) => action.path === ".claude/rules/project-conventions.md"),
    ).toBe(false);
  });
});

describe("applyAdoptionPlan and rollbackAdoption", () => {
  test("backs up modified files and removes created files on rollback", async () => {
    const dir = await makeAsyncTempProject();
    seedBunTsProject(dir);
    const options = makeOptions(dir, { ai: false });
    const plan = await buildAdoptionPlan(options, {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async () => {},
      finalizeProject: async () => {},
    });

    const beforePackage = await Bun.file(join(dir, "package.json")).text();
    await applyAdoptionPlan(plan, options, {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async () => {},
      finalizeProject: async () => {},
    });

    expect(await Bun.file(join(dir, "lefthook.yml")).exists()).toBe(true);
    expect(
      await Bun.file(
        join(dir, ".bun-forge/backups/2026-04-24T00-00-00-000Z/manifest.json"),
      ).exists(),
    ).toBe(true);

    await rollbackAdoption(dir, "2026-04-24T00-00-00-000Z");

    expect(await Bun.file(join(dir, "package.json")).text()).toBe(beforePackage);
    expect(await Bun.file(join(dir, "lefthook.yml")).exists()).toBe(false);
  });

  test("runs preserve-root agent sync while existing guidance is preserved", async () => {
    const dir = await makeAsyncTempProject();
    seedBunTsProject(dir);
    writeProjectFile(dir, "CLAUDE.md", "Existing guidance\n");
    const options = makeOptions(dir, { ai: true });
    const plan = await buildAdoptionPlan(options);
    const calls: string[][] = [];

    await applyAdoptionPlan(plan, options, {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async (command) => {
        calls.push(command);
      },
      finalizeProject: async () => {},
    });

    expect(calls).toEqual([
      ["bun", "scripts/agents/sync-agents-md.ts", "--write", "--preserve-root"],
    ]);
    expect(await Bun.file(join(dir, "CLAUDE.md")).text()).toBe("Existing guidance\n");
  });

  test("keeps root AI symlinks intact during apply", async () => {
    const dir = await makeAsyncTempProject();
    seedBunTsProject(dir);
    writeProjectFile(dir, "AI.md", "Existing Vex guidance\n");
    symlinkSync("AI.md", join(dir, "CLAUDE.md"));
    symlinkSync("AI.md", join(dir, "AGENTS.md"));
    const options = makeOptions(dir, { ai: true });
    const plan = await buildAdoptionPlan(options);

    await applyAdoptionPlan(plan, options, {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      runCommand: async () => {},
      finalizeProject: async () => {},
    });

    expect(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(dir, "AGENTS.md")).isSymbolicLink()).toBe(true);
    expect(await Bun.file(join(dir, "AI.md")).text()).toBe("Existing Vex guidance\n");
  });
});
