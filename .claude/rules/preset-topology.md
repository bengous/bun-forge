---
paths:
  - "template-sources/**"
  - "src/**/*.ts"
---

## Preset Topology

**Topology rule**: bun-forge currently ships a small explicit preset set:

- `base` provides the common project foundation
- `frontend-tanstack` extends the foundation with frontend-specific output
- `ai` extends the foundation with AI-agent and context-sync tooling

**Composition rule**: These presets are additive layers over the same generated project, not separate product families. They sit on top of the native bootstrap base that bun-forge creates first.

**Contract rule**: Changing which preset owns a file, changing overlay expectations, or changing the topology of the preset set is a generated-project contract change.

**Design bias**: Prefer making preset boundaries clearer over adding convenience coupling between presets.
