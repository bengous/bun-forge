import type { RoutingPresence, RoutingScope } from "./routing-policy.ts";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { classifyRoutingPath, expandConfigRoutingScope } from "./routing-policy.ts";

export type Scope = RoutingScope;

export type WorkspacePresence = RoutingPresence;

export const CODE_PATTERN = /\.(ts|tsx|js|mjs|cjs|css|html|json|jsonc|md|mdx|toml|ya?ml|tpl)$/;

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

export function classifyFileWithWorkspace(
  filePath: string,
  presence: WorkspacePresence,
): Scope | null {
  return classifyRoutingPath(filePath, { kind: "live-repo", presence });
}

export function classifyFileWithFrontendWorkspace(
  filePath: string,
  frontendWorkspacePresent: boolean,
): Scope | null {
  return classifyFileWithWorkspace(filePath, {
    backend: hasBackendWorkspace(),
    frontend: frontendWorkspacePresent,
  });
}

export function expandConfigScopeWithWorkspace(
  scopes: Set<Scope>,
  presence: WorkspacePresence,
): Set<Scope> {
  return expandConfigRoutingScope(scopes, { kind: "live-repo", presence });
}

export function expandConfigScopeWithFrontendWorkspace(
  scopes: Set<Scope>,
  frontendWorkspacePresent: boolean,
): Set<Scope> {
  return expandConfigScopeWithWorkspace(scopes, {
    backend: hasBackendWorkspace(),
    frontend: frontendWorkspacePresent,
  });
}

export function classifyFile(filePath: string): Scope | null {
  return classifyFileWithWorkspace(filePath, workspacePresence());
}

export function classifyScopes(files: readonly string[]): Set<Scope> {
  const presence = workspacePresence();
  return new Set(
    files
      .map((file) => classifyFileWithWorkspace(file, presence))
      .filter((scope): scope is Scope => scope !== null),
  );
}

export function expandConfigScope(scopes: Set<Scope>): Set<Scope> {
  return expandConfigScopeWithWorkspace(scopes, workspacePresence());
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
