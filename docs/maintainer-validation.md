# Maintainer Validation

Kitsmith keeps the maintainer command surface separate from generated-project
commands. Public maintainer lanes are short entrypoints; validation membership
lives in `scripts/validation/validation-plan.ts`.

## Lanes

| Lane | Use | Notes |
| --- | --- | --- |
| `bun run autofix` | Apply mechanical fixes. | Mutating by design; run before read-only gates when you want the tree repaired. |
| `bun run check` | Fast local read-only feedback. | Excludes deep, generated, sandbox, supply-chain, and release work. |
| `bun run validate` | Daily complete read-only gate. | Includes `lint:arch` and the explicit `lint:audit` assignment. |
| `bun run validate:deep` | Daily gate plus slower local analysis. | Adds dead-code, duplicate-code, and local link checks without sandbox or release work. |
| `bun run validate:generated` | Host-safe generated-project contract checks. | Covers generated package scripts, emitted files, docs, template contracts, and non-sandbox generation scenarios. |
| `bun run validate:sandbox` | Sandbox, network, install, supply-chain, and smoke checks. | Uses e2e/safe-install/smoke scenarios outside the fast host-safe gates; `test:e2e-contract` and `test:safe-install` require Linux/bubblewrap. |
| `bun run release:prepare` | Maintainer release artifact preparation. | Runs release-only checks, scriptless `npm pack`, no-network tarball inspection, manifest writing, and tarball smoke; never runs inside validation lanes. |

`validate:generated` may create temporary projects under the OS temp directory.
It must not run bubblewrap sandboxes, network-enabled e2e scenarios,
`bun install`, sandbox smoke, tarball smoke, npm publish dry-runs, or registry
dependency execution.

`validate:sandbox` may run bubblewrap sandboxes, network-enabled generated-project
e2e scenarios, `bun install`, generated-project smoke, and code from registry
packages inside disposable projects or sandbox caches.
The supply-chain probe runs inside `test:safe-install` after sandboxed install.
This lane must not publish, tag, push, prepare a release, run release package
inspection, or execute tarball smoke; those release artifact checks stay in
`release:prepare`.

## Migration Map

| Previous/current command | Target lane | Status |
| --- | --- | --- |
| `validate` | `validate` | Kept as the daily gate. |
| `validate:scale` | removed | Replaced by explicit `validate:deep`, `validate:generated`, and `validate:sandbox` lanes; no legacy alias. |
| `lint:dead` | `validate:deep` | Kept as an internal leaf. |
| `lint:dupes` | `validate:deep` | Kept as an internal leaf. |
| `check:links` | `validate:deep` | Kept as an internal leaf. |
| `test:e2e-contract` | `validate:sandbox` | Kept as an internal leaf; requires Linux/bubblewrap and enables sandbox network. |
| `test:smoke` | `validate:sandbox` | Kept as an internal leaf. |
| `test:safe-install` | `validate:sandbox` | Kept as an internal leaf; requires Linux/bubblewrap. |
| supply-chain probe | `validate:sandbox` | Runs inside `test:safe-install` after sandboxed install. |
| tarball smoke | `release:prepare` | Kept release-only through `scripts/release/prepare.ts`. |
| `release:prepare` | `release:prepare` | Kept maintainer-only and outside validation lanes. |

## Internal leaves

The package can keep technical leaves such as `lint:dead`, `lint:dupes`,
`check:links`, `test:e2e-contract`, `test:smoke`, `test:safe-install`, and the
supply-chain probe for debugging and CI composition. They are implementation
details of the maintainer lanes, not the primary mental model for daily work.
