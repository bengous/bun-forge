import { repoRelativePath, toPosixSeparators } from "./repo-path.ts";

export type Workspace = {
  readonly name: "root" | "codex-hooks" | "frontend";
  readonly oxlintConfig: string;
  readonly oxlintArgs: ReadonlyArray<string>;
  readonly oxfmtConfig: string;
  readonly lint: boolean;
  readonly lintFix: boolean;
  readonly formatMode: "write" | "check";
};

const ROUTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

const ROOT_WORKSPACE: Workspace = {
  name: "root",
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: true,
  formatMode: "write",
};

const CODEX_HOOK_WORKSPACE: Workspace = {
  name: "codex-hooks",
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: true,
  lintFix: false,
  formatMode: "check",
};

const FRONTEND_WORKSPACE: Workspace = {
  name: "frontend",
  oxlintConfig: "apps/frontend/.oxlintrc.jsonc",
  oxlintArgs: ["--type-aware"],
  oxfmtConfig: "apps/frontend/.oxfmtrc.jsonc",
  lint: true,
  lintFix: true,
  formatMode: "write",
};

export function normalizeTouchedPath(filePath: string, projectRoot = process.cwd()): string {
  return (
    repoRelativePath(filePath, projectRoot) ?? toPosixSeparators(filePath).replace(/^\.\//, "")
  );
}

export function hasRoutableExtension(filePath: string): boolean {
  return ROUTED_EXTENSIONS.has(extensionOf(filePath));
}

export function resolveGeneratedProjectWorkspace(
  filePath: string,
  projectRoot = process.cwd(),
): Workspace | null {
  const normalized = normalizeTouchedPath(filePath, projectRoot);
  if (!hasRoutableExtension(normalized)) {
    return null;
  }

  if (
    normalized.startsWith("src/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith(".claude/hooks/")
  ) {
    return ROOT_WORKSPACE;
  }
  if (normalized.startsWith(".codex/hooks/")) {
    return CODEX_HOOK_WORKSPACE;
  }
  if (normalized.startsWith("apps/frontend/")) {
    return FRONTEND_WORKSPACE;
  }
  return null;
}

function extensionOf(filePath: string): string {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index);
}
