import type {
  AdoptOptions,
  AdoptOptionsInput,
  BackupRunId,
  BinName,
  PackageName,
  SafeRelativePath,
  TemplateContext,
} from "../types.ts";
import type {
  GeneratedProjectDescription,
  PresetCopySpec,
  PresetName,
  TemplateRenderSpec,
} from "./generated-project-contract.ts";
import type { JsonObject } from "./json.ts";
import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { brandValue } from "../types.ts";
import { describeGeneratedProject } from "./generated-project-contract.ts";
import { finalizeProject, runCommand } from "./install.ts";
import { isJsonObject, objectField, parseJsonObject, stringArray } from "./json.ts";
import {
  toExistingBinName,
  toExistingPackageName,
  toPackageName,
  toProjectName,
} from "./naming.ts";
import { renderTemplate } from "./template.ts";

type WritableAdoptionAction = Extract<AdoptionAction, { readonly kind: "create" | "modify" }>;

export type AdoptionAction =
  | {
      readonly kind: "create";
      readonly path: SafeRelativePath;
      readonly reason: string;
      readonly content: string;
    }
  | {
      readonly kind: "modify";
      readonly path: SafeRelativePath;
      readonly reason: string;
      readonly content: string;
    }
  | {
      readonly kind: "skip";
      readonly path: SafeRelativePath;
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
      readonly path: SafeRelativePath;
      readonly reason: string;
    };

export type AdoptionPlan = {
  readonly destination: string;
  readonly runId: BackupRunId;
  readonly actions: AdoptionAction[];
};

type BackupEntry = {
  readonly path: SafeRelativePath;
  readonly kind: "created" | "modified";
  readonly backupPath?: SafeRelativePath;
};

type BackupManifest = {
  readonly runId: BackupRunId;
  readonly entries: BackupEntry[];
};

export type AdoptRuntime = {
  readonly now: () => Date;
  readonly runCommand: typeof runCommand;
  readonly finalizeProject: typeof finalizeProject;
};

export const defaultAdoptRuntime: AdoptRuntime = {
  now: () => new Date(),
  runCommand,
  finalizeProject,
};

function backupRoot(destination: string, runId: BackupRunId): string {
  return join(destination, ".bun-forge", "backups", runId);
}

function backupFilePath(relativePath: SafeRelativePath): SafeRelativePath {
  return toSafeRelativePath(join("files", encodeURIComponent(relativePath)));
}

export function toSafeRelativePath(relativePath: string): SafeRelativePath {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.includes("/../")
  ) {
    throw new Error(`Unsafe adoption path: ${relativePath}`);
  }
  return brandValue<string, "SafeRelativePath">(relativePath);
}

export function toBackupRunId(runId: string): BackupRunId {
  if (
    runId.length === 0 ||
    runId === "." ||
    runId === ".." ||
    runId.includes("/") ||
    runId.includes("\\")
  ) {
    throw new Error(`Unsafe adoption rollback run id: ${runId}`);
  }
  return brandValue<string, "BackupRunId">(runId);
}

