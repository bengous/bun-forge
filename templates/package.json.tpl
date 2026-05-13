{
  "name": "__PACKAGE_NAME__",
  "version": "0.1.0",
  "type": "module",
  "private": true,
__BIN_BLOCK____WORKSPACES_BLOCK__  "scripts": {
    "dev": "__DEV_COMMAND__",
    "test": "__TEST_COMMAND__",
    "autofix": "oxlint -c .oxlintrc.jsonc --fix __ROOT_LINT_PATHS__ && oxfmt --write -c .oxfmtrc.jsonc __ROOT_FORMAT_GLOBS__",
    "check": "bun scripts/validation/validate.ts --plan check",
__AI_SCRIPTS____EFFECT_SCRIPTS____FRONTEND_SCRIPTS__    "setup": "bun scripts/setup/bootstrap-git-config.ts && bun scripts/setup/bootstrap-prepare.ts",
    "validate": "bun scripts/validation/validate.ts"
  },
__EFFECT_DEPENDENCIES_BLOCK__  "devDependencies": {
__ROOT_DEV_DEPENDENCIES__
  }
}
