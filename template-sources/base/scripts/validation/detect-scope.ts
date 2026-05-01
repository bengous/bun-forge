import { $ } from "bun";
import { existsSync } from "node:fs";

export type Scope = "backend" | "frontend" | "scripts" | "config";

type WorkspacePresence = {
  readonly backend: boolean;
  readonly frontend: boolean;
};

export const CODE_PATTERN = /\.(ts|tsx|js|mjs|cjs|css|html|json|jsonc|md|mdx|toml|ya?ml)$/;

const CONFIG_FILES = new Set([
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  ".oxlintrc.jsonc",
  ".oxfmtrc.jsonc",
  "lefthook.yml",
  ".dependency-cruiser.cjs",
  ".jscpd.json",
  "knip.jsonc",
  "mise.toml",
]);

function hasFrontendWorkspace(): boolean {
  return existsSync("apps/frontend/package.json");
}

function hasBackendWorkspace(): boolean {
  return existsSync("src/index.ts");
}

function workspacePresence(): WorkspacePresence {
  return {
    backend: hasBackendWorkspace(),
    frontend: hasFrontendWorkspace(),
  };
}

function classifyFileWithWorkspace(filePath: string, presence: WorkspacePresence): Scope | null {
  const normalized = filePath.replaceAll("\\", "/").replaceAll(/^\.\//g, "");

  if (normalized.startsWith("apps/frontend/") && presence.frontend) {
    return "frontend";
  }
  if (normalized.startsWith("src/") && presence.backend) {
    return "backend";
  }
  if (normalized.startsWith("scripts/")) {
    return "scripts";
  }
  if (normalized.startsWith(".codex/hooks/")) {
    return "scripts";
  }
  if (normalized.startsWith(".claude/hooks/")) {
    return "scripts";
  }
  if (
    normalized === ".codex/config.toml" ||
    normalized === ".claude/settings.json" ||
    normalized === ".agents/agents-md-manifest.json" ||
    normalized === "CLAUDE.md" ||
    normalized === "AGENTS.md" ||
    normalized.startsWith(".claude/rules/")
  ) {
    return "config";
  }

  const basename = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  if (CONFIG_FILES.has(basename)) {
    return "config";
  }

  return null;
}

export function classifyFile(filePath: string): Scope | null {
  return classifyFileWithWorkspace(filePath, workspacePresence());
}

export function classifyScopes(files: string[]): Set<Scope> {
  const scopes = new Set<Scope>();
  const presence = workspacePresence();
  for (const file of files) {
    const scope = classifyFileWithWorkspace(file, presence);
    if (scope !== null) {
      scopes.add(scope);
    }
  }
  return scopes;
}

export function expandConfigScope(scopes: Set<Scope>): Set<Scope> {
  if (!scopes.has("config")) {
    return scopes;
  }
  const expanded = new Set(scopes);
  const presence = workspacePresence();
  if (presence.backend) {
    expanded.add("backend");
  }
  expanded.add("scripts");
  if (presence.frontend) {
    expanded.add("frontend");
  }
  return expanded;
}

function parseFileList(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type GitContext = "working" | "staged" | "push";

export async function getChangedFiles(context: GitContext): Promise<string[]> {
  switch (context) {
    case "working": {
      const [unstaged, staged, untracked] = await Promise.all([
        $`git diff --name-only`.nothrow().quiet().text(),
        $`git diff --cached --name-only`.nothrow().quiet().text(),
        $`git ls-files --others --exclude-standard`.nothrow().quiet().text(),
      ]);
      return [
        ...new Set([
          ...parseFileList(unstaged),
          ...parseFileList(staged),
          ...parseFileList(untracked),
        ]),
      ];
    }
    case "staged": {
      return parseFileList(await $`git diff --cached --name-only`.nothrow().quiet().text());
    }
    case "push": {
      const pushResult = await $`git diff --name-only @{push}...HEAD`.nothrow().quiet();
      if (pushResult.exitCode === 0) {
        return parseFileList(pushResult.text());
      }
      return parseFileList(await $`git diff --name-only HEAD~1...HEAD`.nothrow().quiet().text());
    }
    default: {
      throw new Error(`Unsupported git context: ${String(context)}`);
    }
  }
}

export async function getChangedScopes(context: GitContext): Promise<Set<Scope>> {
  return classifyScopes(await getChangedFiles(context));
}
