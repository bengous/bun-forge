## AGENTS Sync Script

**Purpose**: `scripts/agents/` keeps Claude-native context and generated `AGENTS.md` files aligned for non-Claude agents.

**Source of truth**: `CLAUDE.md` and `.claude/rules/*.md` are authoritative. `AGENTS.md` files are generated artifacts.

**Mapping rule**: A rule's `paths:` frontmatter determines which directory receives its generated `AGENTS.md`. That mapping is part of the product contract for multi-agent compatibility.

**Stability bias**: Keep sync output deterministic. File layout, manifest semantics, and rule-to-directory mapping should not change casually.

**After changes**: Any edit to `CLAUDE.md`, `.claude/rules/`, or sync behavior should be validated with `agents:sync` and `agents:check`.
