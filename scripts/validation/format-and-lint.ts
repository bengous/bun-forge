#!/usr/bin/env bun

import type { Workspace } from "./format-and-lint-routing.ts";
import { existsSync } from "node:fs";
import {
  hasFormattableExtension,
  hasLintableExtension,
  isProductSurface,
  resolveLiveRepoWorkspace,
} from "./format-and-lint-routing.ts";
import { resolveBin, resolveProjectRoot } from "./resolve-bin";

export type HookInput = {
  tool_input: {
    file_path?: string;
    edits?: Array<{
      file_path?: string;
    }>;
  };
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
      const toolInput = parsed["tool_input"];
      return [...new Set([...singleFilePath(toolInput), ...editFilePaths(toolInput)])];
    }
    return [];
  } catch {
    return [];
  }
}

function singleFilePath(toolInput: Record<string, unknown>): readonly string[] {
  return typeof toolInput["file_path"] === "string" ? [toolInput["file_path"]] : [];
}

function editFilePaths(toolInput: Record<string, unknown>): readonly string[] {
  const edits = toolInput["edits"];
  return Array.isArray(edits)
    ? edits.flatMap((edit) =>
        isRecord(edit) && typeof edit["file_path"] === "string" ? [edit["file_path"]] : [],
      )
    : [];
}

export function resolveWorkspace(filePath: string): Workspace | null {
  return resolveLiveRepoWorkspace(filePath);
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
    if (hasLintableExtension(filePath) && workspace.lint) {
      if (workspace.lintFix) {
        bucket.lintFixPaths.push(filePath);
      }
      bucket.lintCheckPaths.push(filePath);
    }
    if (hasFormattableExtension(filePath)) {
      bucket.formatPaths.push(filePath);
    }
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

export function formatCommandFailure(
  label: string,
  paths: readonly string[],
  stdout: string,
  stderr: string,
  exitCode: number | null,
): string {
  const output = [stderr, stdout].filter(Boolean).join("\n").trim();
  return output || `${label}: ${summarizePaths(paths)} exited with code ${exitCode}`;
}

function commandFailure(
  label: string,
  paths: readonly string[],
  result: Bun.SyncSubprocess<"pipe", "pipe">,
): string {
  return formatCommandFailure(
    label,
    paths,
    result.stdout.toString(),
    result.stderr.toString(),
    result.exitCode,
  );
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

  const needsProductContract = filePaths.some((filePath) => isProductSurface(filePath));
  const buckets = bucketByWorkspace(filePaths);
  const failures: string[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.lintFixPaths.length > 0) {
      const lintFix = Bun.spawnSync(
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
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      if (lintFix.exitCode !== 0) {
        failures.push(commandFailure("lint --fix", bucket.lintFixPaths, lintFix));
        continue;
      }
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
        failures.push(commandFailure("format", bucket.formatPaths, format));
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

  if (needsProductContract) {
    const contract = Bun.spawnSync(["bun", "run", "--silent", "test:project-contract"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (contract.exitCode !== 0) {
      const output = [contract.stderr.toString(), contract.stdout.toString()]
        .filter(Boolean)
        .join("\n")
        .trim();
      failures.push(output || `test:project-contract exited with code ${contract.exitCode}`);
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
