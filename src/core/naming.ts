import type { BinName, PackageName, ProjectName } from "../types.ts";
import { brandValue } from "../types.ts";

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

export function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
}

export function toProjectName(value: string): ProjectName {
  return brandValue<string, "ProjectName">(nonEmpty(value, "Project name"));
}

export function toPackageName(projectName: string): PackageName {
  const packageName = toKebabCase(projectName);
  return brandValue<string, "PackageName">(nonEmpty(packageName, "Package name"));
}

export function toExistingPackageName(value: string): PackageName {
  return brandValue<string, "PackageName">(nonEmpty(value, "Package name"));
}

export function toBinName(projectName: string): BinName {
  const binName = toKebabCase(projectName);
  return brandValue<string, "BinName">(nonEmpty(binName, "Bin name"));
}

export function toExistingBinName(value: string): BinName {
  return brandValue<string, "BinName">(nonEmpty(value, "Bin name"));
}
