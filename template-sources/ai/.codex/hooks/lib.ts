import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type HookInput = {
  readonly session_id?: string;
  readonly turn_id?: string;
  readonly cwd?: string;
  readonly stop_hook_active?: boolean;
  readonly tool_input?: Record<string, unknown>;
};

export type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandRunner = (
  command: readonly string[],
  options: { readonly cwd: string },
) => Promise<CommandResult>;

export type HookResult = {
  readonly blockReason?: string;
  readonly systemMessage?: string;
};

type Workspace = {
  readonly name: string;
  readonly lintArgs: readonly string[];
  readonly lintConfig: string;
  readonly formatConfig: string;
};

const generatedPathPatterns = [
  /^\.agents\/agents-md-manifest\.json$/,
  /^apps\/frontend\/src\/routeTree\.gen\.ts$/,
];
const generatedAgentPathFallbackPatterns = [/^(?:.+\/)?AGENTS\.md$/];
const lintExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const formatExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".html",
  ".css",
  ".md",
  ".mdx",
]);

const rootWorkspace: Workspace = {
  name: "root",
  lintArgs: [],
  lintConfig: ".oxlintrc.jsonc",
  formatConfig: ".oxfmtrc.jsonc",
};

const frontendWorkspace: Workspace = {
  name: "frontend",
  lintArgs: ["--type-aware"],
  lintConfig: "apps/frontend/.oxlintrc.jsonc",
  formatConfig: "apps/frontend/.oxfmtrc.jsonc",
};

export async function readHookInput(): Promise<HookInput> {
  const text = await Bun.stdin.text();
  if (text.trim() === "") {
    return {};
  }
  return parseHookInput(JSON.parse(text) as unknown);
}

export function parseHookInput(value: unknown): HookInput {
  if (!isRecord(value)) {
    return {};
  }

  const sessionId = valueAsString(value["session_id"]);
  const turnId = valueAsString(value["turn_id"]);
  const cwd = valueAsString(value["cwd"]);
  const stopHookActive = value["stop_hook_active"];
  const toolInput = value["tool_input"];

  return {
    ...(sessionId === undefined ? {} : { session_id: sessionId }),
    ...(turnId === undefined ? {} : { turn_id: turnId }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(typeof stopHookActive === "boolean" ? { stop_hook_active: stopHookActive } : {}),
    ...(isRecord(toolInput) ? { tool_input: toolInput } : {}),
  };
}

export function repoRoot(input: HookInput): string {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return cwd;
  }
}

export function extractTouchedPaths(input: HookInput, root = repoRoot(input)): string[] {
  const toolInput = input.tool_input ?? {};
  const candidates = new Set<string>();
  const cwd = path.resolve(input.cwd ?? root);

  const command = valueAsString(toolInput["command"]);
  if (command !== undefined) {
    for (const filePath of extractApplyPatchPaths(command)) {
      candidates.add(filePath);
    }
  }

  for (const key of ["file_path", "filePath", "path"]) {
    const value = valueAsString(toolInput[key]);
    if (value !== undefined) {
      candidates.add(value);
    }
  }

  const edits = toolInput["edits"];
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (!isRecord(edit)) {
        continue;
      }
      const value = valueAsString(edit["file_path"] ?? edit["filePath"] ?? edit["path"]);
      if (value !== undefined) {
        candidates.add(value);
      }
    }
  }

  return [...candidates]
    .map((filePath) => normalizeProjectPath(filePath, root, cwd))
    .filter((filePath): filePath is string => filePath !== null)
    .sort();
}

export function extractApplyPatchPaths(patch: string): string[] {
  const paths = new Set<string>();
  const prefixes = ["*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "];

  for (const rawLine of patch.split(/\r?\n/)) {
    for (const prefix of prefixes) {
      if (rawLine.startsWith(prefix)) {
        paths.add(rawLine.slice(prefix.length).trim());
      }
    }
  }

  return [...paths];
}

export function normalizeProjectPath(filePath: string, root: string, cwd = root): string | null {
  if (filePath.trim() === "") {
    return null;
  }

  const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd, filePath);
  const relative = path.relative(root, absolute);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return toPosix(relative);
}

