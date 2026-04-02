import type { Preset } from "../types.ts";
import { join } from "node:path";
import { TEMPLATE_SOURCES_DIR } from "./paths.ts";

export const PRESETS: readonly Preset[] = [
  {
    name: "base",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "base"),
    enabled: () => true,
  },
  {
    name: "frontend-tanstack",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "frontend-tanstack"),
    enabled: (options) => options.frontend === "tanstack",
  },
  {
    name: "ai",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "ai"),
    enabled: (options) => options.ai,
  },
  {
    name: "effect",
    sourceDir: join(TEMPLATE_SOURCES_DIR, "effect"),
    enabled: (options) => options.effect,
  },
] as const;
