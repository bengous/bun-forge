---
paths:
  - "src/**/*.ts"
  - "templates/**"
  - "template-sources/**"
  - "scripts/testing/**/*.ts"
---

## Product Architecture

**Model**: `kitsmith` is a product that emits another product. The repository is organized around a fixed native-first generation pipeline:

- collect and normalize options
- bootstrap the backend with native Bun
- optionally bootstrap the frontend with the native TanStack scaffold
- clean native scaffold output that kitsmith does not keep
- copy preset sources
- render dynamic templates
- finalize install and bootstrap
- verify the emitted project through smoke tests

**Stage ownership**:

- `src/` owns orchestration, native bootstrap routing, and cleanup decisions
- `template-sources/` owns stable copied overlays
- `templates/` owns declared output variation and kitsmith-owned normalization
- `scripts/testing/` proves the emitted product still works

**Do not collapse stages**: A stage should not quietly absorb another stage's responsibility. Native bootstrap, cleanup, preset overlays, and template rendering are separate product stages and should stay explicit.

**Architecture bias**: Prefer explicit ownership and visible product flow over convenience shortcuts.
