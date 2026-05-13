import type { CommandResult } from "./lib";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractApplyPatchPaths,
  extractTouchedPaths,
  forbiddenTouchedPaths,
  localTool,
  normalizeProjectPath,
  parseHookInput,
  runPostEditQuality,
  runStopValidation,
  touchedStatePath,
} from "./lib";

async function makeTestRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kitsmith-codex-hooks-"));
  await seedFile(root, "src/index.ts", "export const main = true;\n");
  return root;
}

async function seedFile(root: string, relPath: string, content = ""): Promise<void> {
  const absolute = path.join(root, relPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

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
    const root = await mkdtemp(path.join(tmpdir(), "kitsmith-codex-hooks-"));
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
        ".agents/agents-md-manifest.json",
        "templates/package.json.tpl",
      ]),
    ).toEqual(["AGENTS.md", ".agents/agents-md-manifest.json"]);
  });

  test("blocks agent files listed only in the manifest", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(
        root,
        ".agents/agents-md-manifest.json",
        JSON.stringify({
          version: 2,
          generated: ["AGENTS.md"],
          outputs: {
            "docs/agent/AGENTS.md": {
              kind: "layer",
              sourcePath: ".claude/rules/docs.md",
              checksum: "sha256-test",
            },
          },
        }),
      );

      expect(forbiddenTouchedPaths(["docs/agent/AGENTS.md", "docs/agent/source.md"], root)).toEqual(
        ["docs/agent/AGENTS.md"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks nested agent files when the manifest is missing or invalid", async () => {
    const root = await makeTestRoot();
    try {
      expect(
        forbiddenTouchedPaths(["scripts/validation/AGENTS.md", "templates/package.json.tpl"], root),
      ).toEqual(["scripts/validation/AGENTS.md"]);

      await seedFile(root, ".agents/agents-md-manifest.json", "not-json");

      expect(
        forbiddenTouchedPaths(
          ["scripts/validation/AGENTS.md", ".agents/agents-md-manifest.json"],
          root,
        ),
      ).toEqual(["scripts/validation/AGENTS.md", ".agents/agents-md-manifest.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("extracts single and multi edit path fields from hook input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kitsmith-codex-hooks-"));
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

  test("resolves Windows local tool shims before PATH fallback", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "node_modules/.bin/oxlint.cmd");
      expect(localTool(root, "oxlint", "win32")).toBe(
        path.join(root, "node_modules", ".bin", "oxlint.cmd"),
      );
      expect(localTool(root, "oxfmt", "win32")).toBe("oxfmt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("stores hook state under the OS temp directory using the package name", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "package.json", '{ "name": "generated app" }\n');
      expect(
        touchedStatePath({
          cwd: root,
          session_id: "session",
          turn_id: "turn",
        }),
      ).toBe(path.join(tmpdir(), "generated_app-codex-hooks", "session-turn.json"));
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

  test("does not route Kitsmith template surfaces in generated projects", async () => {
    for (const filePath of [
      "templates/package.json.tpl",
      "template-sources/ai/.codex/hooks/lib.ts",
    ]) {
      const root = await makeTestRoot();
      const calls: string[] = [];
      try {
        await seedFile(root, filePath, "{}\n");
        const result = await runPostEditQuality(
          {
            cwd: root,
            session_id: "test-session",
            turn_id: filePath.replaceAll("/", "-"),
            tool_input: { file_path: filePath },
          },
          async (command): Promise<CommandResult> => {
            calls.push(command.join(" "));
            return { code: 0, stdout: "", stderr: "" };
          },
        );

        expect(result.blockReason).toBeUndefined();
        expect(calls).toEqual([]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
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

describe("Codex post-edit batching", () => {
  test("batches multiple paths in the same workspace into single spawns", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "src/a.ts", "export const a = 1;\n");
      await seedFile(root, "src/b.ts", "export const b = 2;\n");
      await seedFile(root, "src/c.json", "{}\n");

      const calls: string[][] = [];
      const result = await runPostEditQuality(
        {
          cwd: root,
          session_id: "batch-session",
          turn_id: "single-workspace",
          tool_input: {
            file_path: "src/a.ts",
            edits: [{ file_path: "src/b.ts" }, { file_path: "src/c.json" }],
          },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      expect(result.blockReason).toBeUndefined();
      expect(calls.length).toBe(3);

      const lintFix = calls.find((c) => c.includes("--fix"));
      expect(lintFix).toBeDefined();
      expect(lintFix).toContain("src/a.ts");
      expect(lintFix).toContain("src/b.ts");
      expect(lintFix).not.toContain("src/c.json");

      const format = calls.find((c) => c.includes("--write"));
      expect(format).toBeDefined();
      expect(format).toContain("src/a.ts");
      expect(format).toContain("src/b.ts");
      expect(format).not.toContain("src/c.json");

      const lintCheck = calls.find((c) => c.includes("--format=unix"));
      expect(lintCheck).toBeDefined();
      expect(lintCheck).toContain("src/a.ts");
      expect(lintCheck).toContain("src/b.ts");
      expect(lintCheck).not.toContain("src/c.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves order: lint --fix before format before lint --check", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "src/a.ts", "export const a = 1;\n");

      const calls: string[][] = [];
      await runPostEditQuality(
        {
          cwd: root,
          session_id: "order-session",
          turn_id: "lint-first",
          tool_input: { file_path: "src/a.ts" },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      const lintFixIndex = calls.findIndex((c) => c.includes("--fix"));
      const formatIndex = calls.findIndex((c) => c.includes("--write"));
      const lintCheckIndex = calls.findIndex((c) => c.includes("--format=unix"));

      expect(lintFixIndex).toBeGreaterThanOrEqual(0);
      expect(formatIndex).toBeGreaterThan(lintFixIndex);
      expect(lintCheckIndex).toBeGreaterThan(formatIndex);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("codex-hooks workspace lints without --fix and formats in --check mode", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, ".codex/hooks/x.ts", "export const x = 1;\n");

      const calls: string[][] = [];
      await runPostEditQuality(
        {
          cwd: root,
          session_id: "codex-ws-session",
          turn_id: "codex-hooks",
          tool_input: { file_path: ".codex/hooks/x.ts" },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      expect(calls.find((c) => c.includes("--fix"))).toBeUndefined();
      const format = calls.find((c) => c.includes("--check"));
      expect(format).toBeDefined();
      expect(format).toContain(".codex/hooks/x.ts");
      expect(calls.find((c) => c.includes("--format=unix"))).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("issues separate spawns per workspace when paths span workspaces", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "src/a.ts", "export const a = 1;\n");
      await seedFile(root, "templates/foo.json", "{}\n");

      const calls: string[][] = [];
      await runPostEditQuality(
        {
          cwd: root,
          session_id: "cross-ws-session",
          turn_id: "two-ws",
          tool_input: {
            file_path: "src/a.ts",
            edits: [{ file_path: "templates/foo.json" }],
          },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      const formatCalls = calls.filter((c) => c.includes("--write"));
      expect(formatCalls.length).toBe(1);
      expect(formatCalls[0]).toContain("src/a.ts");
      expect(formatCalls[0]).not.toContain("templates/foo.json");

      const lintCalls = calls.filter((c) => c.includes("--format=unix") || c.includes("--fix"));
      for (const call of lintCalls) {
        expect(call).not.toContain("templates/foo.json");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
