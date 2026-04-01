# __PROJECT_NAME__

Opinionated Bun starter generated from Bun-forge presets.

## Commands

```bash
bun run dev
bun run validate
bun run lint:audit
```

## Options selected

- Frontend preset: `__FRONTEND_PRESET__`
- AI tooling enabled: `__AI_ENABLED__`

## Project bootstrap

```bash
bun install
bun run prepare
```

## Hooks and validation

- `lefthook.yml` protects the repo surfaces that bun-forge generated for this project.
- If you move code to new directories, update `lefthook.yml` globs and the validation scripts together.
- `glob_matcher: doublestar` is enabled so patterns like `src/**/*.ts` still match files directly under `src/`.
