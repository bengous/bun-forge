import type { TemplateContext } from "../types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES_DIR } from "./paths.ts";

const TOKEN_PATTERN = /__([A-Z0-9_]+?)__/g;

export function templateValues(context: TemplateContext): Record<string, string> {
  const workspacesBlock = context.hasWorkspaces ? '  "workspaces": [\n    "apps/*"\n  ],\n' : "";

  const binBlock = context.backend
    ? `  "bin": {\n    "${context.binName}": "./src/index.ts"\n  },\n`
    : "";

  const rootLintPaths = [
    ...(context.backend ? ["src/"] : []),
    "scripts/",
    ...(context.ai ? [".codex/hooks/", ".claude/hooks/"] : []),
  ].join(" ");

  const rootArchPaths = [
    ...(context.backend ? ["src"] : []),
    "scripts",
    ...(context.ai ? ["./.codex/hooks", "./.claude/hooks"] : []),
  ].join(" ");

  const rootFormatGlobs = [
    ...(context.backend ? ["'src/**/*.{ts,tsx,js,jsx,mjs}'"] : []),
    "'scripts/**/*.{ts,tsx,js,jsx,mjs}'",
    ...(context.ai
      ? ["'.codex/hooks/**/*.{ts,tsx,js,jsx,mjs}'", "'.claude/hooks/**/*.{ts,tsx,js,jsx,mjs}'"]
      : []),
  ].join(" ");

  const devCommand = context.backend ? "bun run src/index.ts" : "bun run dev:frontend";

  const testCommand = context.backend
    ? context.ai
      ? "bun test ./src && bun run test:hooks"
      : "bun test ./src"
    : context.ai
      ? "bun run test:unit && bun run test:hooks"
      : "bun run test:unit";

  const frontendUnitTestScript =
    context.frontend === "tanstack" ? '    "test:unit": "cd apps/frontend && bun run test",\n' : "";

  const testHooksScript = context.ai
    ? '    "test:hooks": "bun test ./.codex/hooks ./.claude/hooks",\n'
    : "";

  const aiScripts = context.ai
    ? '    "agents:sync": "bun scripts/agents/sync-agents-md.ts --write",\n    "agents:check": "bun scripts/agents/sync-agents-md.ts --check",\n'
    : "";

  const frontendScripts =
    context.frontend === "tanstack"
      ? '    "dev:frontend": "cd apps/frontend && bun run dev",\n    "typecheck:frontend": "cd apps/frontend && bun run typecheck",\n    "lint:frontend": "cd apps/frontend && bun run lint",\n    "format:check:frontend": "cd apps/frontend && bun run format:check",\n    "lint:arch:frontend": "cd apps/frontend && dependency-cruiser --config .dependency-cruiser.cjs --output-type err src e2e playwright.config.ts vite.config.ts",\n    "lint:css:frontend": "cd apps/frontend && bun run lint:css",\n    "build:frontend": "cd apps/frontend && bun run build",\n    "test:e2e": "cd apps/frontend && bunx playwright test",\n    "validate:frontend": "bun run --silent typecheck:frontend && cd apps/frontend && bun run --silent test && cd ../.. && bun run --silent lint:frontend && bun run --silent format:check:frontend && bun run --silent lint:arch:frontend && bun run --silent lint:css:frontend && bun run --silent build:frontend && bun run --silent test:e2e",\n'
      : "";

  const effectScripts = context.effect
    ? '    "effect:diagnose": "effect-language-service diagnostics --project tsconfig.json",\n    "effect:quickfixes": "effect-language-service quickfixes --project tsconfig.json",\n'
    : "";

  const effectDependenciesBlock = context.effect
    ? '  "dependencies": {\n    "@effect/cli": "0.75.1",\n    "@effect/platform": "0.96.1",\n    "@effect/platform-bun": "0.89.0",\n    "effect": "3.21.2"\n  },\n'
    : "";

  const effectDevDependencies = context.effect ? '    "@effect/language-service": "0.85.1",\n' : "";

  const effectTsconfigPlugins = context.effect
    ? ',\n    "plugins": [{\n      "name": "@effect/language-service",\n      "diagnostics": true,\n      "quickinfo": true,\n      "completions": true,\n      "ignoreEffectWarningsInTscExitCode": false,\n      "diagnosticSeverity": {\n        "anyUnknownInErrorContext": "warning",\n        "deterministicKeys": "warning",\n        "extendsNativeError": "warning",\n        "importFromBarrel": "warning",\n        "instanceOfSchema": "warning",\n        "missedPipeableOpportunity": "suggestion",\n        "missingEffectServiceDependency": "warning",\n        "nodeBuiltinImport": "off",\n        "schemaUnionOfLiterals": "suggestion",\n        "serviceNotAsClass": "warning",\n        "strictBooleanExpressions": "warning",\n        "strictEffectProvide": "warning"\n      }\n    }]'
    : "";

  const frontendLefthookCommand =
    context.frontend === "tanstack"
      ? '    frontend-oxc:\n      glob:\n        - "apps/frontend/**/*.{ts,tsx}"\n      run: ./node_modules/.bin/oxlint --type-aware -c apps/frontend/.oxlintrc.jsonc --fix --quiet --format=unix {staged_files} && ./node_modules/.bin/oxfmt --write -c apps/frontend/.oxfmtrc.jsonc {staged_files}\n      stage_fixed: true\n'
      : "";

  const frontendTypecheckGlob =
    context.frontend === "tanstack" ? '        - "apps/frontend/**/*.{ts,tsx}"\n' : "";

  const backendLefthookGlob = context.backend ? '        - "src/**/*.ts"\n' : "";
  const codexLefthookGlob = context.ai ? '        - ".codex/hooks/**/*.ts"\n' : "";
  const claudeLefthookGlob = context.ai ? '        - ".claude/hooks/**/*.ts"\n' : "";

  const tsconfigPlugins = context.effect ? effectTsconfigPlugins : "";
  const tsconfigInclude = [
    ...(context.backend ? ['"src/**/*.ts"'] : []),
    '"scripts/**/*.ts"',
    ...(context.ai ? ['".codex/hooks/**/*.ts"', '".claude/hooks/**/*.ts"'] : []),
  ].join(", ");

  const knipRootEntry = [
    ...(context.backend ? ['"src/index.ts"', '"src/**/*.test.ts"'] : []),
    '"scripts/**/*.ts"',
    ...(context.ai ? ['".claude/hooks/**/*.ts"', '".codex/hooks/**/*.ts"'] : []),
  ].join(", ");

  const knipRootProject = [
    ...(context.backend ? ['"src/**/*.ts"'] : []),
    '"scripts/**/*.ts"',
    ...(context.ai ? ['".claude/hooks/**/*.ts"', '".codex/hooks/**/*.ts"'] : []),
  ].join(", ");

  const knipFrontendWorkspace =
    context.frontend === "tanstack"
      ? ',\n    "apps/frontend": {\n      "entry": [\n        "src/main.tsx",\n        "src/routes/**/*.{ts,tsx}",\n        "src/**/*.{test,spec}.{ts,tsx}",\n        "e2e/**/*.ts",\n        "playwright.config.ts",\n        "vite.config.ts"\n      ],\n      "project": ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "playwright.config.ts", "vite.config.ts"]\n    }'
      : "";

  const projectConventionPaths = [
    ...(context.backend ? ['  - "src/**/*.ts"'] : []),
    '  - "scripts/**/*.ts"',
  ].join("\n");

  const projectConventionTitle = context.backend
    ? "Backend And Tooling Conventions"
    : "Tooling Script Conventions";

  return {
    PROJECT_NAME: context.projectName,
    PACKAGE_NAME: context.packageName,
    BIN_NAME: context.binName,
    BACKEND_ENABLED: String(context.backend),
    FRONTEND_PRESET: context.frontend,
    AI_ENABLED: String(context.ai),
    HAS_WORKSPACES: String(context.hasWorkspaces),
    BIN_BLOCK: binBlock,
    ROOT_LINT_PATHS: rootLintPaths,
    ROOT_ARCH_PATHS: rootArchPaths,
    ROOT_FORMAT_GLOBS: rootFormatGlobs,
    DEV_COMMAND: devCommand,
    TEST_COMMAND: testCommand,
    TEST_UNIT_SCRIPT: frontendUnitTestScript,
    TEST_HOOKS_SCRIPT: testHooksScript,
    WORKSPACES_BLOCK: workspacesBlock,
    AI_SCRIPTS: aiScripts,
    EFFECT_SCRIPTS: effectScripts,
    EFFECT_DEPENDENCIES_BLOCK: effectDependenciesBlock,
    EFFECT_DEV_DEPENDENCIES: effectDevDependencies,
    EFFECT_TSCONFIG_PLUGINS: tsconfigPlugins,
    TSCONFIG_INCLUDE: tsconfigInclude,
    FRONTEND_SCRIPTS: frontendScripts,
    FRONTEND_LEFTHOOK_COMMAND: frontendLefthookCommand,
    FRONTEND_TYPECHECK_GLOB: frontendTypecheckGlob,
    BACKEND_LEFTHOOK_GLOB: backendLefthookGlob,
    CODEX_LEFTHOOK_GLOB: `${codexLefthookGlob}${claudeLefthookGlob}`,
    KNIP_ROOT_ENTRY: knipRootEntry,
    KNIP_ROOT_PROJECT: knipRootProject,
    KNIP_FRONTEND_WORKSPACE: knipFrontendWorkspace,
    PROJECT_CONVENTION_PATHS: projectConventionPaths,
    PROJECT_CONVENTION_TITLE: projectConventionTitle,
  };
}

export function renderTemplate(templateName: string, context: TemplateContext): string {
  const raw = readFileSync(join(TEMPLATES_DIR, templateName), "utf8");
  const values = templateValues(context);
  return raw.replace(TOKEN_PATTERN, (_, token: string) => values[token] ?? `__${token}__`);
}
