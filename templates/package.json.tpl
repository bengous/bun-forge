{
  "name": "__PACKAGE_NAME__",
  "version": "0.1.0",
  "type": "module",
  "private": true,
__BIN_BLOCK____WORKSPACES_BLOCK__  "scripts": {
    "dev": "__DEV_COMMAND__",
    "typecheck": "tsc --noEmit --pretty false",
    "lint": "oxlint -c .oxlintrc.jsonc --format=unix __ROOT_LINT_PATHS__",
    "lint:errors": "oxlint -c .oxlintrc.jsonc --quiet --format=unix __ROOT_LINT_PATHS__",
    "lint:arch": "dependency-cruiser --config .dependency-cruiser.cjs --output-type err __ROOT_ARCH_PATHS__",
    "lint:dead": "knip --include files,dependencies,unlisted,binaries --reporter compact",
    "lint:dupes": "jscpd --config .jscpd.json",
    "format": "oxfmt --write -c .oxfmtrc.jsonc __ROOT_FORMAT_GLOBS__",
    "format:check": "oxfmt --check -c .oxfmtrc.jsonc __ROOT_FORMAT_GLOBS__",
    "autofix": "oxlint -c .oxlintrc.jsonc --fix __ROOT_LINT_PATHS__ && oxfmt --write -c .oxfmtrc.jsonc __ROOT_FORMAT_GLOBS__",
    "test": "__TEST_COMMAND__",
__TEST_UNIT_SCRIPT____TEST_HOOKS_SCRIPT__    "lint:audit": "bun scripts/quality/audit-oxlint-rules.ts",
    "check:links": "bun scripts/quality/check-links-local.ts",
__AI_SCRIPTS____EFFECT_SCRIPTS__    "repo:bootstrap": "bun scripts/setup/bootstrap-git-config.ts",
    "prepare": "bun scripts/setup/bootstrap-prepare.ts",
__FRONTEND_SCRIPTS__    "validate": "bun scripts/validation/validate.ts",
    "validate:scale": "bun run --silent validate && bun run --silent lint:dead && bun run --silent lint:arch && bun run --silent lint:dupes && bun run --silent check:links"
  },
__EFFECT_DEPENDENCIES_BLOCK__  "devDependencies": {
__EFFECT_DEV_DEPENDENCIES__    "@types/bun": "1.3.13",
    "dependency-cruiser": "17.4.0",
    "jscpd": "4.0.9",
    "knip": "6.12.0",
    "lefthook": "2.1.6",
    "oxfmt": "0.48.0",
    "oxlint": "1.63.0",
    "oxlint-plugin-complexity": "2.1.2",
    "oxlint-tsgolint": "0.22.1",
    "typescript": "6.0.3"
  }
}
