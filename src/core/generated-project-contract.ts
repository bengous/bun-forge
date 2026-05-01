import type { FrontendPreset, InitOptions, TemplateContext } from "../types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isJsonObject, parseJsonObject } from "./json.ts";
import { TEMPLATE_SOURCES_DIR } from "./paths.ts";
import { PRESETS } from "./presets.ts";

const PRESET_NAMES = ["base", "frontend-tanstack", "ai", "effect"] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

export type ProjectShapeInput = {
  readonly backend: boolean;
  readonly frontend: FrontendPreset;
  readonly ai: boolean;
  readonly effect: boolean;
};

export type ProjectShape = ProjectShapeInput & {
  readonly hasWorkspaces: boolean;
};

export type NativeBootstrapFlags = {
  readonly backend: boolean;
  readonly frontend: boolean;
};

export type PresetCopySpec = {
  readonly name: PresetName;
  readonly sourceDir: string;
  readonly relativePaths: readonly string[];
};

export type TemplateRenderSpec = {
  readonly templateName: string;
  readonly relativePath: string;
};

export type GeneratedFileSpec =
  | {
      readonly owner: "preset";
      readonly presetName: PresetName;
      readonly relativePath: string;
    }
  | {
      readonly owner: "template";
      readonly templateName: string;
      readonly relativePath: string;
    }
  | {
      readonly owner: "finalize";
      readonly relativePath: string;
    };

export type GeneratedProjectDescription = {
  readonly shape: ProjectShape;
  readonly templateContext: TemplateContext;
  readonly nativeBootstrapFlags: NativeBootstrapFlags;
  readonly cleanupPaths: readonly string[];
  readonly presetCopySpecs: readonly PresetCopySpec[];
  readonly templateRenderSpecs: readonly TemplateRenderSpec[];
  readonly generatedFileSpecs: readonly GeneratedFileSpec[];
};

const BASE_CLEANUP_PATHS = ["CLAUDE.md", "index.ts", "bun.lock", "node_modules"] as const;

const FRONTEND_CLEANUP_PATHS = [
  "apps/frontend/.cta.json",
  "apps/frontend/.vscode",
  "apps/frontend/README.md",
  "apps/frontend/public",
  "apps/frontend/src/components",
  "apps/frontend/src/router.tsx",
  "apps/frontend/src/routes/about.tsx",
] as const;

const BASE_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  { templateName: "package.json.tpl", relativePath: "package.json" },
  { templateName: "tsconfig.json.tpl", relativePath: "tsconfig.json" },
  { templateName: "knip.jsonc.tpl", relativePath: "knip.jsonc" },
  { templateName: "lefthook.yml.tpl", relativePath: "lefthook.yml" },
  { templateName: "README.md.tpl", relativePath: "README.md" },
  { templateName: ".gitignore.tpl", relativePath: ".gitignore" },
];

const BACKEND_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  { templateName: "src/index.ts.tpl", relativePath: "src/index.ts" },
  { templateName: "src/index.test.ts.tpl", relativePath: "src/index.test.ts" },
];

const EFFECT_BACKEND_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  { templateName: "src/index.effect.ts.tpl", relativePath: "src/index.ts" },
  { templateName: "src/index.effect.test.ts.tpl", relativePath: "src/index.test.ts" },
];

const AI_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  { templateName: "CLAUDE.md.tpl", relativePath: "CLAUDE.md" },
  {
    templateName: ".claude/rules/project-conventions.md.tpl",
    relativePath: ".claude/rules/project-conventions.md",
  },
];

