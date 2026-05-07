import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function makeTestRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "bun-forge-codex-hooks-"));
}

async function seedFile(root: string, relPath: string, content = ""): Promise<void> {
  const absolute = path.join(root, relPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

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
        forbiddenTouchedPaths(["scripts/validation/AGENTS.md", "docs/product/PRD.md"], root),
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
      expect(format).toContain("src/c.json");

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

  test("uses frontend workspace config for paths under apps/frontend", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "apps/frontend/src/App.tsx", "export const A = () => null;\n");

      const calls: string[][] = [];
      await runPostEditQuality(
        {
          cwd: root,
          session_id: "frontend-session",
          turn_id: "frontend",
          tool_input: { file_path: "apps/frontend/src/App.tsx" },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      const lintCalls = calls.filter((c) => c.includes("--fix") || c.includes("--format=unix"));
      expect(lintCalls.length).toBe(2);
      for (const call of lintCalls) {
        expect(call).toContain("apps/frontend/.oxlintrc.jsonc");
        expect(call).toContain("--type-aware");
      }

      const format = calls.find((c) => c.includes("--write"));
      expect(format).toBeDefined();
      expect(format).toContain("apps/frontend/.oxfmtrc.jsonc");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("issues separate spawns per workspace when paths span workspaces", async () => {
    const root = await makeTestRoot();
    try {
      await seedFile(root, "src/a.ts", "export const a = 1;\n");
      await seedFile(root, "apps/frontend/src/b.tsx", "export const B = () => null;\n");

      const calls: string[][] = [];
      await runPostEditQuality(
        {
          cwd: root,
          session_id: "cross-ws-session",
          turn_id: "two-ws",
          tool_input: {
            file_path: "src/a.ts",
            edits: [{ file_path: "apps/frontend/src/b.tsx" }],
          },
        },
        async (command): Promise<CommandResult> => {
          calls.push([...command]);
          return { code: 0, stdout: "", stderr: "" };
        },
      );

      const formatCalls = calls.filter((c) => c.includes("--write"));
      expect(formatCalls.length).toBe(2);

      const rootFormat = formatCalls.find(
        (c) => c.includes(".oxfmtrc.jsonc") && c.includes("src/a.ts"),
      );
      const frontendFormat = formatCalls.find(
        (c) => c.includes("apps/frontend/.oxfmtrc.jsonc") && c.includes("apps/frontend/src/b.tsx"),
      );
      expect(rootFormat).toBeDefined();
      expect(frontendFormat).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
