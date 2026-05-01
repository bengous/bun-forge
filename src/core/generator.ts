import type { InitOptions, TemplateContext } from "../types.ts";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureDestinationIsSafe } from "./conflicts.ts";
import { ensureParentDir, listFilesRecursive } from "./filesystem.ts";
import { finalizeProject, runCommand } from "./install.ts";
import { PRESETS } from "./presets.ts";
import { renderTemplate } from "./template.ts";

export type TemplateFile = readonly [templateName: string, relativePath: string];

export type GenerationRuntime = {
  readonly ensureDestinationIsSafe: typeof ensureDestinationIsSafe;
  readonly mkdir: typeof mkdir;
  readonly bootstrapBackendNative: typeof bootstrapBackendNative;
  readonly bootstrapFrontendNative: typeof bootstrapFrontendNative;
  readonly cleanupNativeScaffold: typeof cleanupNativeScaffold;
  readonly copyEnabledPresets: typeof copyEnabledPresets;
  readonly writeTemplates: typeof writeTemplates;
  readonly finalizeProject: typeof finalizeProject;
};

export function buildTemplateContext(options: InitOptions): TemplateContext {
  return {
    projectName: options.projectName,
    packageName: options.packageName,
    binName: options.binName,
    backend: options.backend,
    frontend: options.frontend,
    ai: options.ai,
    effect: options.effect,
    hasWorkspaces: options.frontend === "tanstack",
  };
}

async function copyPreset(sourceDir: string, destination: string): Promise<void> {
  const files = await listFilesRecursive(sourceDir);
  await Promise.all(
    files.map(async (relativePath) => {
      const sourcePath = join(sourceDir, relativePath);
      const destinationPath = join(destination, relativePath);
      await ensureParentDir(destinationPath);
      await Bun.write(destinationPath, Bun.file(sourcePath));
    }),
  );
}

export function templateFilesForContext(context: TemplateContext): TemplateFile[] {
  const templateFiles: TemplateFile[] = [
    ["package.json.tpl", "package.json"],
    ["tsconfig.json.tpl", "tsconfig.json"],
    ["knip.jsonc.tpl", "knip.jsonc"],
    ["lefthook.yml.tpl", "lefthook.yml"],
    ["README.md.tpl", "README.md"],
  ];

  if (context.backend) {
    templateFiles.push(
      context.effect
        ? ["src/index.effect.ts.tpl", "src/index.ts"]
        : ["src/index.ts.tpl", "src/index.ts"],
      context.effect
        ? ["src/index.effect.test.ts.tpl", "src/index.test.ts"]
        : ["src/index.test.ts.tpl", "src/index.test.ts"],
    );
  }

  if (context.ai) {
    templateFiles.push(
      ["CLAUDE.md.tpl", "CLAUDE.md"],
      [".claude/rules/project-conventions.md.tpl", ".claude/rules/project-conventions.md"],
    );
  }

  if (context.frontend === "tanstack") {
    templateFiles.push(
      ["apps/frontend/package.json.tpl", "apps/frontend/package.json"],
      ["apps/frontend/index.html.tpl", "apps/frontend/index.html"],
      ["apps/frontend/vite.config.ts.tpl", "apps/frontend/vite.config.ts"],
      ["apps/frontend/playwright.config.ts.tpl", "apps/frontend/playwright.config.ts"],
      ["apps/frontend/src/main.tsx.tpl", "apps/frontend/src/main.tsx"],
      ["apps/frontend/src/routeTree.gen.ts.tpl", "apps/frontend/src/routeTree.gen.ts"],
      ["apps/frontend/src/routes/__root.tsx.tpl", "apps/frontend/src/routes/__root.tsx"],
      ["apps/frontend/src/routes/index.tsx.tpl", "apps/frontend/src/routes/index.tsx"],
      ["apps/frontend/src/routes/-index.test.tsx.tpl", "apps/frontend/src/routes/-index.test.tsx"],
      ["apps/frontend/src/testing/setup.ts.tpl", "apps/frontend/src/testing/setup.ts"],
      ["apps/frontend/e2e/home.spec.ts.tpl", "apps/frontend/e2e/home.spec.ts"],
      ["apps/frontend/src/styles.css.tpl", "apps/frontend/src/styles.css"],
    );

    if (context.ai) {
      templateFiles.push([
        ".claude/rules/frontend-conventions.md.tpl",
        ".claude/rules/frontend-conventions.md",
      ]);
    }
  }

  return templateFiles;
}

