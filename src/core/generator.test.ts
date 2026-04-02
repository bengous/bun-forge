import type { InitOptions } from "../types.ts";
import type { GenerationRuntime } from "./generator.ts";
import { describe, expect, test } from "bun:test";
import {
  buildTemplateContext,
  cleanupPathsForOptions,
  enabledPresets,
  generateProjectWithRuntime,
  templateFilesForContext,
} from "./generator.ts";

function makeOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    destination: "/tmp/forge-generator",
    projectName: "forge-generator",
    packageName: "forge-generator",
    binName: "forge-generator",
    frontend: "none",
    ai: false,
    effect: false,
    install: false,
    gitInit: false,
    yes: true,
    ...overrides,
  };
}

function createRuntime(overrides: Partial<GenerationRuntime> = {}) {
  const calls: string[] = [];

  const runtime: GenerationRuntime = {
    ensureDestinationIsSafe: () => {
      calls.push("ensureDestinationIsSafe");
    },
    mkdir: async () => {
      calls.push("mkdir");
      return;
    },
    bootstrapBackendNative: async () => {
      calls.push("bootstrapBackendNative");
    },
    bootstrapFrontendNative: async () => {
      calls.push("bootstrapFrontendNative");
    },
    cleanupNativeScaffold: async () => {
      calls.push("cleanupNativeScaffold");
    },
    copyEnabledPresets: async () => {
      calls.push("copyEnabledPresets");
    },
    writeTemplates: async () => {
      calls.push("writeTemplates");
    },
    finalizeProject: async () => {
      calls.push("finalizeProject");
    },
    ...overrides,
  };

  return { runtime, calls };
}

describe("buildTemplateContext", () => {
  test("enables workspaces only for the TanStack preset", () => {
    expect(buildTemplateContext(makeOptions()).hasWorkspaces).toBe(false);
    expect(buildTemplateContext(makeOptions({ frontend: "tanstack" })).hasWorkspaces).toBe(true);
  });
});

describe("templateFilesForContext", () => {
  test("returns the backend template set by default", () => {
    const files = templateFilesForContext(buildTemplateContext(makeOptions()));
    expect(files).toEqual([
      ["package.json.tpl", "package.json"],
      ["tsconfig.json.tpl", "tsconfig.json"],
      ["lefthook.yml.tpl", "lefthook.yml"],
      ["README.md.tpl", "README.md"],
      ["src/index.ts.tpl", "src/index.ts"],
      ["src/index.test.ts.tpl", "src/index.test.ts"],
    ]);
  });

  test("uses Effect starter templates when effect is enabled", () => {
    const files = templateFilesForContext(buildTemplateContext(makeOptions({ effect: true })));
    expect(files).toContainEqual(["src/index.effect.ts.tpl", "src/index.ts"]);
    expect(files).toContainEqual(["src/index.effect.test.ts.tpl", "src/index.test.ts"]);
    expect(files).not.toContainEqual(["src/index.ts.tpl", "src/index.ts"]);
  });

  test("adds AI and frontend templates when enabled", () => {
    const files = templateFilesForContext(
      buildTemplateContext(makeOptions({ frontend: "tanstack", ai: true })),
    );
    expect(files).toContainEqual(["CLAUDE.md.tpl", "CLAUDE.md"]);
    expect(files).toContainEqual([
      ".claude/rules/frontend-conventions.md.tpl",
      ".claude/rules/frontend-conventions.md",
    ]);
    expect(files).toContainEqual([
      "apps/frontend/src/routes/-index.test.tsx.tpl",
      "apps/frontend/src/routes/-index.test.tsx",
    ]);
  });
});

describe("cleanupPathsForOptions", () => {
  test("always cleans backend native leftovers", () => {
    expect(cleanupPathsForOptions(makeOptions())).toEqual([
      "CLAUDE.md",
      "index.ts",
      "bun.lock",
      "node_modules",
    ]);
  });

  test("adds frontend native leftovers for TanStack projects", () => {
    expect(cleanupPathsForOptions(makeOptions({ frontend: "tanstack" }))).toContain(
      "apps/frontend/src/routes/about.tsx",
    );
  });
});

describe("enabledPresets", () => {
  test("selects only base by default", () => {
    expect(enabledPresets(makeOptions()).map((preset) => preset.name)).toEqual(["base"]);
  });

  test("adds optional overlays when features are enabled", () => {
    expect(
      enabledPresets(makeOptions({ frontend: "tanstack", ai: true })).map((preset) => preset.name),
    ).toEqual(["base", "frontend-tanstack", "ai"]);
  });

  test("includes effect preset when effect is enabled", () => {
    expect(enabledPresets(makeOptions({ effect: true })).map((preset) => preset.name)).toEqual([
      "base",
      "effect",
    ]);
  });
});

describe("generateProjectWithRuntime", () => {
  test("runs the generation stages in order", async () => {
    const { runtime, calls } = createRuntime();
    await generateProjectWithRuntime(makeOptions({ frontend: "tanstack" }), runtime);
    expect(calls).toEqual([
      "ensureDestinationIsSafe",
      "mkdir",
      "bootstrapBackendNative",
      "bootstrapFrontendNative",
      "cleanupNativeScaffold",
      "copyEnabledPresets",
      "writeTemplates",
      "finalizeProject",
    ]);
  });

  test("skips frontend bootstrap for backend-only projects", async () => {
    const { runtime, calls } = createRuntime();
    await generateProjectWithRuntime(makeOptions(), runtime);
    expect(calls).not.toContain("bootstrapFrontendNative");
  });

  test("stops on the first failing stage", async () => {
    const { runtime, calls } = createRuntime({
      cleanupNativeScaffold: async () => {
        calls.push("cleanupNativeScaffold");
        throw new Error("cleanup failed");
      },
    });

    try {
      await generateProjectWithRuntime(makeOptions(), runtime);
      throw new Error("Expected generation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toContain("cleanup failed");
    }
    expect(calls).toEqual([
      "ensureDestinationIsSafe",
      "mkdir",
      "bootstrapBackendNative",
      "cleanupNativeScaffold",
    ]);
  });
});
