import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SENSITIVE_PATHS = [
  ".claude/settings.json",
  "lefthook.yml",
  ".oxlintrc.jsonc",
  ".oxfmtrc.jsonc",
  "tsconfig.json",
] as const;

export function ensureDestinationIsSafe(destination: string): void {
  if (!existsSync(destination)) {
    return;
  }

  const entries = readdirSync(destination);
  if (entries.length === 0) {
    return;
  }

  for (const path of SENSITIVE_PATHS) {
    if (existsSync(join(destination, path))) {
      throw new Error(`Refusing to overwrite existing sensitive file: ${path}`);
    }
  }

  throw new Error(`Destination is not empty: ${destination}`);
}
