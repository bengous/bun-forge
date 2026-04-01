## Antipattern Coverage

Last audit: 2026-04-01 | OXLint 1.58.0 | TypeScript 6.0.2 | Bun 1.3.11

Active rules: 242 | Available candidates: 439

When upgrading OXLint, TypeScript, or Bun, run `/antipattern-audit`.

### Coverage by plugin

| Plugin     | Active | Focus                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------ |
| eslint     | 93     | Correctness, best practices, no-unused-vars at error                           |
| typescript | 72     | Type safety, no-explicit-any, no-floating-promises, strict-boolean-expressions |
| unicorn    | 38     | Modern JS idioms, array method safety                                          |
| oxc        | 20     | Oxc-specific: bad comparisons, const analysis, erasing ops                     |
| import     | 19     | Module hygiene: no-cycle, no-default-export, consistent-type-specifier         |

### Key enforcement levels

| Antipattern                | Rule(s)                                              | Level |
| -------------------------- | ---------------------------------------------------- | ----- |
| Unused variables           | no-unused-vars                                       | error |
| Explicit `any`             | no-explicit-any                                      | error |
| Floating promises          | no-floating-promises                                 | error |
| Misused promises           | no-misused-promises                                  | error |
| Unsafe type assertions     | no-unsafe-type-assertion                             | error |
| Unreachable code           | no-unreachable                                       | error |
| Invalid regex              | no-invalid-regexp                                    | error |
| Duplicate keys/cases       | no-dupe-keys, no-duplicate-case                      | error |
| Constant conditions        | no-constant-condition, no-constant-binary-expression | error |
| Import cycles              | import/no-cycle                                      | warn  |
| Strict boolean expressions | strict-boolean-expressions                           | warn  |
| Consistent type imports    | consistent-type-imports                              | warn  |
| Prefer nullish coalescing  | prefer-nullish-coalescing                            | warn  |
| Cognitive complexity       | oxlint-plugin-complexity                             | warn  |

### Known gaps

| Gap                        | Reason                                          | Revisit when                     |
| -------------------------- | ----------------------------------------------- | -------------------------------- |
| JSON.parse type assertions | No lint rule catches `as T` on parse results    | OXLint adds narrowing-aware rule |
| Stringly-typed identifiers | No rule enforces branded types over raw strings | Project grows enough to warrant  |

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

## Scaffolder Source

**Layer invariant**: `src/` owns generation behavior, not emitted project content. Keep the engine focused on orchestration, option normalization, native bootstrap, cleanup routing, preset selection, template rendering, and finalization.

**Ownership**: `src/` decides how generation works, how native scaffolds are invoked, which native files are cleaned up, and which surface owns a change. It should not become a storage layer for preset payload or emitted-file policy that belongs elsewhere.

**Option rule**: If a CLI flag or prompt changes generated output, that output must still have an explicit owner in `templates/`, `template-sources/`, or an intentional finalization step. `src/` may route the change and decide native cleanup, but it should not quietly become the place where emitted file content is patched.

**Keep separate**:

- prompt and flag handling
- native backend and frontend bootstrap orchestration
- cleanup of native scaffold output
- naming and path helpers
- preset selection and copy orchestration
- template rendering
- install and bootstrap finalization

**Do not hardcode product files**: If a change mainly alters generated file content, prefer `templates/` or `template-sources/` instead of embedding the detail in engine code.

**Do not bypass surfaces**: If a behavior depends on preset payload, model it through preset selection, template rendering, or explicit finalization flow. Avoid engine-only shortcuts that silently override generated content policy or rely on incidental native scaffold leftovers.

**Verification rule**: New generation branches need a verification story. Pure orchestration logic should have targeted tests, and output-changing behavior should remain covered by smoke validation.

**Design bias**: Favor small composable helpers over feature-specific branching in the CLI entrypoint.
