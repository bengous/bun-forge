import type { TemplateContext } from "../types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES_DIR } from "./paths.ts";

const TOKEN_PATTERN = /__([A-Z0-9_]+)__/g;

export function templateValues(context: TemplateContext): Record<string, string> {
  const workspacesBlock = context.hasWorkspaces ? '  "workspaces": ["apps/*"],\n' : "";

  const aiScripts = context.ai
    ? '    "agents:sync": "bun scripts/agents/sync-agents-md.ts --write",\n    "agents:check": "bun scripts/agents/sync-agents-md.ts --check",\n'
    : "";

  const frontendScripts =
    context.frontend === "tanstack"
      ? '    "dev:frontend": "cd apps/frontend && bun run dev",\n    "typecheck:frontend": "cd apps/frontend && bun run typecheck",\n    "lint:frontend": "cd apps/frontend && bun run lint",\n    "format:check:frontend": "cd apps/frontend && bun run format:check",\n    "lint:arch:frontend": "cd apps/frontend && dependency-cruiser --config .dependency-cruiser.cjs --output-type err src",\n    "lint:css:frontend": "cd apps/frontend && bun run lint:css",\n    "build:frontend": "cd apps/frontend && bun run build",\n    "validate:frontend": "bun run --silent typecheck:frontend && cd apps/frontend && bun run --silent test && cd ../.. && bun run --silent lint:frontend && bun run --silent format:check:frontend && bun run --silent lint:arch:frontend && bun run --silent lint:css:frontend && bun run --silent build:frontend",\n'
      : "";

  const frontendLefthookCommand =
    context.frontend === "tanstack"
      ? '    frontend-oxc:\n      glob:\n        - "apps/frontend/**/*.{ts,tsx}"\n      run: ./node_modules/.bin/oxlint --type-aware -c apps/frontend/.oxlintrc.jsonc --fix --quiet --format=unix {staged_files} && ./node_modules/.bin/oxfmt --write -c apps/frontend/.oxfmtrc.jsonc {staged_files}\n      stage_fixed: true\n'
      : "";

  const frontendTypecheckGlob =
    context.frontend === "tanstack" ? '        - "apps/frontend/**/*.{ts,tsx}"\n' : "";

  return {
    PROJECT_NAME: context.projectName,
    PACKAGE_NAME: context.packageName,
    BIN_NAME: context.binName,
    FRONTEND_PRESET: context.frontend,
    AI_ENABLED: String(context.ai),
    HAS_WORKSPACES: String(context.hasWorkspaces),
    WORKSPACES_BLOCK: workspacesBlock,
    AI_SCRIPTS: aiScripts,
    FRONTEND_SCRIPTS: frontendScripts,
    FRONTEND_LEFTHOOK_COMMAND: frontendLefthookCommand,
    FRONTEND_TYPECHECK_GLOB: frontendTypecheckGlob,
  };
}

export function renderTemplate(templateName: string, context: TemplateContext): string {
  const raw = readFileSync(join(TEMPLATES_DIR, templateName), "utf8");
  const values = templateValues(context);
  return raw.replace(TOKEN_PATTERN, (_, token: string) => values[token] ?? `__${token}__`);
}
