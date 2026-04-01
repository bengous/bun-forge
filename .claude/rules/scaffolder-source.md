---
paths:
  - "src/**/*.ts"
---

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
