import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
  readonly lint: boolean;
  readonly lintFix: boolean;
  readonly formatMode: "write" | "check";
};

const generatedPathPatterns = [
  /^AGENTS\.md$/,
  /^\.agents\/agents-md-manifest\.json$/,
  /^(?:src|scripts|templates|template-sources|\.claude\/rules)(?:\/[^/]+)*\/AGENTS\.md$/,
];

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
]);

const rootWorkspace: Workspace = {
  name: "root",
  lintArgs: [],
  lintConfig: ".oxlintrc.jsonc",
  formatConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: true,
  formatMode: "write",
};

const codexHookWorkspace: Workspace = {
  name: "codex-hooks",
  lintArgs: [],
  lintConfig: ".oxlintrc.jsonc",
  formatConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: false,
  formatMode: "check",
};

const formatOnlyWorkspace: Workspace = {
  name: "format-only",
  lintArgs: [],
  lintConfig: ".oxlintrc.jsonc",
  formatConfig: ".oxfmtrc.jsonc",
  lint: false,
  lintFix: false,
  formatMode: "write",
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

export function forbiddenTouchedPaths(paths: readonly string[]): string[] {
  return paths.filter((filePath) =>
    generatedPathPatterns.some((pattern) => pattern.test(filePath)),
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
  const forbidden = forbiddenTouchedPaths(paths);
  if (forbidden.length > 0) {
    return { blockReason: generatedPathMessage(forbidden) };
  }

  const failures: string[] = [];
  let needsProductContract = false;
  for (const filePath of paths) {
    const absolute = path.join(root, filePath);
    if (!existsSync(absolute)) {
      continue;
    }

    if (isProductSurface(filePath)) {
      needsProductContract = true;
    }

    const workspace = workspaceForPath(filePath);
    if (workspace === null) {
      continue;
    }

    const format = await maybeFormat(root, filePath, workspace, runner);
    if (format.code !== 0) {
      failures.push(commandFailure("format", filePath, format));
      continue;
    }

    const lint = await maybeLint(root, filePath, workspace, runner);
    if (lint.code !== 0) {
      failures.push(commandFailure("lint", filePath, lint));
    }
  }

  if (needsProductContract) {
    const contract = await runner(["bun", "run", "--silent", "test:project-contract"], {
      cwd: root,
    });
    if (contract.code !== 0) {
      failures.push(commandFailure("product-contract", "templates/template-sources", contract));
    }
  }

  if (failures.length > 0) {
    return { blockReason: `Codex post-edit quality gate failed:\n${failures.join("\n\n")}` };
  }
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
  const forbidden = forbiddenTouchedPaths(await readTouchedPaths(input));
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
  if (filePath.startsWith(".codex/hooks/")) {
    return codexHookWorkspace;
  }
  if (filePath.startsWith(".claude/hooks/")) {
    return rootWorkspace;
  }
  if (filePath.startsWith("templates/")) {
    return formatOnlyWorkspace;
  }
  if (filePath.startsWith("template-sources/")) {
    return formatOnlyWorkspace;
  }
  return null;
}

function isProductSurface(filePath: string): boolean {
  return filePath.startsWith("templates/") || filePath.startsWith("template-sources/");
}

async function maybeFormat(
  root: string,
  filePath: string,
  workspace: Workspace,
  runner: CommandRunner,
): Promise<CommandResult> {
  if (!formatExtensions.has(path.extname(filePath).toLowerCase())) {
    return { code: 0, stdout: "", stderr: "" };
  }
  const mode = workspace.formatMode === "write" ? "--write" : "--check";
  return runner([localTool(root, "oxfmt"), mode, "-c", workspace.formatConfig, filePath], {
    cwd: root,
  });
}

async function maybeLint(
  root: string,
  filePath: string,
  workspace: Workspace,
  runner: CommandRunner,
): Promise<CommandResult> {
  if (!workspace.lint || !lintExtensions.has(path.extname(filePath).toLowerCase())) {
    return { code: 0, stdout: "", stderr: "" };
  }

  if (workspace.lintFix) {
    await runner(
      [
        localTool(root, "oxlint"),
        ...workspace.lintArgs,
        "-c",
        workspace.lintConfig,
        "--fix",
        "--quiet",
        filePath,
      ],
      { cwd: root },
    );
  }

  return runner(
    [
      localTool(root, "oxlint"),
      ...workspace.lintArgs,
      "-c",
      workspace.lintConfig,
      "--quiet",
      "--format=unix",
      filePath,
    ],
    { cwd: root },
  );
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
  )}. Edit CLAUDE.md or .claude/rules/*.md, then run bun run agents:sync.`;
}

function commandFailure(label: string, filePath: string, result: CommandResult): string {
  return `${label}: ${filePath}\n${tail(commandOutput(result), 40)}`;
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

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
