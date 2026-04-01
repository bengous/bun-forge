---
paths:
  - "scripts/validation/**/*.ts"
---

## Validation Scripts

**Layer invariant**: Validation scripts implement progressive, scope-aware feedback for the repo and for generated projects.

**Progressive model**:

- edit-level feedback should stay cheap and local
- stop and hook validation should stay scope-aware
- full validation should remain independent and reproducible

**Shared logic**: Scope detection belongs in shared validation helpers, not duplicated across each script.

**Boundary**: Do not couple these scripts to scaffolder engine internals. They are external tooling, not part of runtime generation flow.

**Decision bias**: When changing validation behavior, optimize for trustworthy signal and predictable developer feedback rather than maximal cleverness.
