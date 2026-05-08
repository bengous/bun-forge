## Generated Project Contract

**Contract rule**: Any visible change to the generated project is a product contract change and should be treated deliberately.

**Contract surfaces include**:

- generated file set
- root structure of emitted projects
- scripts exposed by generated `package.json`
- preset defaults and overlay behavior
- AI and frontend output when those presets are enabled
- what kitsmith keeps from native scaffold output
- what kitsmith overwrites from native scaffold output
- what kitsmith deletes during cleanup

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

## Templates Layer

**Layer invariant**: `templates/` is for generated files whose content depends on project variables or selected presets, including kitsmith-owned normalization of native scaffold output.

**Declared variation only**: A template should exist because the generated file varies as part of the product design, not because templating is merely convenient.

**Use templates when**:

- the emitted file depends on project name, package name, or bin name
- content changes when AI or frontend presets are enabled
- kitsmith intentionally replaces or normalizes a native scaffolded file
- the file would become awkward to maintain as a copied preset

**Placeholder discipline**: Placeholders should model product inputs or preset-driven variation only. Avoid placeholder sprawl that hides the intended generated output.

**Keep templates readable**: Use the smallest set of placeholders that expresses the variation. A template should stay close to the final generated file and remain inspectable as product intent.

**Promotion rule**: If a template stops varying meaningfully, move it to `template-sources/`.
