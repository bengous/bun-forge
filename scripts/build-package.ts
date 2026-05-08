import { chmodSync } from "node:fs";

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: false,
  sourcemap: "none",
  naming: "index.js",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outputPath = "./dist/index.js";
const built = await Bun.file(outputPath).text();
const executable = `#!/usr/bin/env bun\n${built.replace(/^#!.*\n/, "")}`;

await Bun.write(outputPath, executable);
chmodSync(outputPath, 0o755);
