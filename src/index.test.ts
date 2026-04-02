import type { CliRuntime } from "./index.ts";
import type { InitOptions } from "./types.ts";
import { describe, expect, test } from "bun:test";
import {
  buildProgram,
  CLI_VERSION,
  formatCliError,
  parseBoolean,
  parseFrontendPreset,
  runCli,
} from "./index.ts";

function createRuntime(overrides: Partial<CliRuntime> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const runtime: CliRuntime = {
    collectOptions: async () => {
      throw new Error("collectOptions should not be called");
    },
    normalizeFlagOptions: () => {
      throw new Error("normalizeFlagOptions should not be called");
    },
    generateProject: async () => {},
    stdout: {
      write(chunk: string) {
        stdout.push(chunk);
      },
    },
    stderr: {
      write(chunk: string) {
        stderr.push(chunk);
      },
    },
    ...overrides,
  };

  return {
    runtime,
    stdout,
    stderr,
  };
}

function makeOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    destination: "/tmp/forge-cli",
    projectName: "forge-cli",
    packageName: "forge-cli",
    binName: "forge-cli",
    frontend: "none",
    ai: true,
    effect: false,
    install: true,
    gitInit: true,
    yes: true,
    ...overrides,
  };
}

describe("parseBoolean", () => {
  test("accepts true and false", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
  });

  test("rejects unsupported values", () => {
    expect(() => parseBoolean("yes")).toThrow("Expected true or false");
  });
});

describe("parseFrontendPreset", () => {
  test("accepts known presets", () => {
    expect(parseFrontendPreset("none")).toBe("none");
    expect(parseFrontendPreset("tanstack")).toBe("tanstack");
  });

  test("rejects unsupported values", () => {
    expect(() => parseFrontendPreset("react")).toThrow("Expected frontend preset none|tanstack");
  });
});

describe("buildProgram", () => {
  test("registers the expected CLI flags", () => {
    const optionNames = buildProgram().options.map((option) => option.long);
    expect(optionNames).toEqual([
      "--version",
      "--name",
      "--frontend",
      "--ai",
      "--effect",
      "--install",
      "--git-init",
      "--yes",
    ]);
  });

  test("registers the CLI version", () => {
    expect(buildProgram().version()).toBe(CLI_VERSION);
  });

  test("includes descriptive help text", () => {
    const help = buildProgram().helpInformation();
    expect(help).toContain("-V, --version");
    expect(help).toContain("--name <projectName>");
    expect(help).toContain("--yes");
    expect(help).toContain("destination");
    expect(help).toContain("basename");
  });
});

describe("formatCliError", () => {
  test("maps cancelled prompts to a clean message", () => {
    expect(formatCliError(new Error("Cancelled"))).toBe("Scaffolding cancelled.");
  });

  test("maps invalid boolean values to a clean message", () => {
    expect(formatCliError(new Error("Expected true or false, got maybe"))).toBe(
      'Invalid boolean flag value: expected true or false, got "maybe".',
    );
  });

  test("maps invalid frontend presets to a clean message", () => {
    expect(formatCliError(new Error("Expected frontend preset none|tanstack, got react"))).toBe(
      'Invalid frontend preset: expected none or tanstack, got "react".',
    );
  });

  test("maps non-empty destinations to a clean message", () => {
    expect(formatCliError(new Error("Destination is not empty: /tmp/existing"))).toBe(
      "Refusing to scaffold into a non-empty directory: /tmp/existing",
    );
  });
});

describe("runCli", () => {
  test("prints version and exits cleanly", async () => {
    const { runtime, stdout, stderr } = createRuntime();
    const exitCode = await runCli(["bun", "bun-forge", "--version"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain(CLI_VERSION);
    expect(stderr.join("")).toBe("");
  });

  test("prints a clean message for invalid boolean values", async () => {
    const { runtime, stderr } = createRuntime();
    const exitCode = await runCli(["bun", "bun-forge", "--ai", "maybe"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain(
      'error: Invalid boolean flag value: expected true or false, got "maybe".',
    );
    expect(stderr.join("")).not.toContain("at parseBoolean");
  });

  test("prints a clean message when generation hits a non-empty destination", async () => {
    const { runtime, stderr } = createRuntime({
      normalizeFlagOptions: () => makeOptions(),
      generateProject: async () => {
        throw new Error("Destination is not empty: /tmp/existing");
      },
    });

    const exitCode = await runCli(["bun", "bun-forge", "--yes", "/tmp/existing"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain(
      "error: Refusing to scaffold into a non-empty directory: /tmp/existing",
    );
    expect(stderr.join("")).not.toContain("Error:");
  });

  test("prints a clean cancellation message", async () => {
    const { runtime, stderr } = createRuntime({
      collectOptions: async () => {
        throw new Error("Cancelled");
      },
    });

    const exitCode = await runCli(["bun", "bun-forge"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("error: Scaffolding cancelled.");
  });
});
