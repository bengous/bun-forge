import type { Preset } from "../types.ts";
import { join } from "node:path";
import { TEMPLATE_SOURCES_DIR } from "./paths.ts";

export const PRESETS: readonly Preset[] = [
  {
    name: "base",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "base"),
  },
  {
    name: "frontend-tanstack",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "frontend-tanstack"),
  },
  {
    name: "ai",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "ai"),
  },
  {
    name: "effect",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "effect"),
  },
] as const;
