---
name: antipattern-audit
description: Use when upgrading OXLint, TypeScript, or Bun versions, when the user wants to discover new lint rules to enable, mentions antipattern coverage, or after any .oxlintrc.jsonc change to verify the coverage table stays in sync.
---

# Antipattern Coverage Audit

## Overview

Keep oxlint rule coverage in sync with available rules after version upgrades. The audit script discovers newly available rules, tests them against the codebase, and updates both `.oxlintrc.jsonc` and the coverage documentation in one pass.

Do **not** use for one-off rule suppressions, project-specific overrides, or when the `Last audit:` version already matches the installed oxlint version.

## CLI

All data gathering goes through the audit script:

```
bun run lint:audit [subcommand]
```

| Subcommand | What it does |
|------------|-------------|
| `summary` | (default) Counts by plugin: active vs available, version, skip stats |
| `active` | All resolved active rules grouped by plugin with severity |
| `available` | Inactive rules filtered by skip-list, grouped by plugin/category |
| `test <rule>` | Temporarily deny a rule, show violation count + file:line locations |

## Workflow

### 1. Assess current state

```
bun run lint:audit summary
```

Compare the oxlint version against the `Last audit:` line in `.claude/rules/antipattern-coverage.md`. If versions match and nothing was upgraded, stop here.

### 2. Discover candidates

```
bun run lint:audit available
```

The output is pre-filtered: irrelevant plugins and noisy individual rules are already excluded.

Focus on these categories first (highest signal):
- `correctness` and `suspicious` -- genuine bug catchers
- `pedantic` -- stricter checks, often valuable
- `style` and `restriction` -- cherry-pick selectively

### 3. Test each candidate

For each interesting rule:

```
bun run lint:audit test <plugin/rule-name>
```

Decision matrix:
- **0 violations** -- safe to enable at `error` or `warn`
- **1-10 violations** -- enable at `warn`, fix violations, then promote
- **10+ violations** -- skip unless high-value; note in coverage.md gaps table with rationale

If the rule doesn't exist in oxlint (error on unknown rule), it hasn't been ported yet. Skip it.

### 4. Enable and validate

1. Add rule to `.oxlintrc.jsonc` in the appropriate section
2. Run `bun run validate` to confirm no breakage
3. Fix any violations or adjust severity

### 5. Update coverage documentation

Update `.claude/rules/antipattern-coverage.md`:
- Bump `Last audit:` date and OXLint version
- Add newly enabled rules to the "Covered by tooling" table
- Remove closed gaps from the "Known gaps" table
- Run `bun run agents:sync && bun run agents:check`

## Common Mistakes

- **Enabling without testing first** -- always run `lint:audit test <rule>` before adding to `.oxlintrc.jsonc`. A rule with 50+ violations will block `bun run validate`.
- **Forgetting coverage docs** -- enabling a rule in `.oxlintrc.jsonc` without updating `antipattern-coverage.md` causes the coverage table to drift out of sync.
- **Skipping `agents:sync`** -- rule changes often affect `antipattern-coverage.md` which is a rules file; forgetting `bun run agents:sync && bun run agents:check` leaves AGENTS files stale.
- **Re-adding skipped rules** -- the skip-list exists for documented reasons. Check the rationale below before re-evaluating a skipped rule.

## Skip-list rationale

The audit script excludes these automatically. If you want to revisit any, edit the `SKIP_PLUGINS` and `SKIP_RULES` constants in `scripts/quality/audit-oxlint-rules.ts`.

**Plugins**: jest/vitest (bun:test), jsdoc (no convention), nextjs (not Next.js), vue (not Vue), react_perf (too opinionated), node (Bun runtime), promise (too opinionated for this codebase)

**Rules**: sort-keys/sort-vars/sort-imports (not enforced), no-magic-numbers (too noisy), max-lines/max-params/max-depth/max-statements (cognitive complexity covers this), capitalized-comments (personal style), unicorn/no-null (too opinionated), unicorn/no-array-reduce (too opinionated), oxc/no-barrel-file (index.ts = public API), import/prefer-default-export (contradicts no-default-export)
