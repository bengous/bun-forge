---
paths:
  - "scripts/**/*.ts"
---

## Scripts Layer

**Layer invariant**: `scripts/` contains standalone Bun automation for the repo and for confidence in generated projects.

**Role**: Scripts are tooling surfaces, not extensions of the scaffolder engine. They should stay explicit, deterministic, and easy to run independently.

**Boundary**: Avoid pushing product-generation logic into scripts when that logic belongs in `src/`. Scripts should orchestrate checks, bootstrap steps, sync tasks, and smoke verification.

**Failure mode**: Prefer clear exits and actionable errors over silent fallback behavior.
