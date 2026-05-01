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
  readonly lint: boolean;
  readonly lintFix: boolean;
  readonly formatMode: "write" | "check";
};

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const FORMATTABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
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
const ROOT_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: true,
  formatMode: "write",
};
const CODEX_HOOK_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: false,
  formatMode: "check",
};
const FORMAT_ONLY_WORKSPACE: Workspace = {
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: false,
  lintFix: false,
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
  if (!FORMATTABLE_EXTENSIONS.has(ext) && !LINTABLE_EXTENSIONS.has(ext)) {
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
  if (isProductSurface(normalized)) {
    return FORMAT_ONLY_WORKSPACE;
  }
  return null;
}

function isProductSurface(filePath: string): boolean {
  const normalized = filePath.replace(`${process.cwd()}/`, "").replace(/^\.\//, "");
  return normalized.startsWith("templates/") || normalized.startsWith("template-sources/");
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

if (import.meta.main) {
  const projectRoot = resolveProjectRoot(import.meta.dir);
  const oxlint = resolveBin(projectRoot, "oxlint");
  const oxfmt = resolveBin(projectRoot, "oxfmt");
  const input = await Bun.stdin.text();
  const filePaths = parseFilePaths(input);
  const failures: string[] = [];
  let updatedToolOutput: string | null = null;
  let needsProductContract = false;
  const shouldCaptureUpdatedToolOutput = filePaths.length === 1;

  if (filePaths.length === 0) {
    process.exit(0);
  }

  for (const filePath of filePaths) {
    if (isProductSurface(filePath)) {
      needsProductContract = true;
    }

    const workspace = resolveWorkspace(filePath);
    if (workspace === null) {
      continue;
    }

    const beforeFormat = shouldCaptureUpdatedToolOutput ? await readTextFile(filePath) : null;

    if (
      workspace.lint &&
      workspace.lintFix &&
      LINTABLE_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf(".")))
    ) {
      Bun.spawnSync(
        [
          oxlint,
          ...workspace.oxlintArgs,
          "-c",
          workspace.oxlintConfig,
          "--fix",
          "--quiet",
          filePath,
        ],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      );
    }

    if (FORMATTABLE_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf(".")))) {
      const mode = workspace.formatMode === "write" ? "--write" : "--check";
      const format = Bun.spawnSync([oxfmt, mode, "-c", workspace.oxfmtConfig, filePath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      if (format.exitCode !== 0) {
        const output = [format.stderr.toString(), format.stdout.toString()]
          .filter(Boolean)
          .join("\n")
          .trim();
        failures.push(output || `format: ${filePath} exited with code ${format.exitCode}`);
      }
    }

    const finalContent = shouldCaptureUpdatedToolOutput ? await readTextFile(filePath) : null;
    if (
      shouldCaptureUpdatedToolOutput &&
      beforeFormat !== null &&
      finalContent !== null &&
      finalContent !== beforeFormat
    ) {
      updatedToolOutput = finalContent;
    }

    if (!workspace.lint || !LINTABLE_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf(".")))) {
      continue;
    }

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