export function forbiddenTouchedPaths(paths: readonly string[], root = process.cwd()): string[] {
  const manifestGeneratedPaths = generatedAgentPathsFromManifest(root);
  return paths.filter(
    (filePath) =>
      manifestGeneratedPaths.paths.has(filePath) ||
      generatedPathPatterns.some((pattern) => pattern.test(filePath)) ||
      (manifestGeneratedPaths.useFallbackPatterns &&
        generatedAgentPathFallbackPatterns.some((pattern) => pattern.test(filePath))),
  );
}

export async function recordTouchedPaths(
  input: HookInput,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const filePath = touchedStatePath(input);
  await mkdir(path.dirname(filePath), { recursive: true });
  const next = [...new Set([...(await readTouchedPaths(input)), ...paths])].sort();
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function readTouchedPaths(input: HookInput): Promise<string[]> {
  const filePath = touchedStatePath(input);
  if (!existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === "string").sort()
    : [];
}

export async function clearTouchedPaths(input: HookInput): Promise<void> {
  await rm(touchedStatePath(input), { force: true });
}

export async function defaultRunCommand(
  command: readonly string[],
  options: { readonly cwd: string },
): Promise<CommandResult> {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    Bun.readableStreamToText(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

export async function runPostEditQuality(
  input: HookInput,
  runner: CommandRunner = defaultRunCommand,
): Promise<HookResult> {
  const root = repoRoot(input);
  const extracted = extractTouchedPaths(input, root);
  await recordTouchedPaths(input, extracted);

  const paths = extracted.length > 0 ? extracted : await readTouchedPaths(input);
  const forbidden = forbiddenTouchedPaths(paths, root);
  if (forbidden.length > 0) {
    return { blockReason: generatedPathMessage(forbidden) };
  }

  const existingPaths = paths.filter((filePath) => existsSync(path.join(root, filePath)));
  const buckets = bucketByWorkspace(existingPaths);
  const failures: string[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.lintFixPaths.length > 0) {
      const lintFix = await runner(
        [
          localTool(root, "oxlint"),
          ...bucket.workspace.lintArgs,
          "-c",
          bucket.workspace.lintConfig,
          "--fix",
          "--quiet",
          ...bucket.lintFixPaths,
        ],
        { cwd: root },
      );
      if (lintFix.code !== 0) {
        failures.push(batchedCommandFailure("lint --fix", bucket.lintFixPaths, lintFix));
        continue;
      }
    }

    if (bucket.formatPaths.length > 0) {
      const format = await runner(
        [
          localTool(root, "oxfmt"),
          "--write",
          "-c",
          bucket.workspace.formatConfig,
          ...bucket.formatPaths,
        ],
        { cwd: root },
      );
      if (format.code !== 0) {
        failures.push(batchedCommandFailure("format", bucket.formatPaths, format));
        continue;
      }
    }

    if (bucket.lintCheckPaths.length > 0) {
      const lint = await runner(
        [
          localTool(root, "oxlint"),
          ...bucket.workspace.lintArgs,
          "-c",
          bucket.workspace.lintConfig,
          "--quiet",
          "--format=unix",
          ...bucket.lintCheckPaths,
        ],
        { cwd: root },
      );
      if (lint.code !== 0) {
        failures.push(batchedCommandFailure("lint", bucket.lintCheckPaths, lint));
      }
    }
  }

  if (failures.length > 0) {
    return { blockReason: `Codex post-edit quality gate failed:\n${failures.join("\n\n")}` };
  }
  // TODO(Codex): when PostToolUse supports updated file output for edits,
  // report autofixed content through that channel instead of relying only on
  // filesystem mutation. Avoid echoing whole files into context meanwhile.
  return {};
}

export async function runStopValidation(
  input: HookInput,
  runner: CommandRunner = defaultRunCommand,
): Promise<HookResult> {
  if (input.stop_hook_active === true) {
    return {};
  }

  const root = repoRoot(input);
  const forbidden = forbiddenTouchedPaths(await readTouchedPaths(input), root);
  if (forbidden.length > 0) {
    return { blockReason: generatedPathMessage(forbidden) };
  }

  const result = await runner(["bun", "scripts/validation/validate-on-stop.ts"], { cwd: root });
  if (result.code !== 0) {
    return {
      blockReason: `Stop validation failed:\n${tail(commandOutput(result), 80)}`,
    };
  }

  await clearTouchedPaths(input);
  return {};
}

type BucketEntry = {
  readonly workspace: Workspace;
  readonly lintFixPaths: string[];
  readonly lintCheckPaths: string[];
  readonly formatPaths: string[];
};

function workspaceForPath(filePath: string): Workspace | null {
  const extension = path.extname(filePath).toLowerCase();
  if (!formatExtensions.has(extension) && !lintExtensions.has(extension)) {
    return null;
  }
  if (filePath.startsWith("src/")) {
    return rootWorkspace;
  }
  if (filePath.startsWith("scripts/")) {
    return rootWorkspace;
  }
  if (filePath.startsWith("apps/frontend/")) {
    return frontendWorkspace;
  }
  if (filePath.startsWith("docs/") && formatExtensions.has(extension)) {
    return rootWorkspace;
  }
  if (filePath.startsWith(".codex/") && formatExtensions.has(extension)) {
    return rootWorkspace;
  }
  return null;
}

function bucketByWorkspace(filePaths: readonly string[]): Map<Workspace, BucketEntry> {
  const buckets = new Map<Workspace, BucketEntry>();
  for (const filePath of filePaths) {
    const workspace = workspaceForPath(filePath);
    if (workspace === null) {
      continue;
    }
    const extension = path.extname(filePath).toLowerCase();
    let bucket = buckets.get(workspace);
    if (bucket === undefined) {
      bucket = { workspace, lintFixPaths: [], lintCheckPaths: [], formatPaths: [] };
      buckets.set(workspace, bucket);
    }
    if (lintExtensions.has(extension)) {
      bucket.lintFixPaths.push(filePath);
      bucket.lintCheckPaths.push(filePath);
    }
    if (formatExtensions.has(extension)) {
      bucket.formatPaths.push(filePath);
    }
  }
  return buckets;
}

function batchedCommandFailure(
  label: string,
  paths: readonly string[],
  result: CommandResult,
): string {
  const summary =
    paths.length === 1
      ? paths[0]!
      : `${paths.length} files: ${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", ..." : ""}`;
  return `${label}: ${summary}\n${tail(commandOutput(result), 40)}`;
}

function localTool(root: string, name: string): string {
  const local = path.join(root, "node_modules", ".bin", name);
  return existsSync(local) ? local : name;
}

function touchedStatePath(input: HookInput): string {
  const root = repoRoot(input);
  const repoName = sanitizeStateKey(path.basename(root));
  const sessionId = sanitizeStateKey(input.session_id ?? "unknown-session");
  const turnId = sanitizeStateKey(input.turn_id ?? "unknown-turn");
  return path.join("/tmp", `${repoName}-codex-hooks`, `${sessionId}-${turnId}.json`);
}

function generatedPathMessage(paths: readonly string[]): string {
  return `Generated files must not be edited directly: ${paths.join(
    ", ",
  )}. Edit CLAUDE.md, .claude/rules/*.md, or route files, then run the matching generator.`;
}

function generatedAgentPathsFromManifest(root: string): {
  readonly paths: ReadonlySet<string>;
  readonly useFallbackPatterns: boolean;
} {
  const manifestPath = path.join(root, ".agents", "agents-md-manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      paths: new Set(["AGENTS.md"]),
      useFallbackPatterns: true,
    };
  }

  const parsed = parseJsonObject(readFileSync(manifestPath, "utf8"));
  if (parsed === null) {
    return {
      paths: new Set(["AGENTS.md", ".agents/agents-md-manifest.json"]),
      useFallbackPatterns: true,
    };
  }

  const generated = stringArray(parsed["generated"]);
  const outputs = isRecord(parsed["outputs"]) ? Object.keys(parsed["outputs"]) : [];
  return {
    paths: new Set([...generated, ...outputs, ".agents/agents-md-manifest.json"]),
    useFallbackPatterns: false,
  };
}

function commandOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function tail(text: string, lines: number): string {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-lines).join("\n");
}

function sanitizeStateKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
