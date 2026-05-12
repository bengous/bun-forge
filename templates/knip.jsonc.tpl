{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  // Lefthook is invoked dynamically by scripts/setup/bootstrap-prepare.ts.
  // Commitlint is invoked dynamically by the Lefthook commit-msg hook.
  "ignoreDependencies": ["@commitlint/cli", "lefthook"],
  "workspaces": {
    ".": {
      "entry": [__KNIP_ROOT_ENTRY__],
      "project": [__KNIP_ROOT_PROJECT__]
    }__KNIP_FRONTEND_WORKSPACE__
  }
}
