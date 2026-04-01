---
paths:
  - "src/**/*.ts"
  - "templates/**"
  - "template-sources/**"
  - "scripts/testing/**/*.ts"
---

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
