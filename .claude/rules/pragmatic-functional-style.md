---
paths:
  - "src/**/*.ts"
  - "scripts/**/*.ts"
---

## Pragmatic Functional Style

**Use pure helpers for**: classification, planning, summarizing, token generation, manifest metadata, and command specs.

**Keep boundaries imperative**: CLI parsing, `Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.spawnSync`, cleanup, and process exits should stay direct.

**Prefer explicit collections when clearer**: Use `for`, `Map`, `Set`, or `Record` for indexing, counting, deduping, and stateful parsing when chained array methods hide intent.

**No FP library**: Do not add a functional-programming dependency for local script or scaffolder cleanup.