const FRONTEND_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  { templateName: "apps/frontend/package.json.tpl", relativePath: "apps/frontend/package.json" },
  { templateName: "apps/frontend/.gitignore.tpl", relativePath: "apps/frontend/.gitignore" },
  { templateName: "apps/frontend/index.html.tpl", relativePath: "apps/frontend/index.html" },
  {
    templateName: "apps/frontend/vite.config.ts.tpl",
    relativePath: "apps/frontend/vite.config.ts",
  },
  {
    templateName: "apps/frontend/playwright.config.ts.tpl",
    relativePath: "apps/frontend/playwright.config.ts",
  },
  {
    templateName: "apps/frontend/src/main.tsx.tpl",
    relativePath: "apps/frontend/src/main.tsx",
  },
  {
    templateName: "apps/frontend/src/routeTree.gen.ts.tpl",
    relativePath: "apps/frontend/src/routeTree.gen.ts",
  },
  {
    templateName: "apps/frontend/src/routes/__root.tsx.tpl",
    relativePath: "apps/frontend/src/routes/__root.tsx",
  },
  {
    templateName: "apps/frontend/src/routes/index.tsx.tpl",
    relativePath: "apps/frontend/src/routes/index.tsx",
  },
  {
    templateName: "apps/frontend/src/routes/-index.test.tsx.tpl",
    relativePath: "apps/frontend/src/routes/-index.test.tsx",
  },
  {
    templateName: "apps/frontend/src/testing/setup.ts.tpl",
    relativePath: "apps/frontend/src/testing/setup.ts",
  },
  {
    templateName: "apps/frontend/e2e/home.spec.ts.tpl",
    relativePath: "apps/frontend/e2e/home.spec.ts",
  },
  {
    templateName: "apps/frontend/src/styles.css.tpl",
    relativePath: "apps/frontend/src/styles.css",
  },
];

const FRONTEND_AI_TEMPLATE_RENDER_SPECS: readonly TemplateRenderSpec[] = [
  {
    templateName: ".claude/rules/frontend-conventions.md.tpl",
    relativePath: ".claude/rules/frontend-conventions.md",
  },
];

type PresetCopyManifest = Record<PresetName, readonly string[]>;

function isPresetName(value: string): value is PresetName {
  return PRESET_NAMES.some((presetName) => presetName === value);
}

function readManifestCopiedPaths(
  manifest: Record<string, unknown>,
  label: string,
  presetName: PresetName,
): readonly string[] {
  const entry = manifest[presetName];
  if (!isJsonObject(entry)) {
    throw new TypeError(`${label} must define object entry "${presetName}"`);
  }

  const copied = entry["copied"];
  if (!Array.isArray(copied)) {
    throw new TypeError(`${label} entry "${presetName}.copied" must be a string array`);
  }

  const paths: string[] = [];
  for (const [index, path] of copied.entries()) {
    if (typeof path !== "string") {
      throw new TypeError(`${label} entry "${presetName}.copied[${index}]" must be a string`);
    }
    paths.push(path);
  }
  return paths;
}

export function parsePresetCopyManifest(raw: string, label: string): PresetCopyManifest {
  const manifest = parseJsonObject(raw, label);

  for (const key of Object.keys(manifest)) {
    if (!isPresetName(key)) {
      throw new TypeError(`${label} contains unknown preset "${key}"`);
    }
  }

  return {
    base: readManifestCopiedPaths(manifest, label, "base"),
    "frontend-tanstack": readManifestCopiedPaths(manifest, label, "frontend-tanstack"),
    ai: readManifestCopiedPaths(manifest, label, "ai"),
    effect: readManifestCopiedPaths(manifest, label, "effect"),
  };
}

const PRESET_COPY_MANIFEST = parsePresetCopyManifest(
  readFileSync(join(TEMPLATE_SOURCES_DIR, "manifest.json"), "utf8"),
  "template-sources/manifest.json",
);

function presetSourceDir(name: PresetName): string {
  const preset = PRESETS.find((candidate) => candidate.name === name);
  if (preset === undefined) {
    throw new Error(`Preset ${name} is not registered`);
  }
  return preset.sourceDir;
}

function presetNamesForShape(shape: ProjectShape): PresetName[] {
  const names: PresetName[] = ["base"];

  if (shape.frontend === "tanstack") {
    names.push("frontend-tanstack");
  }

  if (shape.ai) {
    names.push("ai");
  }

  if (shape.effect) {
    names.push("effect");
  }

  return names;
}

export function resolveProjectShape(input: ProjectShapeInput): ProjectShape {
  if (!input.backend && input.frontend === "none") {
    throw new Error("Backend cannot be disabled without a frontend preset");
  }

  if (!input.backend && input.effect) {
    throw new Error("Effect starter requires the backend preset");
  }

  return {
    backend: input.backend,
    frontend: input.frontend,
    ai: input.ai,
    effect: input.effect,
    hasWorkspaces: input.frontend === "tanstack",
  };
}

