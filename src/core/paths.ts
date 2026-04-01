import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = join(currentDir, "..", "..");
export const TEMPLATE_SOURCES_DIR = join(PACKAGE_ROOT, "template-sources");
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");
