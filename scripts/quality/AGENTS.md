## Repo Automation Scripts

**Layer invariant**: These scripts protect the integrity of the bun-forge repo and verify that generated projects behave as intended.

**Setup scripts**: Bootstrap local repo behavior only. They should not hide product decisions or mutate generated-project content.

**Quality scripts**: Audit focused concerns with explicit intent. Keep them narrow and explainable.

**Testing scripts**: Prefer validating the real scaffolding flow end to end: native bootstrap, cleanup, overlay/render, install, and validate a disposable project.

**Smoke tests are architectural**: `scripts/testing/` is the enforcement point for generated-project contract changes. They should exercise the actual Bun bootstrap and optional TanStack bootstrap flows, not a simplified internal path.

**Product lens**: A repo-only improvement is incomplete if it weakens confidence in emitted projects.