async function writeTemplates(destination: string, context: TemplateContext): Promise<void> {
  const templateFiles = templateFilesForContext(context);
  await Promise.all(
    templateFiles.map(async ([templateName, relativePath]) => {
      const rendered = renderTemplate(templateName, context);
      const destinationPath = join(destination, relativePath);
      await ensureParentDir(destinationPath);
      await Bun.write(destinationPath, rendered);
    }),
  );
}

async function bootstrapBackendNative(destination: string): Promise<void> {
  await runCommand(["bun", "init", "--yes"], destination, {
    env: {
      ...process.env,
      BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? "/tmp",
      BUN_INSTALL: process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
    },
  });
}

async function bootstrapFrontendNative(destination: string): Promise<void> {
  const appsDir = join(destination, "apps");
  await mkdir(appsDir, { recursive: true });

  await runCommand(
    [
      "bunx",
      "-y",
      "@tanstack/cli@latest",
      "create",
      "frontend",
      "--router-only",
      "--package-manager",
      "bun",
      "--framework",
      "React",
      "--no-install",
      "--no-git",
      "--no-examples",
    ],
    appsDir,
    {
      env: {
        ...process.env,
        BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? "/tmp",
        BUN_INSTALL: process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
      },
    },
  );
}

export function cleanupPathsForOptions(options: InitOptions): string[] {
  const paths = ["CLAUDE.md", "index.ts", "bun.lock", "node_modules"];

  if (options.frontend !== "tanstack") {
    return paths;
  }

  return [
    ...paths,
    "apps/frontend/.cta.json",
    "apps/frontend/.vscode",
    "apps/frontend/README.md",
    "apps/frontend/public",
    "apps/frontend/src/components",
    "apps/frontend/src/router.tsx",
    "apps/frontend/src/routes/about.tsx",
  ];
}

async function removePaths(root: string, relativePaths: readonly string[]): Promise<void> {
  await Promise.all(
    relativePaths.map(async (relativePath) =>
      rm(join(root, relativePath), { recursive: true, force: true }),
    ),
  );
}

async function cleanupNativeScaffold(options: InitOptions): Promise<void> {
  await removePaths(options.destination, cleanupPathsForOptions(options));
}

export function enabledPresets(options: InitOptions) {
  return PRESETS.filter((preset) => preset.enabled(options));
}

async function copyEnabledPresets(options: InitOptions): Promise<void> {
  await enabledPresets(options).reduce(async (previous, preset) => {
    await previous;
    await copyPreset(preset.sourceDir, options.destination);
  }, Promise.resolve());
}

export const defaultGenerationRuntime: GenerationRuntime = {
  ensureDestinationIsSafe,
  mkdir,
  bootstrapBackendNative,
  bootstrapFrontendNative,
  cleanupNativeScaffold,
  copyEnabledPresets,
  writeTemplates,
  finalizeProject,
};

export async function generateProjectWithRuntime(
  options: InitOptions,
  runtime: GenerationRuntime = defaultGenerationRuntime,
): Promise<void> {
  runtime.ensureDestinationIsSafe(options.destination);
  await runtime.mkdir(options.destination, { recursive: true });
  if (options.backend) {
    await runtime.bootstrapBackendNative(options.destination);
  }
  if (options.frontend === "tanstack") {
    await runtime.bootstrapFrontendNative(options.destination);
  }
  await runtime.cleanupNativeScaffold(options);
  await runtime.copyEnabledPresets(options);
  await runtime.writeTemplates(options.destination, buildTemplateContext(options));
  await runtime.finalizeProject(options);
}

export async function generateProject(options: InitOptions): Promise<void> {
  await generateProjectWithRuntime(options);
}
