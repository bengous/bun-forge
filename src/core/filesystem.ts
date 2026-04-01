import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath, root);
      }
      return [relative(root, fullPath)];
    }),
  );

  return nestedFiles.flat().toSorted((a, b) => a.localeCompare(b));
}

export async function listFilesRecursive(dir: string): Promise<string[]> {
  return walk(dir);
}

export async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
