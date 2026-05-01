#!/usr/bin/env bun

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
};

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ROOT_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
};
const FRONTEND_WORKSPACE: Workspace = {
  oxlintConfig: "apps/frontend/.oxlintrc.jsonc",
  oxlintArgs: ["--type-aware"],
  oxfmtConfig: "apps/frontend/.oxfmtrc.jsonc",
};

const SUMMARY_LINE = /^\d+ problems?$/;
const PHANTOM_WARNING = /^:0:0:\s+\[Warning\]$/;

export function parseFilePath(raw: string): string | null {
  return parseFilePaths(raw)[0] ?? null;
}

export function parseFilePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tool_input" in parsed &&
      typeof parsed["tool_input"] === "object" &&
      parsed["tool_input"] !== null
    ) {
      const paths = new Set<string>();
      const toolInput = parsed["tool_input"];
      if ("file_path" in toolInput && typeof toolInput["file_path"] === "string") {
        paths.add(toolInput["file_path"]);
      }
      if ("edits" in toolInput && Array.isArray(toolInput["edits"])) {
        for (const edit of toolInput["edits"]) {
          if (
            typeof edit === "object" &&
            edit !== null &&
            "file_path" in edit &&
            typeof edit["file_path"] === "string"
          ) {
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
    normalized.startsWith(".codex/hooks/")
  ) {
    return ROOT_WORKSPACE;
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

if (import.meta.main) {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const oxlint = resolveBin(projectRoot, "oxlint");
  const oxfmt = resolveBin(projectRoot, "oxfmt");
  const input = await Bun.stdin.text();
  const filePaths = parseFilePaths(input);
  const failures: string[] = [];
  let updatedToolOutput: string | null = null;

  if (filePaths.length === 0) {
    process.exit(0);
  }

  for (const filePath of filePaths) {
    const workspace = resolveWorkspace(filePath);
    if (workspace === null) {
      continue;
    }

    const beforeFormat = await readTextFile(filePath);

    Bun.spawnSync(
      [oxlint, ...workspace.oxlintArgs, "-c", workspace.oxlintConfig, "--fix", "--quiet", filePath],
      {
        stdout: "ignore",
        stderr: "ignore",
      },
    );

    Bun.spawnSync([oxfmt, "--write", "-c", workspace.oxfmtConfig, filePath], {
      stdout: "ignore",
      stderr: "ignore",
    });

    const lint = Bun.spawnSync(
      [
        oxlint,
        ...workspace.oxlintArgs,
        "-c",
        workspace.oxlintConfig,
        "--quiet",
        "--format=unix",
        filePath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const finalContent = await readTextFile(filePath);
    if (
      filePaths.length === 1 &&
      beforeFormat !== null &&
      finalContent !== null &&
      finalContent !== beforeFormat
    ) {
      updatedToolOutput = finalContent;
    }

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
