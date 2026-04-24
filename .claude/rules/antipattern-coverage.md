---
paths:
  - "src/**/*.ts"
  - "scripts/**/*.ts"
---

## Antipattern Coverage

Last audit: 2026-04-24 | OXLint 1.61.0 | TypeScript 6.0.3 | Bun 1.3.13

Active rules: 246 | Available candidates: 448

When upgrading OXLint, TypeScript, or Bun, run `/antipattern-audit`.

### Coverage by plugin

| Plugin     | Active | Focus                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------ |
| eslint     | 94     | Correctness, best practices, no-unused-vars at error                           |
| typescript | 73     | Type safety, no-explicit-any, no-floating-promises, strict-boolean-expressions |
| unicorn    | 40     | Modern JS idioms, array method safety                                          |
| oxc        | 20     | Oxc-specific: bad comparisons, const analysis, erasing ops                     |
| import     | 19     | Module hygiene: no-cycle, no-default-export, consistent-type-specifier         |

### Key enforcement levels

| Antipattern                | Rule(s)                                              | Level |
| -------------------------- | ---------------------------------------------------- | ----- |
| Unused variables           | no-unused-vars                                       | error |
| Explicit `any`             | no-explicit-any                                      | error |
| Floating promises          | no-floating-promises                                 | error |
| Misused promises           | no-misused-promises                                  | error |
| Unsafe type assertions     | no-unsafe-type-assertion                             | error |
| Unreachable code           | no-unreachable                                       | error |
| Invalid regex              | no-invalid-regexp                                    | error |
| Duplicate keys/cases       | no-dupe-keys, no-duplicate-case                      | error |
| Constant conditions        | no-constant-condition, no-constant-binary-expression | error |
| Import cycles              | import/no-cycle                                      | warn  |
| Strict boolean expressions | strict-boolean-expressions                           | warn  |
| Consistent type imports    | consistent-type-imports                              | warn  |
| Prefer nullish coalescing  | prefer-nullish-coalescing                            | warn  |
| Cognitive complexity       | oxlint-plugin-complexity                             | warn  |

### Known gaps

| Gap                        | Reason                                          | Revisit when                     |
| -------------------------- | ----------------------------------------------- | -------------------------------- |
| JSON.parse type assertions | No lint rule catches `as T` on parse results    | OXLint adds narrowing-aware rule |
| Stringly-typed identifiers | No rule enforces branded types over raw strings | Project grows enough to warrant  |
