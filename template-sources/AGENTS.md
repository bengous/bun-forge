## Generated Project Contract

**Contract rule**: Any visible change to the generated project is a product contract change and should be treated deliberately.

**Contract surfaces include**:

- generated file set
- root structure of emitted projects
- scripts exposed by generated `package.json`
- preset defaults and overlay behavior
- AI and frontend output when those presets are enabled
- what bun-forge keeps from native scaffold output
- what bun-forge overwrites from native scaffold output
- what bun-forge deletes during cleanup

**Decision rule**: If a change modifies generated output, ask whether the change is intended product evolution or accidental drift from an internal refactor or from upstream native scaffold behavior.

**Validation rule**: Contract changes are incomplete unless smoke-style validation still demonstrates that the emitted project installs, validates, and behaves as expected.

## Preset Composition

**Composition order**: Presets compose explicitly over a project that has already been bootstrapped and cleaned. Base comes first, optional overlays come after, and template rendering happens after preset copies.

**Ownership rule**: Each emitted file should have a clear owner:

- copied from a preset source
- rendered from a template
- finalized by an explicit generation step

**Avoid hidden coupling**: If multiple presets influence the same emitted file, make ownership explicit. Prefer a single template or a clearly defined overlay rule over accidental last-write-wins behavior.

**No native reliance**: Presets must not depend on incidental files left behind by Bun or TanStack scaffolds. If native scaffold output matters, cleanup and ownership should make that explicit first.

**No magic mutation**: Do not introduce cross-preset behavior that depends on implicit side effects, undocumented ordering assumptions, or ad hoc patching.

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

## Preset Topology

**Topology rule**: bun-forge currently ships a small explicit preset set:

- `base` provides the common project foundation
- `frontend-tanstack` extends the foundation with frontend-specific output
- `ai` extends the foundation with AI-agent and context-sync tooling

**Composition rule**: These presets are additive layers over the same generated project, not separate product families. They sit on top of the native bootstrap base that bun-forge creates first.

**Contract rule**: Changing which preset owns a file, changing overlay expectations, or changing the topology of the preset set is a generated-project contract change.

**Design bias**: Prefer making preset boundaries clearer over adding convenience coupling between presets.

## Product Architecture

**Model**: `bun-forge` is a product that emits another product. The repository is organized around a fixed native-first generation pipeline:

- collect and normalize options
- bootstrap the backend with native Bun
- optionally bootstrap the frontend with the native TanStack scaffold
- clean native scaffold output that bun-forge does not keep
- copy preset sources
- render dynamic templates
- finalize install and bootstrap
- verify the emitted project through smoke tests

**Stage ownership**:

- `src/` owns orchestration, native bootstrap routing, and cleanup decisions
- `template-sources/` owns stable copied overlays
- `templates/` owns declared output variation and bun-forge-owned normalization
- `scripts/testing/` proves the emitted product still works

**Do not collapse stages**: A stage should not quietly absorb another stage's responsibility. Native bootstrap, cleanup, preset overlays, and template rendering are separate product stages and should stay explicit.

**Architecture bias**: Prefer explicit ownership and visible product flow over convenience shortcuts.
