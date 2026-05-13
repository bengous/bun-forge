import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { objectField, parseJsonObject } from "../../src/core/json.ts";

const packageScripts = objectField(
  parseJsonObject(readFileSync("package.json", "utf8"), "package.json"),
  "scripts",
);

test("live package exposes no legacy command aliases", () => {
  for (const scriptName of ["validate:scale", "validate:frontend", "validate:supply-chain"]) {
    expect(packageScripts[scriptName]).toBeUndefined();
  }
});

test("public generated-project docs do not expose removed commands", () => {
  const generatedReadme = readFileSync("templates/README.md.tpl", "utf8");
  for (const forbidden of ["validate:scale", "validate:frontend", "validate:supply-chain"]) {
    expect(generatedReadme).not.toContain(forbidden);
  }
});

test("maintainer docs mention legacy scale only as a removed command", () => {
  const docs = readFileSync("docs/maintainer-validation.md", "utf8");
  expect(docs).toContain("| `validate:scale` | removed |");
  expect(docs).not.toContain("`validate:scale` | `");
  expect(docs).not.toContain("validate:frontend");
  expect(docs).not.toContain("validate:supply-chain");
});
