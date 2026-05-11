# Changelog

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
