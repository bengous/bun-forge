import { describe, expect, test } from "bun:test";
import { checkCommand, checkMergeGuard, checkRm, parseHookInput } from "./guard-destructive";

describe("Codex destructive command guard", () => {
  test("blocks recursive forced rm in any flag order", () => {
    expect(checkRm(["rm", "-rf", "dist"])).toBe("rm recursive + force");
    expect(checkRm(["rm", "-fr", "dist"])).toBe("rm recursive + force");
    expect(checkRm(["rm", "--force", "--recursive", "dist"])).toBe("rm recursive + force");
  });

  test("blocks known destructive git commands", () => {
    expect(checkCommand("git reset --hard HEAD")).toBe("git reset --hard");
    expect(checkCommand("git push --force")).toBe("git push --force");
  });

  test("does not match commands inside string literals", () => {
    expect(checkCommand('printf "git reset --hard HEAD"')).toBeNull();
  });

  test("blocks non fast-forward merge", () => {
    expect(checkMergeGuard("git merge feature/test")).toContain("git merge without --ff-only");
    expect(checkMergeGuard("git merge --ff-only feature/test")).toBeNull();
  });

  test("parses hook input defensively", () => {
    expect(parseHookInput('{"tool_input":{"command":"git status"}}')).toBe("git status");
    expect(parseHookInput("{}")).toBeNull();
    expect(parseHookInput("{")).toBeNull();
  });
});
