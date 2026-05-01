import { describe, expect, test } from "bun:test";
import { checkCommand, checkMergeGuard, parseHookInput } from "./guard-destructive";

describe("Claude destructive command guard", () => {
  test("blocks recursive forced rm in any flag order", () => {
    expect(checkCommand("rm -rf /tmp/example")).toBe("rm recursive + force");
    expect(checkCommand("rm -fr /tmp/example")).toBe("rm recursive + force");
    expect(checkCommand("rm -r --force /tmp/example")).toBe("rm recursive + force");
  });

  test("blocks known destructive git commands", () => {
    expect(checkCommand("git reset --hard")).toBe("git reset --hard");
    expect(checkCommand("git checkout -- .")).toBe("git checkout -- .");
    expect(checkCommand("git push --force")).toBe("git push --force");
  });

  test("does not match commands inside string literals", () => {
    expect(checkCommand('echo "git reset --hard"')).toBeNull();
    expect(checkCommand("git commit -m 'rm -rf /tmp/example'")).toBeNull();
  });

  test("blocks non fast-forward merge", () => {
    expect(checkMergeGuard("git merge feature/example")).toContain("git merge without --ff-only");
    expect(checkMergeGuard("git merge --ff-only feature/example")).toBeNull();
  });

  test("parses hook input defensively", () => {
    expect(parseHookInput('{"tool_input":{"command":"git reset --hard"}}')).toBe(
      "git reset --hard",
    );
    expect(parseHookInput('{"tool_input":{"command":42}}')).toBeNull();
    expect(parseHookInput("{not-json")).toBeNull();
  });
});