function templateContextForOptions(options: InitOptions, shape: ProjectShape): TemplateContext {
  return {
    projectName: options.projectName,
    packageName: options.packageName,
    binName: options.binName,
    backend: shape.backend,
    frontend: shape.frontend,
    ai: shape.ai,
    effect: shape.effect,
    hasWorkspaces: shape.hasWorkspaces,
  };
}

function cleanupPathsForShape(shape: ProjectShape): string[] {
  if (shape.frontend !== "tanstack") {
    return [...BASE_CLEANUP_PATHS];
  }

  return [...BASE_CLEANUP_PATHS, ...FRONTEND_CLEANUP_PATHS];
}

function presetCopySpecsForShape(shape: ProjectShape): PresetCopySpec[] {
  return presetNamesForShape(shape).map((name) => ({
    name,
    sourceDir: presetSourceDir(name),
    relativePaths: PRESET_COPY_MANIFEST[name],
  }));
}

export function templateRenderSpecsForShape(input: ProjectShapeInput): TemplateRenderSpec[] {
  const shape = resolveProjectShape(input);
  const specs: TemplateRenderSpec[] = [...BASE_TEMPLATE_RENDER_SPECS];

  if (shape.backend) {
    specs.push(
      ...(shape.effect ? EFFECT_BACKEND_TEMPLATE_RENDER_SPECS : BACKEND_TEMPLATE_RENDER_SPECS),
    );
  }

  if (shape.ai) {
    specs.push(...AI_TEMPLATE_RENDER_SPECS);
  }

  if (shape.frontend === "tanstack") {
    specs.push(...FRONTEND_TEMPLATE_RENDER_SPECS);

    if (shape.ai) {
      specs.push(...FRONTEND_AI_TEMPLATE_RENDER_SPECS);
    }
  }

  return specs;
}

function finalizedFileSpecsForShape(shape: ProjectShape): GeneratedFileSpec[] {
  if (!shape.ai) {
    return [];
  }

  const specs: GeneratedFileSpec[] = [
    { owner: "finalize", relativePath: "AGENTS.md" },
    { owner: "finalize", relativePath: ".agents/agents-md-manifest.json" },
    { owner: "finalize", relativePath: "scripts/AGENTS.md" },
  ];

  if (shape.backend) {
    specs.push({ owner: "finalize", relativePath: "src/AGENTS.md" });
  }

  if (shape.frontend === "tanstack") {
    specs.push({ owner: "finalize", relativePath: "apps/frontend/src/AGENTS.md" });
  }

  return specs;
}

function generatedFileSpecsForDescription(
  presetCopySpecs: readonly PresetCopySpec[],
  templateRenderSpecs: readonly TemplateRenderSpec[],
  shape: ProjectShape,
): GeneratedFileSpec[] {
  return [
    ...presetCopySpecs.flatMap((preset) =>
      preset.relativePaths.map((relativePath) => ({
        owner: "preset" as const,
        presetName: preset.name,
        relativePath,
      })),
    ),
    ...templateRenderSpecs.map((template) => ({
      owner: "template" as const,
      templateName: template.templateName,
      relativePath: template.relativePath,
    })),
    ...finalizedFileSpecsForShape(shape),
  ];
}

export function describeGeneratedProject(options: InitOptions): GeneratedProjectDescription {
  const shape = resolveProjectShape(options);
  const templateContext = templateContextForOptions(options, shape);
  const presetCopySpecs = presetCopySpecsForShape(shape);
  const templateRenderSpecs = templateRenderSpecsForShape(shape);

  return {
    shape,
    templateContext,
    nativeBootstrapFlags: {
      backend: shape.backend,
      frontend: shape.frontend === "tanstack",
    },
    cleanupPaths: cleanupPathsForShape(shape),
    presetCopySpecs,
    templateRenderSpecs,
    generatedFileSpecs: generatedFileSpecsForDescription(
      presetCopySpecs,
      templateRenderSpecs,
      shape,
    ),
  };
}
