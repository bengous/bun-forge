{
  "name": "__PACKAGE_NAME__",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "__BIN_NAME__": "./src/index.ts"
  },
__WORKSPACES_BLOCK__  "scripts": {
    "dev": "bun run src/index.ts",
    "typecheck": "tsc --noEmit --pretty false",
    "lint": "oxlint -c .oxlintrc.jsonc --format=unix src/ scripts/",
    "lint:errors": "oxlint -c .oxlintrc.jsonc --quiet --format=unix src/ scripts/",
    "lint:arch": "dependency-cruiser --config .dependency-cruiser.cjs --output-type err src scripts",
    "lint:dead": "knip --include files,dependencies,unlisted,binaries --reporter compact",
    "lint:dupes": "jscpd --config .jscpd.json",
    "format": "oxfmt --write -c .oxfmtrc.jsonc src/ scripts/",
    "format:check": "oxfmt --check -c .oxfmtrc.jsonc src/ scripts/",
    "autofix": "oxlint -c .oxlintrc.jsonc --fix src/ scripts/ && oxfmt --write -c .oxfmtrc.jsonc src/ scripts/",
    "test": "bun test ./src",
    "lint:audit": "bun scripts/quality/audit-oxlint-rules.ts",
    "check:links": "bun scripts/quality/check-links-local.ts",
__AI_SCRIPTS____EFFECT_SCRIPTS__    "repo:bootstrap": "bun scripts/setup/bootstrap-git-config.ts",
    "prepare": "bun scripts/setup/bootstrap-prepare.ts",
__FRONTEND_SCRIPTS__    "validate": "bun scripts/validation/validate.ts",
    "validate:scale": "bun run --silent validate && bun run --silent lint:dead && bun run --silent lint:arch && bun run --silent lint:dupes && bun run --silent check:links"
  },
__EFFECT_DEPENDENCIES_BLOCK__  "devDependencies": {
__EFFECT_DEV_DEPENDENCIES__    "@types/bun": "1.3.11",
    "dependency-cruiser": "17.3.10",
    "jscpd": "4.0.8",
    "knip": "6.1.1",
    "lefthook": "2.1.4",
    "oxfmt": "0.43.0",
    "oxlint": "1.58.0",
    "oxlint-plugin-complexity": "2.0.3",
    "oxlint-tsgolint": "0.19.0",
    "typescript": "6.0.2"
  }
}
