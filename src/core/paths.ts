import { existsSync } from "node:fs";
import { join } from "node:path";

const currentDir = import.meta.dirname;

function resolvePackageRoot(): string {
  const candidates = [join(currentDir, ".."), join(currentDir, "..", "..")];
  const root = candidates.find(
    (candidate) =>
      existsSync(join(candidate, "package.json")) &&
      existsSync(join(candidate, "templates")) &&
      existsSync(join(candidate, "template-sources")),
  );

  if (root !== undefined) {
    return root;
  }

  throw new Error("Unable to locate Kitsmith package root");
}

export const PACKAGE_ROOT = resolvePackageRoot();
export const TEMPLATE_SOURCES_DIR = join(PACKAGE_ROOT, "template-sources");
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");
