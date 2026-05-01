import { describe, expect, test } from "bun:test";
import { parseFilePath, parseFilePaths, resolveWorkspace } from "./format-and-lint";

describe("format-and-lint hook input parsing", () => {
  test("keeps single file path compatibility", () => {
    expect(parseFilePath('{"tool_input":{"file_path":"src/index.ts"}}')).toBe("src/index.ts");
  });

  test("extracts unique paths from MultiEdit payloads", () => {
    expect(
      parseFilePaths(
        '{"tool_input":{"file_path":"src/index.ts","edits":[{"file_path":"scripts/a.ts"},{"file_path":"src/index.ts"}]}}',
      ),
    ).toEqual(["src/index.ts", "scripts/a.ts"]);
  });

  test("returns no paths for malformed JSON", () => {
    expect(parseFilePaths("{")).toEqual([]);
  });
});

describe("format-and-lint workspace resolution", () => {
  test("lints root code and agent hook surfaces", () => {
    expect(resolveWorkspace("src/index.ts")?.lint).toBe(true);
    expect(resolveWorkspace("scripts/validation/validate.ts")?.lint).toBe(true);
    expect(resolveWorkspace(".codex/hooks/lib.ts")?.lint).toBe(true);
    expect(resolveWorkspace(".claude/hooks/guard-destructive.ts")?.lint).toBe(true);
  });

  test("formats product surfaces without root linting copied templates", () => {
    expect(resolveWorkspace("template-sources/ai/.codex/hooks/lib.ts")?.lint).toBe(false);
    expect(resolveWorkspace("templates/README.md.tpl")).toBeNull();
  });
});
