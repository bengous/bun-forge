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

describe("Codex hook input parsing", () => {
  test("preserves stop_hook_active when it is boolean", () => {
    expect(parseHookInput({ stop_hook_active: true })).toEqual({ stop_hook_active: true });
    expect(parseHookInput({ stop_hook_active: false })).toEqual({ stop_hook_active: false });
  });

  test("ignores non-boolean stop_hook_active values", () => {
    expect(parseHookInput({ stop_hook_active: "true" })).toEqual({});
    expect(parseHookInput({ stop_hook_active: 1 })).toEqual({});
    expect(parseHookInput({ stop_hook_active: null })).toEqual({});
  });
});

describe("Codex hook path handling", () => {
  test("extracts file paths from apply_patch hunks", () => {
    const paths = extractApplyPatchPaths(`*** Begin Patch
*** Add File: docs/product/PRD.md
+content
*** Update File: apps/frontend/src/main.tsx
@@
 old
*** Delete File: scripts/old.ts
*** End Patch`);

    expect(paths).toEqual(["docs/product/PRD.md", "apps/frontend/src/main.tsx", "scripts/old.ts"]);
  });

  test("normalizes relative paths and drops paths outside the repo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bun-forge-codex-hooks-"));
    try {
      expect(normalizeProjectPath("scripts/validation/validate.ts", root)).toBe(
        "scripts/validation/validate.ts",
      );
      expect(normalizeProjectPath(path.join(root, "apps/frontend/src/App.tsx"), root)).toBe(
        "apps/frontend/src/App.tsx",
      );
      expect(normalizeProjectPath("../outside.ts", root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks generated files", () => {
    expect(
      forbiddenTouchedPaths([
        "AGENTS.md",
        "docs/product/PRD.md",
        "scripts/validation/AGENTS.md",
        "apps/frontend/src/routeTree.gen.ts",
      ]),
    ).toEqual(["AGENTS.md", "scripts/validation/AGENTS.md", "apps/frontend/src/routeTree.gen.ts"]);
  });

  test("extracts file path fields from hook input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bun-forge-codex-hooks-"));
    try {
      expect(
        extractTouchedPaths({
          cwd: root,
          tool_input: {
            file_path: "apps/frontend/src/routes/index.tsx",
            edits: [{ file_path: "scripts/setup/bootstrap.ts" }],
          },
        }),
      ).toEqual(["apps/frontend/src/routes/index.tsx", "scripts/setup/bootstrap.ts"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
});

describe("Codex stop validation", () => {
  test("skips the validation runner when stop_hook_active is true", async () => {
    const calls: string[] = [];
    const result = await runStopValidation(
      { cwd: process.cwd(), stop_hook_active: true },
      async (command): Promise<CommandResult> => {
        calls.push(command.join(" "));
        return { code: 1, stdout: "", stderr: "should not run" };
      },
    );

    expect(result).toEqual({});
    expect(calls).toEqual([]);
  });
});
