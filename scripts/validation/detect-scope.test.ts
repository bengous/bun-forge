import { describe, expect, test } from "bun:test";
import {
  classifyFile,
  classifyFileWithFrontendWorkspace,
  classifyScopes,
  CODE_PATTERN,
  expandConfigScopeWithFrontendWorkspace,
} from "./detect-scope.ts";

describe("classifyFileWithFrontendWorkspace", () => {
  test("classifies backend, scripts, config, and frontend paths", () => {
    expect(classifyFileWithFrontendWorkspace("src/index.ts", false)).toBe("backend");
    expect(classifyFileWithFrontendWorkspace("scripts/setup/bootstrap.ts", false)).toBe("scripts");
    expect(classifyFileWithFrontendWorkspace(".codex/hooks/post-edit-quality.ts", false)).toBe(
      "scripts",
    );
    expect(classifyFileWithFrontendWorkspace("package.json", false)).toBe("config");
    expect(classifyFileWithFrontendWorkspace("apps/frontend/src/main.tsx", true)).toBe("frontend");
  });

  test("ignores frontend paths when no workspace is present", () => {
    expect(classifyFileWithFrontendWorkspace("apps/frontend/src/main.tsx", false)).toBeNull();
  });
});

describe("classifyScopes", () => {
  test("collects unique scopes from multiple files", () => {
    expect(classifyScopes(["src/index.ts", "scripts/setup/bootstrap.ts", "package.json"])).toEqual(
      new Set(["backend", "scripts", "config"]),
    );
  });
});

describe("expandConfigScopeWithFrontendWorkspace", () => {
  test("expands config changes to backend and scripts", () => {
    expect(expandConfigScopeWithFrontendWorkspace(new Set(["config"]), false)).toEqual(
      new Set(["config", "backend", "scripts"]),
    );
  });

  test("adds frontend when the workspace exists", () => {
    expect(expandConfigScopeWithFrontendWorkspace(new Set(["config"]), true)).toEqual(
      new Set(["config", "backend", "scripts", "frontend"]),
    );
  });
});

describe("module constants", () => {
  test("matches code-like extensions", () => {
    expect(CODE_PATTERN.test("file.tsx")).toBe(true);
    expect(CODE_PATTERN.test("file.md")).toBe(false);
  });

  test("keeps current repo behavior for frontend-less classifyFile", () => {
    expect(classifyFile("apps/frontend/src/main.tsx")).toBeNull();
  });
});
