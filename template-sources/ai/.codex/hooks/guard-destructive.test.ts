import { describe, expect, test } from "bun:test";
import { checkCommand, checkMergeGuard, parseHookInput } from "./guard-destructive";

describe("Codex destructive command guard", () => {
  test("extracts Bash commands from valid hook input", () => {
    expect(parseHookInput(JSON.stringify({ tool_input: { command: "git status" } }))).toBe(
      "git status",
    );
  });

  test("ignores malformed or unexpected hook input", () => {
    expect(parseHookInput("{")).toBeNull();
    expect(parseHookInput(JSON.stringify({ tool_input: null }))).toBeNull();
    expect(parseHookInput(JSON.stringify({ tool_input: { command: 42 } }))).toBeNull();
  });

  test("blocks destructive commands", () => {
    expect(checkCommand("rm -rf dist")).toBe("rm recursive + force");
    expect(checkCommand("git reset --hard HEAD")).toBe("git reset --hard");
    expect(checkCommand("git checkout -- .")).toBe("git checkout -- .");
  });

  test("blocks non fast-forward merge", () => {
    expect(checkMergeGuard("git merge feature/test")).toContain("git merge without --ff-only");
    expect(checkMergeGuard("git merge --ff-only feature/test")).toBeNull();
  });

  test("ignores destructive text inside string literals", () => {
    expect(checkCommand("printf 'git reset --hard HEAD'")).toBeNull();
  });
});
