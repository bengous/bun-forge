# __PROJECT_NAME__

Opinionated Bun starter generated from Kitsmith presets.

## Commands

- `bun run dev` - starts the local development workflow.
- `bun run test` - runs fast to medium behavior tests.
- `bun run autofix` - applies mechanical fixes and mutates files.
- `bun run check` - runs the fast read-only local gate.
- `bun run validate` - runs the broader daily read-only gate.
- `bun run setup` - applies local bootstrap side effects such as Git hook setup.
__CONDITIONAL_COMMANDS_README__

## Options selected

- Backend starter enabled: `__BACKEND_ENABLED__`
- Frontend preset: `__FRONTEND_PRESET__`
- AI tooling enabled: `__AI_ENABLED__`

## Project bootstrap

```bash
bun install
bun run setup
```

## Hooks and validation

- `lefthook.yml` protects the repo surfaces that Kitsmith generated for this project.
- Commit messages are checked with Conventional Commits through the `commit-msg` hook.
- If you move code to new directories, update `lefthook.yml` globs and the validation scripts together.
- `glob_matcher: doublestar` is enabled so patterns like `src/**/*.ts` still match files directly under `src/`.