function blockingParentPath(
  destination: string,
  relativePath: SafeRelativePath,
): string | undefined {
  const segments = relativePath.split("/");
  const parents = segments.slice(0, -1);
  let cursor = destination;

  for (const parent of parents) {
    cursor = join(cursor, parent);
    if (existsSync(cursor) && !statSync(cursor).isDirectory()) {
      return relative(destination, cursor);
    }
  }

  return undefined;
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function mergeObjectsPreservingExisting(existing: JsonObject, additions: JsonObject): JsonObject {
  const merged: JsonObject = { ...existing };
  for (const [key, value] of Object.entries(additions)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeStringArrayPreservingExisting(existing: unknown, additions: unknown): unknown {
  if (!Array.isArray(existing) || !Array.isArray(additions)) {
    return existing ?? additions;
  }
  return [...new Set([...stringArray(existing), ...stringArray(additions)])];
}

async function parseJsonFile(path: string): Promise<JsonObject> {
  return parseJsonObject(await readText(path), path);
}

function renderJsonTemplate(templateName: string, context: TemplateContext): JsonObject {
  return parseJsonObject(renderTemplate(templateName, context), templateName);
}

function packageHasBunSignal(packageJson: JsonObject): boolean {
  const scripts = objectField(packageJson, "scripts");
  const dependencies = objectField(packageJson, "dependencies");
  const devDependencies = objectField(packageJson, "devDependencies");
  const bin = packageJson["bin"];
  const scriptValues = Object.values(scripts);

  return (
    scriptValues.some((value) => typeof value === "string" && value.includes("bun")) ||
    "@types/bun" in devDependencies ||
    "bun-types" in devDependencies ||
    "bun" in dependencies ||
    (isJsonObject(bin) &&
      Object.values(bin).some((value) => typeof value === "string" && value.endsWith(".ts")))
  );
}

async function assertAdoptableProject(destination: string): Promise<JsonObject> {
  const packagePath = join(destination, "package.json");
  const tsconfigPath = join(destination, "tsconfig.json");

  if (!existsSync(packagePath)) {
    throw new Error("Adoption requires an existing package.json");
  }
  if (!existsSync(tsconfigPath)) {
    throw new Error("Adoption requires an existing tsconfig.json");
  }

  const packageJson = await parseJsonFile(packagePath);
  if (!packageHasBunSignal(packageJson)) {
    throw new Error("Adoption currently supports Bun/TypeScript projects only");
  }

  return packageJson;
}

function packageName(packageJson: JsonObject, destination: string): PackageName {
  const name = packageJson["name"];
  return toExistingPackageName(
    typeof name === "string" && name.length > 0 ? name : basename(destination),
  );
}

function binName(packageJson: JsonObject, fallback: string): BinName {
  const bin = packageJson["bin"];
  if (isJsonObject(bin)) {
    const first = Object.keys(bin)[0];
    if (first !== undefined) {
      return toExistingBinName(first);
    }
  }
  return toExistingBinName(fallback);
}

function describeAdoptedProject(options: AdoptOptions): GeneratedProjectDescription {
  return describeGeneratedProject({
    destination: options.destination,
    projectName: options.projectName,
    packageName: options.packageName,
    binName: options.binName,
    backend: true,
    frontend: options.frontend,
    ai: options.ai,
    effect: options.effect,
    install: options.install,
    gitInit: false,
    yes: options.yes,
  });
}

function mergePackageJson(existing: JsonObject, expected: JsonObject): JsonObject {
  return {
    ...existing,
    scripts: mergeObjectsPreservingExisting(
      objectField(existing, "scripts"),
      objectField(expected, "scripts"),
    ),
    dependencies: mergeObjectsPreservingExisting(
      objectField(existing, "dependencies"),
      objectField(expected, "dependencies"),
    ),
    devDependencies: mergeObjectsPreservingExisting(
      objectField(existing, "devDependencies"),
      objectField(expected, "devDependencies"),
    ),
    workspaces: mergeStringArrayPreservingExisting(existing["workspaces"], expected["workspaces"]),
  };
}

function withAdoptionPackageScripts(expected: JsonObject, context: TemplateContext): JsonObject {
  if (!context.ai) {
    return expected;
  }

  return {
    ...expected,
    scripts: {
      ...objectField(expected, "scripts"),
      "agents:sync": "bun scripts/agents/sync-agents-md.ts --write --preserve-root",
      "agents:check": "bun scripts/agents/sync-agents-md.ts --check --preserve-root",
    },
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function planStaticFile(
  destination: string,
  sourceRoot: string,
  relativePath: string,
  reason: string,
): Promise<AdoptionAction> {
  const safePath = toSafeRelativePath(relativePath);
  const content = await readText(join(sourceRoot, safePath));
  const target = join(destination, safePath);
  const blockedBy = blockingParentPath(destination, safePath);
  if (blockedBy !== undefined) {
    return {
      kind: "conflict",
      path: safePath,
      reason: `Cannot create below existing non-directory path: ${blockedBy}`,
    };
  }
  if (!existsSync(target)) {
    return { kind: "create", path: safePath, reason, content };
  }

  const existing = await readText(target);
  if (existing === content) {
    return { kind: "skip", path: safePath, reason: "Already matches Bun Forge output" };
  }

  return {
    kind: "conflict",
    path: safePath,
    reason: `Existing file differs from Bun Forge ${reason}`,
  };
}

function presetAdoptionReason(name: PresetName): string {
  switch (name) {
    case "base":
      return "base tooling file";
    case "frontend-tanstack":
      return "frontend preset file";
    case "ai":
      return "AI tooling file";
    case "effect":
      return "Effect preset file";
  }
}

function applyPresetAdoptionPolicy(action: AdoptionAction): AdoptionAction {
  if (
    action.kind === "conflict" &&
    action.path.startsWith(".codex/") &&
    action.reason.includes("existing non-directory path")
  ) {
    return {
      kind: "skip",
      path: action.path,
      reason: "Existing .codex path is not a directory; Codex config preserved and skipped",
    };
  }

  return action;
}

async function planPresetCopySpec(
  destination: string,
  spec: PresetCopySpec,
): Promise<AdoptionAction[]> {
  const reason = presetAdoptionReason(spec.name);
  const actions = await Promise.all(
    spec.relativePaths.map(async (path) =>
      planStaticFile(destination, spec.sourceDir, path, reason),
    ),
  );
  return actions.map(applyPresetAdoptionPolicy);
}

async function planPackageJson(
  destination: string,
  description: GeneratedProjectDescription,
): Promise<AdoptionAction> {
  const context = description.templateContext;
  const relativePath = toSafeRelativePath("package.json");
  const packagePath = join(destination, relativePath);
  const existing = await parseJsonFile(packagePath);
  const expected = withAdoptionPackageScripts(
    renderJsonTemplate("package.json.tpl", context),
    context,
  );
  const merged = mergePackageJson(existing, expected);
  const content = stableJson(merged);
  const current = await readText(packagePath);

  if (current === content) {
    return {
      kind: "skip",
      path: relativePath,
      reason: "package.json already has Bun Forge wiring",
    };
  }

  return {
    kind: "modify",
    path: relativePath,
    reason: "Merge Bun Forge scripts and dependencies without overwriting existing entries",
    content,
  };
}

function templateAdoptionPath(spec: TemplateRenderSpec): string {
  if (spec.relativePath === ".claude/rules/project-conventions.md") {
    return ".claude/rules/bun-forge-project-conventions.md";
  }

  if (spec.relativePath === ".claude/rules/frontend-conventions.md") {
    return ".claude/rules/bun-forge-frontend-conventions.md";
  }

  return spec.relativePath;
}

function templateCreateReason(spec: TemplateRenderSpec): string {
  switch (spec.relativePath) {
    case "README.md":
      return "create Bun Forge README";
    case "tsconfig.json":
      return "adopt Bun Forge TypeScript config";
    case "knip.jsonc":
      return "adopt Bun Forge dead-code config";
    case "lefthook.yml":
      return "adopt Bun Forge Git hooks";
    case "CLAUDE.md":
      return "create Claude guidance";
    case ".claude/rules/project-conventions.md":
      return "create Bun Forge Claude project convention rule";
    case ".claude/rules/frontend-conventions.md":
      return "create Bun Forge Claude frontend convention rule";
    case "apps/frontend/package.json":
      return "create TanStack frontend package";
    case "apps/frontend/index.html":
      return "create TanStack frontend entry HTML";
    case "apps/frontend/vite.config.ts":
      return "create TanStack frontend Vite config";
    case "apps/frontend/playwright.config.ts":
      return "create TanStack frontend Playwright config";
    case "apps/frontend/src/main.tsx":
      return "create TanStack frontend entrypoint";
    case "apps/frontend/src/routeTree.gen.ts":
      return "seed TanStack route tree";
    case "apps/frontend/src/routes/__root.tsx":
      return "create TanStack root route";
    case "apps/frontend/src/routes/index.tsx":
      return "create TanStack index route";
    case "apps/frontend/src/routes/-index.test.tsx":
      return "create TanStack route test";
    case "apps/frontend/src/testing/setup.ts":
      return "create TanStack frontend test setup";
    case "apps/frontend/e2e/home.spec.ts":
      return "create TanStack frontend e2e test";
    case "apps/frontend/src/styles.css":
      return "create TanStack frontend styles";
    default:
      return `create Bun Forge template output from ${spec.templateName}`;
  }
}

function templatePreserveReason(spec: TemplateRenderSpec): string {
  switch (spec.relativePath) {
    case "CLAUDE.md":
      return "Existing Claude/root guidance preserved";
    case ".claude/rules/project-conventions.md":
      return "Existing Bun Forge Claude project convention rule preserved";
    case ".claude/rules/frontend-conventions.md":
      return "Existing Bun Forge Claude frontend convention rule preserved";
    default:
      return "Existing project file preserved";
  }
}

function shouldPreserveExistingTemplate(spec: TemplateRenderSpec): boolean {
  return (
    spec.relativePath === "CLAUDE.md" ||
    spec.relativePath === ".claude/rules/project-conventions.md" ||
    spec.relativePath === ".claude/rules/frontend-conventions.md"
  );
}

function shouldSkipTemplateInAdopt(spec: TemplateRenderSpec): boolean {
  return spec.relativePath === "src/index.ts" || spec.relativePath === "src/index.test.ts";
}

async function planPreservedTemplateFile(
  destination: string,
  context: TemplateContext,
  templateName: string,
  relativePath: string,
  createReason: string,
  preserveReason: string,
): Promise<AdoptionAction> {
  const safePath = toSafeRelativePath(relativePath);
  const content = renderTemplate(templateName, context);
  const target = join(destination, safePath);
  const blockedBy = blockingParentPath(destination, safePath);
  if (blockedBy !== undefined) {
    return {
      kind: "conflict",
      path: safePath,
      reason: `Cannot create below existing non-directory path: ${blockedBy}`,
    };
  }
  if (!existsSync(target)) {
    return { kind: "create", path: safePath, reason: createReason, content };
  }

  const existing = await readText(target);
  if (existing === content) {
    return { kind: "skip", path: safePath, reason: "Already matches Bun Forge output" };
  }

  return { kind: "skip", path: safePath, reason: preserveReason };
}

async function planTemplateFile(
  destination: string,
  context: TemplateContext,
  templateName: string,
  relativePath: string,
  reason: string,
): Promise<AdoptionAction> {
  const safePath = toSafeRelativePath(relativePath);
  const content = renderTemplate(templateName, context);
  const target = join(destination, safePath);
  const blockedBy = blockingParentPath(destination, safePath);
  if (blockedBy !== undefined) {
    return {
      kind: "conflict",
      path: safePath,
      reason: `Cannot create below existing non-directory path: ${blockedBy}`,
    };
  }
  if (!existsSync(target)) {
    return { kind: "create", path: safePath, reason, content };
  }

  const existing = await readText(target);
  if (existing === content) {
    return { kind: "skip", path: safePath, reason: "Already matches Bun Forge output" };
  }

  return {
    kind: "conflict",
    path: safePath,
    reason: `Existing file needs review before ${reason}`,
  };
}

function hasExistingFrontend(
  destination: string,
  description: GeneratedProjectDescription,
): boolean {
  return (
    description.shape.frontend === "tanstack" && existsSync(join(destination, "apps/frontend"))
  );
}

function isFrontendPresetSpec(spec: PresetCopySpec): boolean {
  return spec.name === "frontend-tanstack";
}

function isFrontendTemplateSpec(spec: TemplateRenderSpec): boolean {
  return spec.relativePath.startsWith("apps/frontend/");
}

async function planPresetCopySpecs(
  destination: string,
  description: GeneratedProjectDescription,
): Promise<AdoptionAction[]> {
  const preserveExistingFrontend = hasExistingFrontend(destination, description);
  const specs = description.presetCopySpecs.filter(
    (spec) => !(preserveExistingFrontend && isFrontendPresetSpec(spec)),
  );
  const actionSets = await Promise.all(
    specs.map(async (spec) => planPresetCopySpec(destination, spec)),
  );
  return actionSets.flat();
}

async function planTemplateSpec(
  destination: string,
  description: GeneratedProjectDescription,
  spec: TemplateRenderSpec,
): Promise<AdoptionAction> {
  if (spec.relativePath === "package.json") {
    return planPackageJson(destination, description);
  }

  if (shouldSkipTemplateInAdopt(spec)) {
    return {
      kind: "skip",
      path: toSafeRelativePath(spec.relativePath),
      reason: "Existing project source preserved; Bun Forge starter source skipped",
    };
  }

  if (shouldPreserveExistingTemplate(spec)) {
    return planPreservedTemplateFile(
      destination,
      description.templateContext,
      spec.templateName,
      templateAdoptionPath(spec),
      templateCreateReason(spec),
      templatePreserveReason(spec),
    );
  }

  return planTemplateFile(
    destination,
    description.templateContext,
    spec.templateName,
    spec.relativePath,
    templateCreateReason(spec),
  );
}

async function planTemplateRenderSpecs(
  destination: string,
  description: GeneratedProjectDescription,
): Promise<AdoptionAction[]> {
  const preserveExistingFrontend = hasExistingFrontend(destination, description);
  const specs = description.templateRenderSpecs.filter(
    (spec) => !(preserveExistingFrontend && isFrontendTemplateSpec(spec)),
  );
  return Promise.all(specs.map(async (spec) => planTemplateSpec(destination, description, spec)));
}

function planExistingFrontendConflict(
  destination: string,
  description: GeneratedProjectDescription,
): AdoptionAction[] {
  if (!hasExistingFrontend(destination, description)) {
    return [];
  }

  return [
    {
      kind: "conflict",
      path: toSafeRelativePath("apps/frontend"),
      reason: "Existing frontend detected; Bun Forge does not convert frontends in adopt v1",
    },
  ];
}

export function normalizeAdoptOptions(
  destinationArg: string | undefined,
  flags: AdoptOptionsInput,
): AdoptOptions {
  const destination = resolve(flags.destination ?? destinationArg ?? ".");
  const fallbackName = basename(destination);
  const projectName = toProjectName(flags.projectName ?? fallbackName);
  const packageNameValue =
    flags.packageName !== undefined
      ? toExistingPackageName(flags.packageName)
      : toPackageName(projectName);
  return {
    destination,
    projectName,
    packageName: packageNameValue,
    binName:
      flags.binName !== undefined
        ? toExistingBinName(flags.binName)
        : toExistingBinName(packageNameValue),
    frontend: flags.frontend ?? "none",
    ai: flags.ai ?? true,
    effect: flags.effect ?? false,
    install: flags.install ?? false,
    apply: flags.apply ?? false,
    rollback: flags.rollback !== undefined ? toBackupRunId(flags.rollback) : undefined,
    yes: flags.yes ?? false,
  };
}

export async function deriveAdoptOptions(
  destinationArg: string | undefined,
  flags: AdoptOptionsInput,
): Promise<AdoptOptions> {
  const normalized = normalizeAdoptOptions(destinationArg, flags);
  const packageJson = await assertAdoptableProject(normalized.destination);
  const name = packageName(packageJson, normalized.destination);
  return {
    ...normalized,
    projectName:
      flags.projectName !== undefined ? toProjectName(flags.projectName) : toProjectName(name),
    packageName: flags.packageName !== undefined ? toExistingPackageName(flags.packageName) : name,
    binName:
      flags.binName !== undefined ? toExistingBinName(flags.binName) : binName(packageJson, name),
  };
}

export async function buildAdoptionPlan(
  options: AdoptOptions,
  runtime: AdoptRuntime = defaultAdoptRuntime,
): Promise<AdoptionPlan> {
  await assertAdoptableProject(options.destination);
  const description = describeAdoptedProject(options);
  const actions: AdoptionAction[] = [
    ...(await planPresetCopySpecs(options.destination, description)),
    ...(await planTemplateRenderSpecs(options.destination, description)),
    ...planExistingFrontendConflict(options.destination, description),
  ];

  return {
    destination: options.destination,
    runId: toBackupRunId(runtime.now().toISOString().replaceAll(/[:.]/g, "-")),
    actions,
  };
}

async function backupExistingFile(
  destination: string,
  root: string,
  relativePath: SafeRelativePath,
): Promise<SafeRelativePath> {
  const backupPath = backupFilePath(relativePath);
  const absoluteBackupPath = join(root, backupPath);
  await mkdir(dirname(absoluteBackupPath), { recursive: true });
  await copyFile(join(destination, relativePath), absoluteBackupPath);
  return backupPath;
}

export async function applyAdoptionPlan(
  plan: AdoptionPlan,
  options: AdoptOptions,
  runtime: AdoptRuntime = defaultAdoptRuntime,
): Promise<BackupManifest> {
  const manifest: BackupManifest = { runId: plan.runId, entries: [] };
  const root = backupRoot(plan.destination, plan.runId);
  const writableActions = plan.actions.filter(
    (action): action is WritableAdoptionAction =>
      action.kind === "create" || action.kind === "modify",
  );

  await Promise.all(
    writableActions.map(async (action) => {
      if (action.kind === "modify") {
        const backupPath = await backupExistingFile(plan.destination, root, action.path);
        manifest.entries.push({ path: action.path, kind: "modified", backupPath });
      } else {
        manifest.entries.push({ path: action.path, kind: "created" });
      }

      await writeText(join(plan.destination, action.path), action.content);
    }),
  );

  await writeText(join(root, "manifest.json"), stableJson(manifest));

  if (options.ai && existsSync(join(options.destination, "scripts/agents/sync-agents-md.ts"))) {
    await runtime.runCommand(
      ["bun", "scripts/agents/sync-agents-md.ts", "--write", "--preserve-root"],
      options.destination,
    );
  }

  if (options.install) {
    await runtime.finalizeProject({ ...options, backend: true, ai: false, gitInit: false });
  }

  return manifest;
}

export async function rollbackAdoption(
  destination: string,
  runId: string,
): Promise<BackupManifest> {
  const safeRunId = toBackupRunId(runId);
  const root = backupRoot(destination, safeRunId);
  const manifest = parseJsonObject(
    await readText(join(root, "manifest.json")),
    join(root, "manifest.json"),
  );
  if (
    !isJsonObject(manifest) ||
    typeof manifest["runId"] !== "string" ||
    !Array.isArray(manifest["entries"])
  ) {
    throw new TypeError(`Invalid adoption rollback manifest: ${join(root, "manifest.json")}`);
  }

  const entries: BackupEntry[] = manifest["entries"].map((entry) => {
    if (
      !isJsonObject(entry) ||
      typeof entry["path"] !== "string" ||
      typeof entry["kind"] !== "string"
    ) {
      throw new TypeError("Invalid adoption rollback manifest entry");
    }
    if (entry["kind"] === "created") {
      return { path: toSafeRelativePath(entry["path"]), kind: "created" };
    }
    if (entry["kind"] === "modified" && typeof entry["backupPath"] === "string") {
      return {
        path: toSafeRelativePath(entry["path"]),
        kind: "modified",
        backupPath: toSafeRelativePath(entry["backupPath"]),
      };
    }
    throw new TypeError("Invalid adoption rollback manifest entry");
  });

  await entries.toReversed().reduce(async (previous, entry) => {
    await previous;
    const target = join(destination, entry.path);
    if (entry.kind === "created") {
      await rm(target, { recursive: true, force: true });
    } else if (entry.backupPath !== undefined) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, entry.backupPath), target);
    }
  }, Promise.resolve());

  return { runId: toBackupRunId(manifest["runId"]), entries };
}

export function formatAdoptionPlan(plan: AdoptionPlan): string {
  const counts = new Map<string, number>();
  for (const action of plan.actions) {
    counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1);
  }

  const lines = [
    `Adoption plan for ${plan.destination}`,
    `runId: ${plan.runId}`,
    `create: ${counts.get("create") ?? 0}, modify: ${counts.get("modify") ?? 0}, skip: ${
      counts.get("skip") ?? 0
    }, conflict: ${counts.get("conflict") ?? 0}`,
  ];

  for (const action of plan.actions) {
    lines.push(`${action.kind.padEnd(8)} ${action.path} - ${action.reason}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function adoptProject(
  options: AdoptOptions,
  runtime: AdoptRuntime = defaultAdoptRuntime,
): Promise<AdoptionPlan> {
  if (options.rollback !== undefined) {
    await rollbackAdoption(options.destination, options.rollback);
    return { destination: options.destination, runId: options.rollback, actions: [] };
  }

  const plan = await buildAdoptionPlan(options, runtime);
  if (options.apply) {
    await applyAdoptionPlan(plan, options, runtime);
  }
  return plan;
}
