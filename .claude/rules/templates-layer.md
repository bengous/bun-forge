---
paths:
  - "templates/**"
---

## Templates Layer

**Layer invariant**: `templates/` is for generated files whose content depends on project variables or selected presets, including bun-forge-owned normalization of native scaffold output.

**Declared variation only**: A template should exist because the generated file varies as part of the product design, not because templating is merely convenient.

**Use templates when**:

- the emitted file depends on project name, package name, or bin name
- content changes when AI or frontend presets are enabled
- bun-forge intentionally replaces or normalizes a native scaffolded file
- the file would become awkward to maintain as a copied preset

**Placeholder discipline**: Placeholders should model product inputs or preset-driven variation only. Avoid placeholder sprawl that hides the intended generated output.

**Keep templates readable**: Use the smallest set of placeholders that expresses the variation. A template should stay close to the final generated file and remain inspectable as product intent.

**Promotion rule**: If a template stops varying meaningfully, move it to `template-sources/`.
