---
paths:
  - ".claude/rules/**"
---

## Rules Conventions

**Purpose**: Rules provide progressive disclosure for agents editing a specific part of the repo. Keep them short, prescriptive, and local to the targeted surface.

**Structure**: Use valid YAML frontmatter with a `paths:` array, then a single `##` heading and compact invariants. Prefer constraints and routing guidance over implementation narration.

**Path targeting**: Target directories or coherent surfaces only. Do not target isolated root files such as `package.json`, because AGENTS sync maps `paths:` to directory-level `AGENTS.md` files.

**CLAUDE boundary**: Put always-needed repo context in `CLAUDE.md`. Put details that only matter while editing a specific area in rules.

**After rule changes**: Run `bun run agents:sync` and then `bun run agents:check`.
