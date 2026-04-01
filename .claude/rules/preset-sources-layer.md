---
paths:
  - "template-sources/**"
---

## Preset Sources Layer

**Layer invariant**: `template-sources/` contains preset files that bun-forge ships into generated projects as product defaults and overlays on top of the cleaned native scaffold base.

**Ownership rule**: These files are part of bun-forge's product contract. They are maintained here because bun-forge chooses to ship them, not because another repo is authoritative.

**Preset model**:

- `base/` is the common foundation preset
- `frontend-tanstack/` is an overlay that adds frontend-specific emitted files
- `ai/` is an overlay that adds agent/tooling-specific emitted files

`base/` is not the whole generated project by itself. It is the stable bun-forge overlay applied after native bootstrap and cleanup.

**Use preset sources when**:

- the file is stable across generated projects
- the content should be copied verbatim or with minimal adaptation
- the preset expresses a repo standard rather than a per-project variable

**Promotion rule**: If a copied preset starts needing conditional branches or token expansion, move that responsibility into `templates/`.

**Overlay rule**: Overlays may rely on declared composition order, but not on hidden dependencies or incidental file state from native bootstraps.

**Single-owner rule**: If two presets need to influence the same emitted file, ownership must be explicit. Prefer one preset owning the file or move the responsibility into `templates/`.

**Manifest discipline**: When the copied preset surface changes, keep `template-sources/manifest.json` aligned with reality.

**Product bias**: Treat copied presets as owned product defaults. Review them in terms of the generated-project contract, not in terms of historical provenance.
