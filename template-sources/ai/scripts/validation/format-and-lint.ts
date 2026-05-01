#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolveBin, resolveProjectRoot } from "./resolve-bin";

export type HookInput = {
  tool_input: {
    file_path?: string;
    edits?: Array<{
      file_path?: string;
    }>;
  };
};

type Workspace = {
  readonly oxlintConfig: string;
  readonly oxlintArgs: ReadonlyArray<string>;
  readonly oxfmtConfig: string;
  readonly lintFix: boolean;
  readonly formatMode: "write" | "check";
};

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ROOT_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lintFix: true,
  formatMode: "write",
};
const CODEX_HOOK_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lintFix: false,
  formatMode: "check",
};
const FRONTEND_WORKSPACE: Workspace = {
  oxlintConfig: "apps/frontend/.oxlintrc.jsonc",
  oxlintArgs: ["--type-aware"],
  oxfmtConfig: "apps/frontend/.oxfmtrc.jsonc",
  lintFix: true,
  formatMode: "write",
};

const SUMMARY_LINE = /^\d+ problems?$/;
const PHANTOM_WARNING = /^:0:0:\s+\[Warning\]$/;

export function parseFilePath(raw: string): string | null {
  return parseFilePaths(raw)[0] ?? null;
}

export function parseFilePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && isRecord(parsed["tool_input"])) {
      const paths = new Set<string>();
      const toolInput = parsed["tool_input"];
      if ("file_path" in toolInput && typeof toolInput["file_path"] === "string") {
        paths.add(toolInput["file_path"]);
      }
      if ("edits" in toolInput && Array.isArray(toolInput["edits"])) {
        for (const edit of toolInput["edits"]) {
          if (isRecord(edit) && typeof edit["file_path"] === "string") {
            paths.add(edit["file_path"]);
          }
        }
      }
      return [...paths];
    }
    return [];
  } catch {
    return [];
  }
}

export function resolveWorkspace(filePath: string): Workspace | null {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  if (!LINTABLE_EXTENSIONS.has(ext)) {
    return null;
  }

  const normalized = filePath.replace(`${process.cwd()}/`, "").replace(/^\.\//, "");
  if (
    normalized.startsWith("src/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith(".claude/hooks/")
  ) {
    return ROOT_WORKSPACE;
  }
  if (normalized.startsWith(".codex/hooks/")) {
    return CODEX_HOOK_WORKSPACE;
  }
  if (normalized.startsWith("apps/frontend/")) {
    return FRONTEND_WORKSPACE;
  }
  return null;
}

function blockingLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !SUMMARY_LINE.test(line) && !PHANTOM_WARNING.test(line));
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await Bun.file(filePath).text();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type BucketEntry = {
  readonly workspace: Workspace;
  readonly lintFixPaths: string[];
  readonly lintCheckPaths: string[];
  readonly formatPaths: string[];
};

function bucketByWorkspace(filePaths: readonly string[]): Map<Workspace, BucketEntry> {
  const buckets = new Map<Workspace, BucketEntry>();
  for (const filePath of filePaths) {
    const workspace = resolveWorkspace(filePath);
    if (workspace === null) {
      continue;
    }
    let bucket = buckets.get(workspace);
    if (bucket === undefined) {
      bucket = { workspace, lintFixPaths: [], lintCheckPaths: [], formatPaths: [] };
      buckets.set(workspace, bucket);
    }
    if (workspace.lintFix) {
      bucket.lintFixPaths.push(filePath);
    }
    bucket.lintCheckPaths.push(filePath);
    bucket.formatPaths.push(filePath);
  }
  return buckets;
}

function summarizePaths(paths: readonly string[]): string {
  if (paths.length === 1) {
    return paths[0]!;
  }
  const head = paths.slice(0, 3).join(", ");
  return `${paths.length} files: ${head}${paths.length > 3 ? ", ..." : ""}`;
}

if (import.meta.main) {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const oxlint = resolveBin(projectRoot, "oxlint");
  const oxfmt = resolveBin(projectRoot, "oxfmt");
  const input = await Bun.stdin.text();
  const rawPaths = parseFilePaths(input);
  if (rawPaths.length === 0) {
    process.exit(0);
  }

  const filePaths = rawPaths.filter((filePath) => existsSync(filePath));
  if (filePaths.length === 0) {
    process.exit(0);
  }

  const captureTarget = filePaths.length === 1 ? filePaths[0]! : null;
  const beforeFormat = captureTarget !== null ? await readTextFile(captureTarget) : null;

  const buckets = bucketByWorkspace(filePaths);
  const failures: string[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.lintFixPaths.length > 0) {
      Bun.spawnSync(
        [
          oxlint,
          ...bucket.workspace.oxlintArgs,
          "-c",
          bucket.workspace.oxlintConfig,
          "--fix",
          "--quiet",
          ...bucket.lintFixPaths,
        ],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      );
    }

    if (bucket.formatPaths.length > 0) {
      const mode = bucket.workspace.formatMode === "write" ? "--write" : "--check";
      const format = Bun.spawnSync(
        [oxfmt, mode, "-c", bucket.workspace.oxfmtConfig, ...bucket.formatPaths],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      if (format.exitCode !== 0) {
        const output = [format.stderr.toString(), format.stdout.toString()]
          .filter(Boolean)
          .join("\n")
          .trim();
        failures.push(
          output ||
            `format: ${summarizePaths(bucket.formatPaths)} exited with code ${format.exitCode}`,
        );
        continue;
      }
    }

    if (bucket.lintCheckPaths.length > 0) {
      const lint = Bun.spawnSync(
        [
          oxlint,
          ...bucket.workspace.oxlintArgs,
          "-c",
          bucket.workspace.oxlintConfig,
          "--quiet",
          "--format=unix",
          ...bucket.lintCheckPaths,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      if (lint.exitCode !== 0) {
        const output = [lint.stderr.toString(), lint.stdout.toString()]
          .filter(Boolean)
          .join("\n")
          .trim();
        const lines = blockingLines(output);
        if (lines.length > 0) {
          failures.push(lines.join("\n"));
        }
      }
    }
  }

  let updatedToolOutput: string | null = null;
  if (captureTarget !== null) {
    const finalContent = await readTextFile(captureTarget);
    if (beforeFormat !== null && finalContent !== null && finalContent !== beforeFormat) {
      updatedToolOutput = finalContent;
    }
  }

  if (failures.length > 0) {
    const result: {
      decision: "block";
      reason: string;
      hookSpecificOutput?: {
        hookEventName: "PostToolUse";
        updatedToolOutput: string;
      };
    } = { decision: "block", reason: failures.join("\n") };
    if (updatedToolOutput !== null) {
      result.hookSpecificOutput = {
        hookEventName: "PostToolUse",
        updatedToolOutput,
      };
    }
    console.log(JSON.stringify(result));
  } else if (updatedToolOutput !== null) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          updatedToolOutput,
        },
      }),
    );
  }
}
