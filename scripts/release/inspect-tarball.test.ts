import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assertNoDefaultNetworkRoute, inspectTarball } from "./inspect-tarball.ts";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kitsmith-inspect-test-"));
  tempRoots.push(root);
  return root;
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, content);
}

async function makeTarball(files: Readonly<Record<string, string>>): Promise<string> {
  const root = makeTempRoot();
  const packageRoot = join(root, "package");
  mkdirSync(packageRoot, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(packageRoot, relativePath, content);
  }

  const tarballPath = join(root, "fixture.tgz");
  const tar = Bun.spawnSync(["tar", "-czf", tarballPath, "-C", root, "package"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (tar.exitCode !== 0) {
    throw new Error(tar.stderr.toString());
  }
  return tarballPath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("assertNoDefaultNetworkRoute", () => {
  test("accepts a route table without a default route", () => {
    expect(() => assertNoDefaultNetworkRoute("Iface\tDestination\nlo\t0000007F\n")).not.toThrow();
  });

  test("rejects a route table with a default route", () => {
    expect(() => assertNoDefaultNetworkRoute("Iface\tDestination\neth0\t00000000\n")).toThrow(
      "without a default route",
    );
  });
});

describe("inspectTarball", () => {
  test("records packed package metadata, allowlisted files, and hashes", async () => {
    const tarballPath = await makeTarball({
      "package.json": JSON.stringify({
        name: "kitsmith",
        version: "0.2.0",
        scripts: { prepack: "bun run build" },
        dependencies: { commander: "14.0.3" },
        devDependencies: { typescript: "6.0.3" },
      }),
      "README.md": "# Kitsmith\n",
      LICENSE: "MIT\n",
      "CHANGELOG.md": "# Changelog\n",
      "dist/index.js": "#!/usr/bin/env bun\n",
      "assets/brand/kitsmith-logo-full-640.png": "png",
      "templates/package.json.tpl": "{}\n",
      "template-sources/base/bunfig.toml": "[install]\n",
    });

    const inspection = await inspectTarball(tarballPath);

    expect(inspection.packageName).toBe("kitsmith");
    expect(inspection.version).toBe("0.2.0");
    expect(inspection.allowlist.passed).toBe(true);
    expect(inspection.files).toContain("dist/index.js");
    expect(inspection.scripts["prepack"]).toBe("bun run build");
    expect(inspection.lifecycleScripts.passed).toBe(true);
    expect(inspection.lifecycleScripts.forbiddenScripts).toEqual([]);
    expect(inspection.dependencies["commander"]).toBe("14.0.3");
    expect(inspection.devDependencies["typescript"]).toBe("6.0.3");
    expect(inspection.tarballSha512.length).toBeGreaterThan(80);
    expect(inspection.fileSha256["dist/index.js"]?.length).toBe(64);
  });

  test("fails closed for unexpected and sensitive files", async () => {
    const tarballPath = await makeTarball({
      "package.json": JSON.stringify({ name: "kitsmith", version: "0.2.0" }),
      ".env": "NPM_TOKEN=secret\n",
      "docs/private.md": "private\n",
    });

    let error: unknown;
    try {
      await inspectTarball(tarballPath);
    } catch (caught) {
      error = caught;
    }

    if (!(error instanceof Error)) {
      throw new Error("Expected inspectTarball to reject");
    }
    expect(error.message).toContain("Packed tarball contains files outside the release allowlist");
  });

  test("rejects packed install and publish lifecycle scripts", async () => {
    const tarballPath = await makeTarball({
      "package.json": JSON.stringify({
        name: "kitsmith",
        version: "0.2.0",
        scripts: {
          prepack: "bun run build",
          postinstall: "node postinstall.js",
          prepublishOnly: "node prepublish.js",
        },
      }),
      "README.md": "# Kitsmith\n",
      LICENSE: "MIT\n",
      "CHANGELOG.md": "# Changelog\n",
      "dist/index.js": "#!/usr/bin/env bun\n",
    });

    let error: unknown;
    try {
      await inspectTarball(tarballPath);
    } catch (caught) {
      error = caught;
    }

    if (!(error instanceof Error)) {
      throw new Error("Expected inspectTarball to reject lifecycle scripts");
    }
    expect(error.message).toContain("forbidden lifecycle scripts");
    expect(error.message).toContain("postinstall");
    expect(error.message).toContain("prepublishOnly");
  });
});
