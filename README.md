# bun-forge

Opinionated Bun project scaffolder.

Configuring TypeScript, linting, formatting, testing, hooks, and architecture validation to work together is tedious. bun-forge handles the wiring. One command sets up a TypeScript project with all of it configured and ready.

## Quick start

```bash
bunx bun-forge my-app
```

Answer a few prompts (project name, frontend, AI tooling). To skip prompts and use defaults:

```bash
bunx bun-forge my-app --yes
```

## What you get

Every generated project ships with:

| Category | Tool | Purpose |
|----------|------|---------|
| Runtime | Bun | Runtime, package manager, test runner |
| Language | TypeScript (strict) | Type safety with strict mode enabled |
| Linting | OXLint | 242 rules across 5 plugins (ESLint, TypeScript, Unicorn, OXC, Import) |
| Formatting | OXFmt | Fast, opinionated code formatter |
| Testing | bun:test | Native Bun test runner |
| Git hooks | Lefthook | Format, lint, and type-check on commit; validate on push |
| Secrets | gitleaks | Detect leaked credentials before they reach the repo |
| Architecture | dependency-cruiser | Enforce module boundaries and import rules |
| Dead code | knip | Find unused exports, dependencies, and files |
| Duplicates | jscpd | Detect copy-pasted code |
| Tool versions | mise | Pin and manage tool versions across the team |

## Presets

bun-forge combines two independent options into four project shapes:

### Frontend

| Value | What it adds |
|-------|-------------|
| `none` (default) | Backend-only Bun project |
| `tanstack` | React 19 + TanStack Router with file-based routing, Vite, Vitest, Testing Library, StyleLint. Lives in an `apps/frontend/` workspace |

### AI tooling

| Value | What it adds |
|-------|-------------|
| `true` (default) | CLAUDE.md, .claude/ hooks and rules, MCP server config, Codex config, AGENTS.md |
| `false` | No AI tooling |

## CLI usage

```
bun-forge [destination] [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name` | string | derived from destination | Project name |
| `--frontend` | `none` \| `tanstack` | `none` | Frontend preset |
| `--ai` | boolean | `true` | Include AI tooling |
| `--install` | boolean | `true` | Run `bun install`, `bun run prepare`, and `mise install` |
| `--git-init` | boolean | `true` | Initialize a git repository |
| `--yes` | flag | — | Skip prompts, use defaults |

## Scripts in generated projects

| Command | What it does |
|---------|-------------|
| `bun run dev` | Run the project |
| `bun run test` | Run tests |
| `bun run lint` | Lint with OXLint |
| `bun run format` | Format with OXFmt |
| `bun run autofix` | Lint fix + format in one pass |
| `bun run typecheck` | Type-check with TypeScript |
| `bun run validate` | Run the full validation suite (lint, format, types, tests, architecture) |
| `bun run lint:arch` | Check module architecture |
| `bun run lint:dead` | Find dead code |
| `bun run lint:dupes` | Find duplicated code |

Frontend projects add `bun run validate:frontend` and per-scope scripts inside `apps/frontend/`.

## Contributing

```bash
bun install
bun run dev -- /tmp/my-app --yes
bun run typecheck
bun test
```
