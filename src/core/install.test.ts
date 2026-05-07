import type { InitOptions } from "../types.ts";
import type { InstallRuntime } from "./install.ts";
import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bunForgeTempPath,
  bunInstallEnv,
  defaultInstallRuntime,
  finalizeProject,
  maybeInstallMiseWithRuntime,
} from "./install.ts";
import { toBinName, toPackageName, toProjectName } from "./naming.ts";

function makeOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    destination: "/tmp/forge-install",
    projectName: toProjectName("forge-install"),
    packageName: toPackageName("forge-install"),
    binName: toBinName("forge-install"),
    backend: true,
    frontend: "none",
    ai: false,
    effect: false,
    install: false,
    gitInit: false,
    yes: false,
    ...overrides,
  };
}

function createInstallRuntime(overrides: Partial<InstallRuntime> = {}): {
  readonly runtime: InstallRuntime;
  readonly commands: string[][];
  readonly warnings: string[];
} {
  const commands: string[][] = [];
  const warnings: string[] = [];

  const runtime: InstallRuntime = {
    ...defaultInstallRuntime,
    mkdir: async () => {},
    runCommand: async (command) => {
      commands.push(command);
    },
    hasCommand: () => false,
    confirm: async () => true,
    warn: (message: string) => {
      warnings.push(message);
    },
    ...overrides,
  };

  return { runtime, commands, warnings };
}

describe("maybeInstallMiseWithRuntime", () => {
  test("runs mise install when mise is available", async () => {
    const { runtime, commands } = createInstallRuntime({ hasCommand: () => true });
    await maybeInstallMiseWithRuntime(makeOptions({ install: true }), runtime);
    expect(commands).toEqual([["mise", "install"]]);
  });

  test("warns and skips in --yes mode when mise is missing", async () => {
    const { runtime, commands, warnings } = createInstallRuntime();
    await maybeInstallMiseWithRuntime(makeOptions({ install: true, yes: true }), runtime);
    expect(commands).toHaveLength(0);
    expect(warnings[0]).toContain("Skipping `mise install`.");
  });

  test("warns and returns when the user agrees to continue without mise", async () => {
    const { runtime, commands, warnings } = createInstallRuntime({ confirm: async () => true });
    await maybeInstallMiseWithRuntime(makeOptions({ install: true }), runtime);
    expect(commands).toHaveLength(0);
    expect(warnings).toEqual([
      "mise is not installed. Install it from https://mise.jdx.dev/getting-started.html",
    ]);
  });

  test("warns and continues in --yes mode when mise install fails", async () => {
    const { runtime, warnings } = createInstallRuntime({
      hasCommand: () => true,
      runCommand: async (command) => {
        if (command[0] === "mise") {
          throw new Error("mise failed in untrusted config");
        }
      },
    });

    await maybeInstallMiseWithRuntime(makeOptions({ install: true, yes: true }), runtime);
    expect(warnings).toEqual([
      "`mise install` failed: mise failed in untrusted config. Continuing without a successful `mise install`.",
    ]);
  });

  test("warns again when the user does not continue without mise", async () => {
    const { runtime, warnings } = createInstallRuntime({ confirm: async () => false });
    await maybeInstallMiseWithRuntime(makeOptions({ install: true }), runtime);
    expect(warnings).toEqual([
      "mise is not installed. Install it from https://mise.jdx.dev/getting-started.html",
      "Skipping `mise install`. Run it manually after installing mise.",
    ]);
  });
});

describe("bunInstallEnv", () => {
  test("defaults Bun temp paths to the OS temp directory", () => {
    expect(bunForgeTempPath("bun-tmp")).toBe(join(tmpdir(), "bun-tmp"));
    expect(bunInstallEnv({})["TMPDIR"]).toBe(join(tmpdir(), "bun-tmp"));
    expect(bunInstallEnv({})["BUN_TMPDIR"]).toBe(join(tmpdir(), "bun-tmp"));
    expect(bunInstallEnv({})["BUN_INSTALL"]).toBeUndefined();
  });

  test("preserves explicit Bun temp path overrides", () => {
    expect(
      bunInstallEnv({
        BUN_TMPDIR: "custom-tmp",
        BUN_INSTALL: "custom-install",
        BUN_INSTALL_CACHE_DIR: "custom-cache",
        TMPDIR: "custom-tmpdir",
      }),
    ).toMatchObject({
      BUN_TMPDIR: "custom-tmp",
      BUN_INSTALL: "custom-install",
      BUN_INSTALL_CACHE_DIR: "custom-cache",
      TMPDIR: "custom-tmpdir",
    });
  });
});

describe("finalizeProject", () => {
  test("syncs AGENTS before git and install steps when AI is enabled", async () => {
    const { runtime, commands } = createInstallRuntime({
      hasCommand: () => true,
    });

    await finalizeProject(
      makeOptions({
        ai: true,
        gitInit: true,
        install: true,
      }),
      runtime,
    );

    expect(commands).toEqual([
      ["bun", "scripts/agents/sync-agents-md.ts", "--write"],
      ["git", "init"],
      ["bun", "install"],
      ["bun", "run", "prepare"],
      ["mise", "install"],
    ]);
  });

  test("skips all optional commands when disabled", async () => {
    const { runtime, commands } = createInstallRuntime();
    await finalizeProject(makeOptions(), runtime);
    expect(commands).toHaveLength(0);
  });
});
