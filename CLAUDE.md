# bun-forge

`bun-forge` is an opinionated Bun project scaffolder.

It generates projects by starting from native ecosystem bootstraps, then normalizing them into the bun-forge contract:

- backend starts from `bun init --yes`
- optional frontend starts from the official TanStack Router scaffold
- bun-forge then cleans native output, applies presets, renders templates, and finalizes install/bootstrap

## Repository Surfaces

- `src/` contains the scaffolder engine: CLI entrypoint, option collection, preset selection, template rendering, and project finalization.
- `templates/` contains tokenized files rendered with project-specific values and bun-forge-owned normalization.
- `template-sources/` contains stable preset files copied into generated projects as overlays on top of the native scaffold base.
- `scripts/` contains repo automation, validation, quality checks, AGENTS sync, and smoke tests.

## Change Routing

Before editing, decide which surface owns the change:

- Engine behavior or generation flow: `src/`
- Dynamic generated file with placeholders or conditional content: `templates/`
- Stable copied preset or repo standard shipped to generated projects: `template-sources/`
- Repo automation or validation logic: `scripts/`

If a change touches generated-project behavior, check whether it belongs in one surface or must be reflected in both copied presets and rendered templates.
Generated output also includes decisions about what native scaffold output is kept, replaced, or removed.

## Product Invariant

`bun-forge` dogfoods its own standards. A change is only complete when it keeps the scaffolder repo coherent and also preserves the quality of the projects it generates.

The generated project is part of the product contract. Visible output changes should be treated as deliberate product decisions, not as incidental side effects of internal refactors.
