export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(raw: string, label: string): JsonObject {
  const parsed = JSON.parse(raw) as unknown;
  if (!isJsonObject(parsed)) {
    throw new TypeError(`${label} must contain a JSON object`);
  }
  return parsed;
}

export async function readJsonObject(path: string): Promise<JsonObject> {
  return parseJsonObject(await Bun.file(path).text(), path);
}

export function objectField(source: JsonObject, key: string): JsonObject {
  const value = source[key];
  return isJsonObject(value) ? value : {};
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      strings.push(entry);
    }
  }
  return strings;
}
