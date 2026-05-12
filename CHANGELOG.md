# Changelog

## 0.2.0 - 2026-05-12

### Added

- Add Conventional Commits enforcement to Kitsmith and generated projects through
  Lefthook `commit-msg` hooks.
- Add agent-readable commit-message feedback so vague titles such as
  `Release 0.2.0` are rejected with actionable guidance.
- Add Cocogitto configuration and maintainer release documentation for Kitsmith
  itself, while keeping Cocogitto out of generated projects.

### Changed

- Make `kitsmith adopt` install the same Conventional Commits guard as new
  projects without rewriting existing commit history.
- Include `commitlint.config.js` in format checks for Kitsmith and generated
  projects.

## 0.1.3 - 2026-05-12

### Changed

- Update the quality-tooling baseline used by Kitsmith and by generated projects:
  `@clack/prompts` 1.4.0, `jscpd` 4.1.1, `knip` 6.13.0, `oxfmt` 0.49.0,
  and `oxlint` 1.64.0.
- Enable `eslint/prefer-regex-literals` in the repository and generated
  projects. This rejects `new RegExp("static-pattern")` when a regex literal is
  enough, which keeps simple regexes easier to read and avoids needless runtime
  construction.
- Enable stricter generated TanStack frontend accessibility rules:
  `jsx-a11y/no-noninteractive-element-to-interactive-role`,
  `jsx-a11y/no-redundant-roles`, and `jsx-a11y/prefer-tag-over-role`.
  These rules catch ARIA role misuse early, prefer native semantic elements over
  manual roles, and reduce generated UI patterns that can confuse assistive
  technologies.

## 0.1.2 - 2026-05-12

### Added

- Add `--lint-severity` for adoption workflows.

### Changed

- Make `kitsmith adopt --yes` copy OXLint rules as warnings by default, so existing projects can adopt Kitsmith without immediately failing on a strict lint baseline.
- Keep newly scaffolded projects on the strict OXLint baseline.

## 0.1.1 - 2026-05-10

### Fixed

- Fix generated TanStack projects so fresh scaffolds pass validation.
- Fix generated AI Codex hook presets.
- Allow generated Playwright config to use `PLAYWRIGHT_PORT` while keeping port `3000` by default.

## 0.1.0 - 2026-05-08

### Added

- Initial public release.
- Bun-first project scaffolding for TypeScript projects.
- Adoption workflow for existing Bun/TypeScript projects.
- Optional TanStack Router, Effect, Claude, and Codex presets.
