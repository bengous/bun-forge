import type { InitOptions, TemplateContext } from "../types.ts";
import type { GeneratedProjectContract, PresetCopySpec } from "./generated-project-contract.ts";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureDestinationIsSafe } from "./conflicts.ts";
import { ensureParentDir } from "./filesystem.ts";
import {
  buildGeneratedProjectContract,
  describeGeneratedProject,
  templateRenderSpecsForShape,
} from "./generated-project-contract.ts";
import { bunInstallEnv, finalizeProject, runCommand } from "./install.ts";
import { PRESETS } from "./presets.ts";
import { renderTemplateFromContract } from "./template.ts";

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
  return describeGeneratedProject(options).templateContext;
}

async function copyPreset(spec: PresetCopySpec, destination: string): Promise<void> {
  await Promise.all(
    spec.relativePaths.map(async (relativePath) => {
      const sourcePath = join(spec.sourceDir, relativePath);
      const destinationPath = join(destination, relativePath);
      await ensureParentDir(destinationPath);
      await Bun.write(destinationPath, Bun.file(sourcePath));
    }),
  );
}

export function templateFilesForContext(context: TemplateContext): TemplateFile[] {
  return templateRenderSpecsForShape(context).map((spec) => [spec.templateName, spec.relativePath]);
}

async function writeTemplates(
  destination: string,
  contract: GeneratedProjectContract,
): Promise<void> {
  const templateFiles = contract.templateRenderSpecs.map(
    (spec) => [spec.templateName, spec.relativePath] as const,
  );
  await Promise.all(
    templateFiles.map(async ([templateName, relativePath]) => {
      const rendered = renderTemplateFromContract(templateName, contract);
      const destinationPath = join(destination, relativePath);
      await ensureParentDir(destinationPath);
      await Bun.write(destinationPath, rendered);
    }),
  );
}

async function bootstrapBackendNative(destination: string): Promise<void> {
  await runCommand(["bun", "init", "--yes"], destination, {
    env: bunInstallEnv(),
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
      env: bunInstallEnv(),
    },
  );
}

export function cleanupPathsForOptions(options: InitOptions): string[] {
  return [...describeGeneratedProject(options).cleanupPaths];
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

export function enabledPresets(options: InitOptions): typeof PRESETS {
  const presetNames: ReadonlySet<string> = new Set(
    describeGeneratedProject(options).presetCopySpecs.map((spec) => spec.name),
  );
  return PRESETS.filter((preset) => presetNames.has(preset.name));
}

async function copyEnabledPresets(options: InitOptions): Promise<void> {
  await Promise.all(
    describeGeneratedProject(options).presetCopySpecs.map(async (preset) =>
      copyPreset(preset, options.destination),
    ),
  );
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
  const contract = buildGeneratedProjectContract(options);

  runtime.ensureDestinationIsSafe(options.destination);
  await runtime.mkdir(options.destination, { recursive: true });
  if (contract.nativeBootstrapFlags.backend) {
    await runtime.bootstrapBackendNative(options.destination);
  }
  if (contract.nativeBootstrapFlags.frontend) {
    await runtime.bootstrapFrontendNative(options.destination);
  }
  await runtime.cleanupNativeScaffold(options);
  await runtime.copyEnabledPresets(options);
  await runtime.writeTemplates(options.destination, contract);
  await runtime.finalizeProject(options);
}

export async function generateProject(options: InitOptions): Promise<void> {
  await generateProjectWithRuntime(options);
}
