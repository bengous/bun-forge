export type Workspace = {
  readonly name: "root" | "codex-hooks" | "frontend" | "product";
  readonly oxlintConfig: string;
  readonly oxlintArgs: ReadonlyArray<string>;
  readonly oxfmtConfig: string;
  readonly lint: boolean;
  readonly lintFix: boolean;
  readonly formatMode: "write" | "check";
};

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const FORMATTABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".html",
  ".css",
]);

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

const PRODUCT_WORKSPACE: Workspace = {
  name: "product",
  oxlintConfig: ".oxlintrc.jsonc",
  oxlintArgs: [],
  oxfmtConfig: ".oxfmtrc.jsonc",
  lint: false,
  lintFix: false,
  formatMode: "write",
};

export function normalizeTouchedPath(filePath: string, projectRoot = process.cwd()): string {
  return filePath.replace(`${projectRoot}/`, "").replace(/^\.\//, "");
}

export function hasLintableExtension(filePath: string): boolean {
  return LINTABLE_EXTENSIONS.has(extensionOf(filePath));
}

export function hasFormattableExtension(filePath: string): boolean {
  return FORMATTABLE_EXTENSIONS.has(extensionOf(filePath));
}

export function resolveLiveRepoWorkspace(filePath: string): Workspace | null {
  const normalized = normalizeTouchedPath(filePath);
  if (!hasFormattableExtension(normalized) && !hasLintableExtension(normalized)) {
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
  if (isProductSurface(normalized)) {
    return PRODUCT_WORKSPACE;
  }
  return null;
}

export function resolveGeneratedProjectWorkspace(filePath: string): Workspace | null {
  const normalized = normalizeTouchedPath(filePath);
  if (!hasLintableExtension(normalized)) {
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

export function isProductSurface(filePath: string): boolean {
  const normalized = normalizeTouchedPath(filePath);
  return normalized.startsWith("templates/") || normalized.startsWith("template-sources/");
}

function extensionOf(filePath: string): string {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index);
}
