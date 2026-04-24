import type {
  AdoptOptions,
  AdoptOptionsInput,
  BackupRunId,
  BinName,
  PackageName,
  SafeRelativePath,
  TemplateContext,
} from "../types.ts";
import type { JsonObject } from "./json.ts";
import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { brandValue } from "../types.ts";
import { listFilesRecursive } from "./filesystem.ts";
import { finalizeProject, runCommand } from "./install.ts";
import { isJsonObject, objectField, parseJsonObject, stringArray } from "./json.ts";
import {
  toExistingBinName,
  toExistingPackageName,
  toPackageName,
  toProjectName,
} from "./naming.ts";
import { TEMPLATE_SOURCES_DIR } from "./paths.ts";
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

function templateContext(options: AdoptOptions): TemplateContext {
  return {
    projectName: options.projectName,
    packageName: options.packageName,
    binName: options.binName,
    frontend: options.frontend,
    ai: options.ai,
    effect: options.effect,
    hasWorkspaces: options.frontend === "tanstack",
  };
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

async function planStaticPreset(
  destination: string,
  presetName: string,
  reason: string,
): Promise<AdoptionAction[]> {
  const sourceRoot = join(TEMPLATE_SOURCES_DIR, presetName);
  const files = await listFilesRecursive(sourceRoot);
  return Promise.all(
    files.map(async (path) => {
      const action = await planStaticFile(destination, sourceRoot, path, reason);
      return action;
    }),
  );
}

async function planPackageJson(
  destination: string,
  context: TemplateContext,
): Promise<AdoptionAction> {
  const relativePath = toSafeRelativePath("package.json");
  const packagePath = join(destination, relativePath);
  const existing = await parseJsonFile(packagePath);
  const expected = renderJsonTemplate("package.json.tpl", context);
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

async function planFrontend(
  destination: string,
  context: TemplateContext,
): Promise<AdoptionAction[]> {
  if (context.frontend !== "tanstack") {
    return [];
  }

  if (existsSync(join(destination, "apps/frontend"))) {
    return [
      {
        kind: "conflict",
        path: toSafeRelativePath("apps/frontend"),
        reason: "Existing frontend detected; Bun Forge does not convert frontends in adopt v1",
      },
    ];
  }

  return [
    ...(await planStaticPreset(destination, "frontend-tanstack", "frontend preset file")),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/package.json.tpl",
      "apps/frontend/package.json",
      "create TanStack frontend package",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/index.html.tpl",
      "apps/frontend/index.html",
      "create TanStack frontend entry HTML",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/vite.config.ts.tpl",
      "apps/frontend/vite.config.ts",
      "create TanStack frontend Vite config",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/main.tsx.tpl",
      "apps/frontend/src/main.tsx",
      "create TanStack frontend entrypoint",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/routeTree.gen.ts.tpl",
      "apps/frontend/src/routeTree.gen.ts",
      "seed TanStack route tree",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/routes/__root.tsx.tpl",
      "apps/frontend/src/routes/__root.tsx",
      "create TanStack root route",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/routes/index.tsx.tpl",
      "apps/frontend/src/routes/index.tsx",
      "create TanStack index route",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/routes/-index.test.tsx.tpl",
      "apps/frontend/src/routes/-index.test.tsx",
      "create TanStack route test",
    ),
    await planTemplateFile(
      destination,
      context,
      "apps/frontend/src/styles.css.tpl",
      "apps/frontend/src/styles.css",
      "create TanStack frontend styles",
    ),
  ];
}

async function planAi(destination: string, context: TemplateContext): Promise<AdoptionAction[]> {
  if (!context.ai) {
    return [];
  }

  return [
    ...(await planStaticPreset(destination, "ai", "AI tooling file")),
    await planTemplateFile(
      destination,
      context,
      "CLAUDE.md.tpl",
      "CLAUDE.md",
      "create Claude guidance",
    ),
    await planTemplateFile(
      destination,
      context,
      ".claude/rules/project-conventions.md.tpl",
      ".claude/rules/project-conventions.md",
      "create Claude project convention rule",
    ),
    ...(context.frontend === "tanstack"
      ? [
          await planTemplateFile(
            destination,
            context,
            ".claude/rules/frontend-conventions.md.tpl",
            ".claude/rules/frontend-conventions.md",
            "create Claude frontend convention rule",
          ),
        ]
      : []),
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
  const context = templateContext(options);
  const actions: AdoptionAction[] = [
    ...(await planStaticPreset(options.destination, "base", "base tooling file")),
    await planPackageJson(options.destination, context),
    await planTemplateFile(
      options.destination,
      context,
      "tsconfig.json.tpl",
      "tsconfig.json",
      "adopt Bun Forge TypeScript config",
    ),
    await planTemplateFile(
      options.destination,
      context,
      "lefthook.yml.tpl",
      "lefthook.yml",
      "adopt Bun Forge Git hooks",
    ),
    ...(await planAi(options.destination, context)),
    ...(await planFrontend(options.destination, context)),
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

  const hasAiConflicts = plan.actions.some(
    (action) =>
      action.kind === "conflict" &&
      (action.path === "CLAUDE.md" ||
        action.path.startsWith(".claude/") ||
        action.path.startsWith(".codex/") ||
        action.path === ".mcp.json"),
  );

  if (
    options.ai &&
    !hasAiConflicts &&
    existsSync(join(options.destination, "scripts/agents/sync-agents-md.ts"))
  ) {
    await runtime.runCommand(
      ["bun", "scripts/agents/sync-agents-md.ts", "--write"],
      options.destination,
    );
  }

  if (options.install) {
    await runtime.finalizeProject({ ...options, ai: false, gitInit: false });
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
