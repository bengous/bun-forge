export function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
}

export function toPackageName(projectName: string): string {
  return toKebabCase(projectName);
}

export function toBinName(projectName: string): string {
  return toKebabCase(projectName);
}
