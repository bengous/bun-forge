import type { InitOptions } from "../types.ts";
import type { GenerationRuntime } from "./generator.ts";
import { describe, expect, test } from "bun:test";
import {
  buildGeneratedProjectContract,
  describeGeneratedProject,
  parsePresetCopyManifest,
  resolveProjectShape,
} from "./generated-project-contract.ts";
import {
  buildTemplateContext,
  cleanupPathsForOptions,
  enabledPresets,
  generateProjectWithRuntime,
  templateFilesForContext,
} from "./generator.ts";
import { toBinName, toPackageName, toProjectName } from "./naming.ts";

function makeOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    destination: "/tmp/forge-generator",
    projectName: toProjectName("forge-generator"),
    packageName: toPackageName("forge-generator"),
    binName: toBinName("forge-generator"),
    backend: true,
    frontend: "none",
    ai: false,
    effect: false,
    install: false,
    gitInit: false,
    yes: true,
    ...overrides,
  };
}

function createRuntime(overrides: Partial<GenerationRuntime> = {}): {
  readonly runtime: GenerationRuntime;
  readonly calls: string[];
} {
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

describe("resolveProjectShape", () => {
  test("derives workspace shape from the frontend preset", () => {
    expect(resolveProjectShape(makeOptions()).hasWorkspaces).toBe(false);
    expect(resolveProjectShape(makeOptions({ frontend: "tanstack" })).hasWorkspaces).toBe(true);
  });

  test("rejects impossible generated project shapes", () => {
    expect(() => resolveProjectShape(makeOptions({ backend: false, frontend: "none" }))).toThrow(
      "Backend cannot be disabled without a frontend preset",
    );
    expect(() =>
      resolveProjectShape(makeOptions({ backend: false, frontend: "tanstack", effect: true })),
    ).toThrow("Effect starter requires the backend preset");
  });
});

describe("describeGeneratedProject", () => {
  test("describes native bootstrap flags and cleanup paths", () => {
    const description = describeGeneratedProject(makeOptions({ frontend: "tanstack" }));

    expect(description.nativeBootstrapFlags).toEqual({ backend: true, frontend: true });
    expect(description.cleanupPaths).toContain("index.ts");
    expect(description.cleanupPaths).toContain("apps/frontend/src/routes/about.tsx");
  });

  test("describes preset, template, and finalized generated file ownership", () => {
    const description = describeGeneratedProject(
      makeOptions({ frontend: "tanstack", ai: true, effect: true }),
    );

    expect(description.presetCopySpecs.map((spec) => spec.name)).toEqual([
      "base",
      "frontend-tanstack",
      "ai",
      "effect",
    ]);
    expect(description.templateContext).toEqual(
      buildTemplateContext(
        makeOptions({
          frontend: "tanstack",
          ai: true,
          effect: true,
        }),
      ),
    );
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "preset",
      presetName: "ai",
      relativePath: ".codex/hooks/lib.ts",
    });
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "preset",
      presetName: "ai",
      relativePath: ".claude/hooks/guard-destructive.test.ts",
    });
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "preset",
      presetName: "effect",
      relativePath: ".gitkeep",
    });
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "template",
      templateName: ".claude/rules/frontend-conventions.md.tpl",
      relativePath: ".claude/rules/frontend-conventions.md",
    });
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "finalize",
      relativePath: "AGENTS.md",
    });
    expect(description.generatedFileSpecs).toContainEqual({
      owner: "finalize",
      relativePath: "apps/frontend/src/AGENTS.md",
    });
  });

  test("uses the template source manifest for copied preset specs", () => {
    const description = describeGeneratedProject(
      makeOptions({ frontend: "tanstack", ai: true, effect: true }),
    );

    expect(description.presetCopySpecs.map((spec) => [spec.name, spec.relativePaths])).toEqual([
      [
        "base",
        [
          "bunfig.toml",
          ".editorconfig",
          ".gitattributes",
          ".gitleaks.toml",
          ".lycheeignore",
          ".oxlintrc.jsonc",
          ".oxfmtrc.jsonc",
          ".dependency-cruiser.cjs",
          ".jscpd.json",
          "mise.toml",
          "scripts/validation/detect-scope.ts",
          "scripts/validation/resolve-bin.ts",
          "scripts/validation/typecheck-staged.ts",
          "scripts/validation/validate-push.ts",
          "scripts/validation/validate.ts",
          "scripts/validation/validation-plan.ts",
          "scripts/validation/validation-runner.ts",
          "scripts/setup/bootstrap-git-config.ts",
          "scripts/setup/bootstrap-prepare.ts",
          "scripts/quality/audit-oxlint-rules.ts",
          "scripts/quality/check-links-local.ts",
        ],
      ],
      [
        "frontend-tanstack",
        [
          "apps/frontend/.oxlintrc.jsonc",
          "apps/frontend/.oxfmtrc.jsonc",
          "apps/frontend/.dependency-cruiser.cjs",
          "apps/frontend/.stylelintrc.json",
          "apps/frontend/tsconfig.json",
          "apps/frontend/tsconfig.app.json",
          "apps/frontend/tsconfig.node.json",
        ],
      ],
      [
        "ai",
        [
          ".mcp.json",
          ".codex/config.toml",
          ".codex/hooks/guard-destructive-core.ts",
          ".codex/hooks/guard-destructive-core.test.ts",
          ".codex/hooks/guard-destructive.ts",
          ".codex/hooks/guard-destructive.test.ts",
          ".codex/hooks/guard-edit-paths.ts",
          ".codex/hooks/lib.ts",
          ".codex/hooks/lib.test.ts",
          ".codex/hooks/post-edit-quality.ts",
          ".codex/hooks/stop-validate.ts",
          ".claude/settings.json",
          ".claude/hooks/guard-destructive-core.ts",
          ".claude/hooks/guard-destructive-core.test.ts",
          ".claude/hooks/guard-destructive.ts",
          ".claude/hooks/guard-destructive.test.ts",
          "scripts/validation/format-and-lint.ts",
          "scripts/validation/format-and-lint-routing.ts",
          "scripts/validation/repo-path.ts",
          "scripts/validation/validate-on-stop.ts",
          "scripts/agents/sync-agents-md.ts",
        ],
      ],
      ["effect", [".gitkeep"]],
    ]);
    expect(description.presetCopySpecs.map((spec) => spec.sourceDir.endsWith(spec.name))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  test("rejects invalid template source manifests", () => {
    const validEntries = {
      base: { copied: [] },
      "frontend-tanstack": { copied: [] },
      ai: { copied: [] },
      effect: { copied: [] },
    };

    expect(() =>
      parsePresetCopyManifest(JSON.stringify({ ...validEntries, extra: { copied: [] } }), "test"),
    ).toThrow('test contains unknown preset "extra"');
    expect(() =>
      parsePresetCopyManifest(JSON.stringify({ ...validEntries, ai: {} }), "test"),
    ).toThrow('test entry "ai.copied" must be a string array');
    expect(() =>
      parsePresetCopyManifest(
        JSON.stringify({ ...validEntries, effect: { copied: [".gitkeep", false] } }),
        "test",
      ),
    ).toThrow('test entry "effect.copied[1]" must be a string');
  });
});

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
      ["knip.jsonc.tpl", "knip.jsonc"],
      ["lefthook.yml.tpl", "lefthook.yml"],
      ["README.md.tpl", "README.md"],
      [".gitignore.tpl", ".gitignore"],
      ["src/index.ts.tpl", "src/index.ts"],
      ["src/index.test.ts.tpl", "src/index.test.ts"],
    ]);
  });

  test("omits backend starter templates for frontend-only projects", () => {
    const files = templateFilesForContext(
      buildTemplateContext(makeOptions({ backend: false, frontend: "tanstack" })),
    );
    expect(files).not.toContainEqual(["src/index.ts.tpl", "src/index.ts"]);
    expect(files).not.toContainEqual(["src/index.test.ts.tpl", "src/index.test.ts"]);
    expect(files).toContainEqual([
      "apps/frontend/playwright.config.ts.tpl",
      "apps/frontend/playwright.config.ts",
    ]);
    expect(files).toContainEqual(["apps/frontend/.gitignore.tpl", "apps/frontend/.gitignore"]);
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
    expect(files).toContainEqual([
      "apps/frontend/e2e/home.spec.ts.tpl",
      "apps/frontend/e2e/home.spec.ts",
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

  test("skips backend bootstrap for frontend-only projects", async () => {
    const { runtime, calls } = createRuntime();
    await generateProjectWithRuntime(
      makeOptions({ backend: false, frontend: "tanstack" }),
      runtime,
    );
    expect(calls).not.toContain("bootstrapBackendNative");
    expect(calls).toContain("bootstrapFrontendNative");
  });

  test("skips frontend bootstrap for backend-only projects", async () => {
    const { runtime, calls } = createRuntime();
    await generateProjectWithRuntime(makeOptions(), runtime);
    expect(calls).not.toContain("bootstrapFrontendNative");
  });

  test("passes the generated project contract into template writing", async () => {
    const options = makeOptions({ frontend: "tanstack", ai: true, effect: true });
    const expectedContract = buildGeneratedProjectContract(options);
    const { runtime } = createRuntime({
      writeTemplates: async (_destination: string, contract: unknown) => {
        expect(contract).toEqual(expectedContract);
      },
    });

    await generateProjectWithRuntime(options, runtime);
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
