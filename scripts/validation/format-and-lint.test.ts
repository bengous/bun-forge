import { describe, expect, test } from "bun:test";
import {
  formatCommand,
  formatCommandFailure,
  lintCheckCommand,
  lintFixCommand,
  parseFilePath,
  parseFilePaths,
  productContractCommand,
  resolveWorkspace,
} from "./format-and-lint";
import {
  hasFormattableExtension,
  hasLintableExtension,
  normalizeTouchedPath,
  resolveGeneratedProjectWorkspace,
  resolveLiveRepoWorkspace,
} from "./format-and-lint-routing.ts";

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

describe("format-and-lint failure reporting", () => {
  test("keeps command output when a quality command fails", () => {
    expect(formatCommandFailure("lint --fix", ["src/index.ts"], "", "bad lint", 1)).toBe(
      "bad lint",
    );
  });

  test("falls back to command label, paths, and exit code without command output", () => {
    expect(formatCommandFailure("format", ["src/a.ts", "src/b.ts"], "", "", 2)).toBe(
      "format: 2 files: src/a.ts, src/b.ts exited with code 2",
    );
  });
});

describe("format-and-lint command specs", () => {
  test("builds root lint, format, and lint-check commands without spawning", () => {
    const workspace = resolveLiveRepoWorkspace("scripts/validation/validate.ts");
    expect(workspace).not.toBeNull();

    expect(lintFixCommand("oxlint", workspace!, ["scripts/validation/validate.ts"])).toEqual([
      "oxlint",
      "-c",
      ".oxlintrc.jsonc",
      "--fix",
      "--quiet",
      "scripts/validation/validate.ts",
    ]);
    expect(formatCommand("oxfmt", workspace!, ["scripts/validation/validate.ts"])).toEqual([
      "oxfmt",
      "--write",
      "-c",
      ".oxfmtrc.jsonc",
      "scripts/validation/validate.ts",
    ]);
    expect(lintCheckCommand("oxlint", workspace!, ["scripts/validation/validate.ts"])).toEqual([
      "oxlint",
      "-c",
      ".oxlintrc.jsonc",
      "--quiet",
      "--format=unix",
      "scripts/validation/validate.ts",
    ]);
  });

  test("builds Codex hook check-only format command without lint-fix policy leakage", () => {
    const workspace = resolveLiveRepoWorkspace(".codex/hooks/lib.ts");
    expect(workspace?.lintFix).toBe(false);

    expect(formatCommand("oxfmt", workspace!, [".codex/hooks/lib.ts"])).toEqual([
      "oxfmt",
      "--check",
      "-c",
      ".oxfmtrc.jsonc",
      ".codex/hooks/lib.ts",
    ]);
  });

  test("builds product contract command as a pure spec", () => {
    expect(productContractCommand()).toEqual(["bun", "run", "--silent", "test:project-contract"]);
  });
});

describe("format-and-lint workspace resolution", () => {
  test("live repo lints root code and agent hook surfaces", () => {
    expect(resolveWorkspace("src/index.ts")?.lint).toBe(true);
    expect(resolveWorkspace("scripts/validation/validate.ts")?.lint).toBe(true);
    expect(resolveWorkspace(".codex/hooks/lib.ts")?.lint).toBe(true);
    expect(resolveWorkspace(".claude/hooks/guard-destructive.ts")?.lint).toBe(true);
  });

  test("live repo keeps Codex hook edits check-only", () => {
    const workspace = resolveLiveRepoWorkspace(".codex/hooks/lib.ts");
    expect(workspace?.name).toBe("codex-hooks");
    expect(workspace?.lint).toBe(true);
    expect(workspace?.lintFix).toBe(false);
    expect(workspace?.formatMode).toBe("check");
  });

  test("live repo formats product surfaces without root linting copied templates", () => {
    expect(resolveWorkspace("template-sources/ai/.codex/hooks/lib.ts")?.lint).toBe(false);
    expect(resolveWorkspace("templates/README.md.tpl")).toBeNull();
  });

  test("generated project routes frontend workspace separately from root tooling", () => {
    const workspace = resolveGeneratedProjectWorkspace("apps/frontend/src/main.tsx");
    expect(workspace?.name).toBe("frontend");
    expect(workspace?.oxlintConfig).toBe("apps/frontend/.oxlintrc.jsonc");
    expect(workspace?.oxlintArgs).toEqual(["--type-aware"]);
    expect(workspace?.oxfmtConfig).toBe("apps/frontend/.oxfmtrc.jsonc");
  });

  test("generated project does not route bun-forge product template surfaces", () => {
    expect(resolveGeneratedProjectWorkspace("template-sources/ai/.codex/hooks/lib.ts")).toBeNull();
    expect(resolveGeneratedProjectWorkspace("templates/package.json.tpl")).toBeNull();
  });

  test("normalizes repo-relative and absolute touched paths before routing", () => {
    expect(normalizeTouchedPath(`${process.cwd()}/scripts/validation/validate.ts`)).toBe(
      "scripts/validation/validate.ts",
    );
    expect(normalizeTouchedPath("./.claude/hooks/guard-destructive.ts")).toBe(
      ".claude/hooks/guard-destructive.ts",
    );
  });

  test("documents extension policy for lint and format routing", () => {
    expect(hasLintableExtension("src/index.ts")).toBe(true);
    expect(hasLintableExtension("config.json")).toBe(false);
    expect(hasFormattableExtension("config.json")).toBe(true);
    expect(hasFormattableExtension("templates/README.md.tpl")).toBe(false);
  });
});
