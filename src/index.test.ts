import type { CliRuntime } from "./index.ts";
import type { InitOptions } from "./types.ts";
import { describe, expect, test } from "bun:test";
import { toBackupRunId, toSafeRelativePath } from "./core/adopt.ts";
import { toExistingBinName, toExistingPackageName, toProjectName } from "./core/naming.ts";
import {
  buildProgram,
  CLI_VERSION,
  formatCliError,
  parseBoolean,
  parseFrontendPreset,
  parseLintSeverity,
  runCli,
} from "./index.ts";

function createRuntime(overrides: Partial<CliRuntime> = {}): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const runtime: CliRuntime = {
    collectOptions: async () => {
      throw new Error("collectOptions should not be called");
    },
    collectAdoptOptions: async () => {
      throw new Error("collectAdoptOptions should not be called");
    },
    normalizeFlagOptions: () => {
      throw new Error("normalizeFlagOptions should not be called");
    },
    generateProject: async () => {},
    deriveAdoptOptions: async () => {
      throw new Error("deriveAdoptOptions should not be called");
    },
    adoptProject: async () => {
      throw new Error("adoptProject should not be called");
    },
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
    projectName: toProjectName("forge-cli"),
    packageName: toExistingPackageName("forge-cli"),
    binName: toExistingBinName("forge-cli"),
    backend: true,
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

describe("parseLintSeverity", () => {
  test("accepts known severities", () => {
    expect(parseLintSeverity("warn")).toBe("warn");
    expect(parseLintSeverity("error")).toBe("error");
  });

  test("rejects unsupported values", () => {
    expect(() => parseLintSeverity("off")).toThrow("Expected lint severity warn|error");
  });
});

describe("buildProgram", () => {
  test("registers the expected CLI flags", () => {
    const optionNames = buildProgram().options.map((option) => option.long);
    expect(optionNames).toEqual([
      "--version",
      "--name",
      "--backend",
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
    expect(help).toContain("adopt");
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

  test("maps invalid lint severity to a clean message", () => {
    expect(formatCliError(new Error("Expected lint severity warn|error, got off"))).toBe(
      'Invalid lint severity: expected warn or error, got "off".',
    );
  });

  test("maps invalid project shapes to a clean message", () => {
    expect(formatCliError(new Error("Backend cannot be disabled without a frontend preset"))).toBe(
      "Invalid project shape: --backend false requires --frontend tanstack.",
    );
    expect(formatCliError(new Error("Effect starter requires the backend preset"))).toBe(
      "Invalid project shape: --effect true requires --backend true.",
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
    const exitCode = await runCli(["bun", "kitsmith", "--version"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain(CLI_VERSION);
    expect(stderr.join("")).toBe("");
  });

  test("prints a clean message for invalid boolean values", async () => {
    const { runtime, stderr } = createRuntime();
    const exitCode = await runCli(["bun", "kitsmith", "--ai", "maybe"], runtime);

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

    const exitCode = await runCli(["bun", "kitsmith", "--yes", "/tmp/existing"], runtime);

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

    const exitCode = await runCli(["bun", "kitsmith"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("error: Scaffolding cancelled.");
  });

  test("prints an adoption dry-run plan", async () => {
    const { runtime, stdout } = createRuntime({
      deriveAdoptOptions: async () => ({
        destination: "/tmp/vex-copy",
        projectName: toProjectName("vex"),
        packageName: toExistingPackageName("vex"),
        binName: toExistingBinName("vex"),
        frontend: "none",
        ai: true,
        effect: true,
        install: false,
        lintSeverity: "warn",
        apply: false,
        rollback: undefined,
        yes: true,
      }),
      adoptProject: async () => ({
        destination: "/tmp/vex-copy",
        runId: toBackupRunId("2026-04-24T00-00-00-000Z"),
        actions: [
          {
            kind: "modify",
            path: toSafeRelativePath("package.json"),
            reason: "Merge Kitsmith scripts and dependencies without overwriting existing entries",
            content: "{}",
          },
        ],
      }),
    });

    const exitCode = await runCli(["bun", "kitsmith", "adopt", "/tmp/vex-copy", "--yes"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Adoption plan for /tmp/vex-copy");
    expect(stdout.join("")).toContain("Dry run only");
  });

  test("parses adoption apply and install flags", async () => {
    let observedApply = false;
    let observedInstall = false;
    let observedLintSeverity = "";
    const { runtime } = createRuntime({
      deriveAdoptOptions: async (_destination, partial) => {
        observedApply = partial.apply ?? false;
        observedInstall = partial.install ?? false;
        observedLintSeverity = partial.lintSeverity ?? "";
        return {
          destination: "/tmp/vex-copy",
          projectName: toProjectName("vex"),
          packageName: toExistingPackageName("vex"),
          binName: toExistingBinName("vex"),
          frontend: "none",
          ai: true,
          effect: true,
          install: partial.install ?? false,
          lintSeverity: partial.lintSeverity ?? "warn",
          apply: partial.apply ?? false,
          rollback: undefined,
          yes: true,
        };
      },
      adoptProject: async (options) => ({
        destination: options.destination,
        runId: toBackupRunId("2026-04-24T00-00-00-000Z"),
        actions: [],
      }),
    });

    const exitCode = await runCli(
      [
        "bun",
        "kitsmith",
        "adopt",
        "/tmp/vex-copy",
        "--yes",
        "--apply",
        "--install",
        "true",
        "--lint-severity",
        "error",
      ],
      runtime,
    );

    expect(exitCode).toBe(0);
    expect(observedApply).toBe(true);
    expect(observedInstall).toBe(true);
    expect(observedLintSeverity).toBe("error");
  });

  test("uses interactive adoption option collection without --yes", async () => {
    let usedCollectAdoptOptions = false;
    const { runtime } = createRuntime({
      collectAdoptOptions: async (_destination, partial) => {
        usedCollectAdoptOptions = true;
        return {
          destination: "/tmp/vex-copy",
          projectName: toProjectName("vex"),
          packageName: toExistingPackageName("vex"),
          binName: toExistingBinName("vex"),
          frontend: "none",
          ai: true,
          effect: true,
          install: partial.install ?? false,
          lintSeverity: partial.lintSeverity ?? "warn",
          apply: partial.apply ?? false,
          rollback: undefined,
          yes: false,
        };
      },
      adoptProject: async (options) => ({
        destination: options.destination,
        runId: toBackupRunId("2026-04-24T00-00-00-000Z"),
        actions: [],
      }),
    });

    const exitCode = await runCli(["bun", "kitsmith", "adopt", "/tmp/vex-copy"], runtime);

    expect(exitCode).toBe(0);
    expect(usedCollectAdoptOptions).toBe(true);
  });
});
