import type { QualityWorkspace, RoutingPresence } from "./routing-policy.ts";
import { existsSync } from "node:fs";
import path from "node:path";
import { repoRelativePath, toPosixSeparators } from "./repo-path.ts";
import {
  hasFormattableExtension,
  hasLintableExtension,
  isProductSurface as policyIsProductSurface,
  normalizeRoutingPath,
  resolveQualityWorkspace,
} from "./routing-policy.ts";

export { hasFormattableExtension, hasLintableExtension };

export type Workspace = QualityWorkspace;

export function normalizeTouchedPath(filePath: string, projectRoot = process.cwd()): string {
  return normalizeRoutingPath(
    repoRelativePath(filePath, projectRoot) ?? toPosixSeparators(filePath).replace(/^\.\//, ""),
  );
}

function workspacePresence(projectRoot: string): RoutingPresence {
  return {
    backend: existsSync(path.join(projectRoot, "src/index.ts")),
    frontend: existsSync(path.join(projectRoot, "apps/frontend/package.json")),
  };
}

export function resolveLiveRepoWorkspace(
  filePath: string,
  projectRoot = process.cwd(),
  presence: RoutingPresence = workspacePresence(projectRoot),
): Workspace | null {
  const normalized = normalizeTouchedPath(filePath, projectRoot);
  return resolveQualityWorkspace(normalized, { kind: "live-repo", presence });
}

export function resolveGeneratedProjectWorkspace(
  filePath: string,
  projectRoot = process.cwd(),
  presence: RoutingPresence = workspacePresence(projectRoot),
): Workspace | null {
  const normalized = normalizeTouchedPath(filePath, projectRoot);
  return resolveQualityWorkspace(normalized, { kind: "generated-project", presence });
}

export function isProductSurface(filePath: string, projectRoot = process.cwd()): boolean {
  const normalized = normalizeTouchedPath(filePath, projectRoot);
  return policyIsProductSurface(normalized);
}
