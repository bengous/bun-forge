import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractApplyPatchPaths,
  extractTouchedPaths,
  forbiddenTouchedPaths,
  normalizeProjectPath,
  parseHookInput,
  runPostEditQuality,
  runStopValidation,
  type CommandResult,
} from "./lib";

describe("Codex hook path handling", () => {
  test("extracts file paths from apply_patch hunks", () => {
    const paths = extractApplyPatchPaths(`*** Begin Patch
*** Add File: templates/package.json.tpl
+content
*** Update File: .codex/hooks/lib.ts
@@
 old
*** Delete File: scripts/old.ts
*** End Patch`);

    expect(paths).toEqual(["templates/package.json.tpl", ".codex/hooks/lib.ts", "scripts/old.ts"]);
  });

  test("normalizes relative paths and drops paths outside the repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bun-forge-codex-hooks-"));
    try {
      expect(normalizeProjectPath("scripts/validation/validate.ts", root)).toBe(
        "scripts/validation/validate.ts",
      );
      expect(normalizeProjectPath(path.join(root, ".claude/hooks/guard.ts"), root)).toBe(
        ".claude/hooks/guard.ts",
      );
      expect(normalizeProjectPath("../outside.ts", root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks generated agent files", () => {
    expect(
      forbiddenTouchedPaths([
        "AGENTS.md",
        "scripts/validation/AGENTS.md",
        ".agents/agents-md-manifest.json",
        "templates/package.json.tpl",
      ]),
    ).toEqual(["AGENTS.md", "scripts/validation/AGENTS.md", ".agents/agents-md-manifest.json"]);
  });

  test("extracts single and multi edit path fields from hook input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bun-forge-codex-hooks-"));
    try {
      expect(
        extractTouchedPaths({
          cwd: root,
          tool_input: {
            file_path: "scripts/validation/detect-scope.ts",
            edits: [{ file_path: "templates/package.json.tpl" }],
          },
        }),
      ).toEqual(["scripts/validation/detect-scope.ts", "templates/package.json.tpl"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves active stop hook state from hook input", () => {
    expect(parseHookInput({ stop_hook_active: true })).toEqual({ stop_hook_active: true });
    expect(parseHookInput({ stop_hook_active: "true" })).toEqual({});
  });
});

describe("Codex post-edit quality gate", () => {
  test("blocks generated files before running format or lint", async () => {
    const calls: string[] = [];
    const result = await runPostEditQuality(
      {
        cwd: process.cwd(),
        session_id: "test-session",
        turn_id: "test-turn",
        tool_input: { file_path: "AGENTS.md" },
      },
      async (command): Promise<CommandResult> => {
        calls.push(command.join(" "));
        return { code: 0, stdout: "", stderr: "" };
      },
    );

    expect(result.blockReason).toContain("Generated files must not be edited directly");
    expect(calls).toEqual([]);
  });

  test("runs product contract once for template surfaces", async () => {
    const calls: string[] = [];
    const result = await runPostEditQuality(
      {
        cwd: process.cwd(),
        session_id: "test-session",
        turn_id: "template-turn",
        tool_input: { file_path: "templates/package.json.tpl" },
      },
      async (command): Promise<CommandResult> => {
        calls.push(command.join(" "));
        return { code: 0, stdout: "", stderr: "" };
      },
    );

    expect(result.blockReason).toBeUndefined();
    expect(calls).toContain("bun run --silent test:project-contract");
  });
});

describe("Codex stop validation gate", () => {
  test("skips validation when Codex already has an active stop hook", async () => {
    const calls: string[] = [];
    const result = await runStopValidation(
      {
        cwd: process.cwd(),
        session_id: "test-session",
        stop_hook_active: true,
        turn_id: "recursive-stop-turn",
      },
      async (command): Promise<CommandResult> => {
        calls.push(command.join(" "));
        return { code: 1, stdout: "", stderr: "should not run" };
      },
    );

    expect(result.blockReason).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
