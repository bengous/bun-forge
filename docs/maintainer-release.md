# Maintainer Release Workflow

Kitsmith uses Conventional Commits for commit history quality. Lefthook owns Git hooks in this
repository; do not install Cocogitto hooks with `cog install-hook`.

Cocogitto is maintainer tooling for release preparation only. It is not part of the generated
project contract.

## Install Cocogitto

Install the `cog` binary outside the Bun dependency graph:

```bash
cargo install --locked cocogitto
```

Use another package manager if preferred, but keep `cog` as an external maintainer prerequisite.

## Create Commits

Regular `git commit` is still valid. The Lefthook `commit-msg` hook validates the final message.

Cocogitto can also create Conventional Commits directly:

```bash
cog commit feat "add generated commit hooks" scaffold
cog commit fix "preserve existing commit hooks" adopt
cog commit chore "update release workflow" release
```

Use `--edit` when the commit needs a body:

```bash
cog commit chore --edit "publish kitsmith 0.2.0" release
```

Release commits should explain what changed and why the version is releasable.

## Inspect Release State

Run the automated local preparation gate before asking for publish approval:

```bash
bun run release:prepare
```

This command checks the current version, tag availability, npm availability, Cocogitto state,
repo validation, npm dry-run publishing, package creation, and packed CLI version. It does not
publish, push, tag, or scaffold temporary generated projects.

Run Cocogitto checks manually when debugging release state:

```bash
cog check
cog changelog v0.1.3..HEAD
cog bump --auto --dry-run
```

`cog.toml` is configured for `v`-prefixed tags, GitHub links, and `CHANGELOG.md`.

`cog bump --auto --dry-run` follows Conventional Commit SemVer. A `feat(...)` commit proposes the
next minor version, so a feature commit after `v0.1.3` proposes `v0.2.0`. Use an explicit increment
only when the maintainer deliberately wants to override the conventional release level.

Do not run non-dry-run `cog bump` as part of routine work yet. Treat version bumping, changelog
writing, tagging, and npm publishing as an explicit release slice that still requires human
approval.

## Changelog Policy

Kitsmith keeps `CHANGELOG.md` as a maintainer-owned release note, but Cocogitto is the release
candidate source. Before editing the changelog, inspect the generated candidate:

```bash
cog changelog "$(git describe --tags --abbrev=0)..HEAD"
```

That output is an aggregation of the final commits since the latest tag. If the project uses
squash merges, the squash commit title and body become the changelog input. This means commits
that land on `main` must be changelog-quality:

- the title says what changed, not just that a release happened
- the scope names the affected product surface when useful
- the body explains user-visible behavior, generated-project contract changes, and maintenance
  impact
- pure maintenance commits use `chore`, `docs`, `test`, or `refactor` deliberately so they can be
  included or ignored intentionally later

Do not blindly paste generated changelog output. Use it to avoid missing commit-derived changes,
then write the human-facing release note in `CHANGELOG.md`.

## Publish After Approval

After `bun run release:prepare` passes and the release has explicit human approval:

```bash
npm publish --access public
git tag -m "Release 0.2.0" v0.2.0
git push origin main
git push origin v0.2.0
npm view kitsmith version dist-tags --json
```

If npm requires 2FA, rerun publish with the current OTP:

```bash
npm publish --access public --otp=<code>
```

Do not tag or push if npm publish fails.
