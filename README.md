# bun-forge

Opinionated Bun project scaffolder.

bun-forge starts from native ecosystem bootstraps, then normalizes the result into a Bun/TypeScript project with linting, formatting, tests, git hooks, validation scripts, and optional AI tooling.

## Quick start

Install from npm:

```bash
bunx bun-forge@0.1.0 my-app --yes
```

Omit `--yes` to answer prompts:

```bash
bunx bun-forge@0.1.0 my-app
```

## Project shapes

The default project is a Bun backend with AI tooling, install/bootstrap enabled, and git initialized.

| Option | Values | Default | Effect |
|--------|--------|---------|--------|
| `--backend` | `true` \| `false` | `true` | Generate a Bun backend starter |
| `--frontend` | `none` \| `tanstack` | `none` | Add a React 19 + TanStack Router frontend in `apps/frontend/` |
| `--ai` | `true` \| `false` | `true` | Add Claude/Codex hooks, rules, MCP config, and generated `AGENTS.md` files |
| `--effect` | `true` \| `false` | `false` | Use an Effect backend starter and Effect tooling |
| `--install` | `true` \| `false` | `true` | Run `bun install`, project `prepare`, and `mise install` when available |
| `--git-init` | `true` \| `false` | `true` | Initialize a git repository |

`--backend false` requires `--frontend tanstack`. `--effect true` requires the backend starter.

Examples:

```bash
bunx bun-forge@0.1.0 api --backend true --frontend none --ai false --yes
bunx bun-forge@0.1.0 web --frontend tanstack --effect true --yes
bunx bun-forge@0.1.0 frontend-only --backend false --frontend tanstack --install false --yes
```

## Adopt an existing project

`adopt` plans Bun Forge tooling for an existing Bun/TypeScript project. It is dry-run by default.

```bash
bunx bun-forge@0.1.0 adopt . --yes
```

Apply the plan:

```bash
bunx bun-forge@0.1.0 adopt . --apply --yes
```

Run install/bootstrap after applying:

```bash
bunx bun-forge@0.1.0 adopt . --apply --install true --yes
```

Rollback a previous adoption run:

```bash
bunx bun-forge@0.1.0 adopt . --rollback <runId> --yes
```

Adoption options:

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `--name` | string | destination package name | Override project/package naming |
| `--frontend` | `none` \| `tanstack` | `none` | Include frontend-related Bun Forge files |
| `--ai` | `true` \| `false` | `true` | Include Claude/Codex/AGENTS tooling |
| `--effect` | `true` \| `false` | `false` | Include Effect backend files |
| `--install` | `true` \| `false` | `false` | Run install/bootstrap after apply |
| `--apply` | flag | off | Write the adoption plan |
| `--rollback` | run id | unset | Restore files from a previous adoption backup |
| `--yes` | flag | off | Skip prompts and use defaults |

## CLI usage

```text
bun-forge [options] [command] [destination]
```

Root options:

```text
--name <projectName>
--backend <enabled>
--frontend <preset>
--ai <enabled>
--effect <enabled>
--install <enabled>
--git-init <enabled>
--yes
```

Subcommands:

```text
adopt [options] [destination]
```

## Generated project scripts

Generated projects include the root scripts needed for local development and validation.

| Command | Purpose |
|---------|---------|
| `bun run dev` | Run the project |
| `bun run test` | Run tests |
| `bun run lint` | Lint with OXLint |
| `bun run format` | Format with OXFmt |
| `bun run autofix` | Lint fix + format |
| `bun run typecheck` | Type-check with TypeScript |
| `bun run validate` | Run the validation suite |
| `bun run lint:arch` | Check module boundaries |
| `bun run lint:dead` | Find unused files, exports, and dependencies |
| `bun run lint:dupes` | Find duplicated code |

Frontend projects also include frontend-specific validation scripts under `apps/frontend/`.

## Contributing

```bash
bun install
bun run repo:prepare
bun run dev -- /tmp/my-app --yes
bun run validate
```
