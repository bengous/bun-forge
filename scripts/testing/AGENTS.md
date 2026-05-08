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

## Repo Automation Scripts

**Layer invariant**: These scripts protect the integrity of the kitsmith repo and verify that generated projects behave as intended.

**Setup scripts**: Bootstrap local repo behavior only. They should not hide product decisions or mutate generated-project content.

**Quality scripts**: Audit focused concerns with explicit intent. Keep them narrow and explainable.

**Testing scripts**: Prefer validating the real scaffolding flow end to end: native bootstrap, cleanup, overlay/render, install, and validate a disposable project.

**Smoke tests are architectural**: `scripts/testing/` is the enforcement point for generated-project contract changes. They should exercise the actual Bun bootstrap and optional TanStack bootstrap flows, not a simplified internal path.

**Product lens**: A repo-only improvement is incomplete if it weakens confidence in emitted projects.
