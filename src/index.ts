#!/usr/bin/env bun

import type { AdoptOptionsInput, FrontendPreset, InitOptionsInput, LintSeverity } from "./types.ts";
import { Command, CommanderError } from "commander";
import { readFileSync } from "node:fs";
import { adoptProject, deriveAdoptOptions, formatAdoptionPlan } from "./core/adopt.ts";
import { generateProject } from "./core/generator.ts";
import { isJsonObject } from "./core/json.ts";
import { collectAdoptOptions, collectOptions, normalizeFlagOptions } from "./core/prompts.ts";

type Writer = {
  readonly write: (chunk: string) => void;
};

export type CliRuntime = {
  readonly collectOptions: typeof collectOptions;
  readonly collectAdoptOptions: typeof collectAdoptOptions;
  readonly normalizeFlagOptions: typeof normalizeFlagOptions;
  readonly generateProject: typeof generateProject;
  readonly deriveAdoptOptions: typeof deriveAdoptOptions;
  readonly adoptProject: typeof adoptProject;
  readonly stdout: Writer;
  readonly stderr: Writer;
};

function readCliVersion(): string {
  const parsed = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as unknown;
  const version = isJsonObject(parsed) ? parsed["version"] : undefined;
  if (typeof version === "string") {
    return version;
  }

  return "0.0.0";
}

export const CLI_VERSION = readCliVersion();

export const defaultCliRuntime: CliRuntime = {
  collectOptions,
  collectAdoptOptions,
  normalizeFlagOptions,
  generateProject,
  deriveAdoptOptions,
  adoptProject,
  stdout: process.stdout,
  stderr: process.stderr,
};

function writeLine(writer: Writer, message: string): void {
  writer.write(`${message}\n`);
}

export function parseBoolean(value: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Expected true or false, got ${value}`);
}

export function parseFrontendPreset(value: string): FrontendPreset {
  if (value === "none" || value === "tanstack") {
    return value;
  }
  throw new Error(`Expected frontend preset none|tanstack, got ${value}`);
}

export function parseLintSeverity(value: string): LintSeverity {
  if (value === "warn" || value === "error") {
    return value;
  }
  throw new Error(`Expected lint severity warn|error, got ${value}`);
}

export function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Cancelled") {
      return "Scaffolding cancelled.";
    }

    if (error.message.startsWith("Expected true or false, got ")) {
      const value = error.message.slice("Expected true or false, got ".length);
      return `Invalid boolean flag value: expected true or false, got "${value}".`;
    }

    if (error.message.startsWith("Expected frontend preset none|tanstack, got ")) {
      const value = error.message.slice("Expected frontend preset none|tanstack, got ".length);
      return `Invalid frontend preset: expected none or tanstack, got "${value}".`;
    }

    if (error.message.startsWith("Expected lint severity warn|error, got ")) {
      const value = error.message.slice("Expected lint severity warn|error, got ".length);
      return `Invalid lint severity: expected warn or error, got "${value}".`;
    }

    if (error.message === "Backend cannot be disabled without a frontend preset") {
      return "Invalid project shape: --backend false requires --frontend tanstack.";
    }

    if (error.message === "Effect starter requires the backend preset") {
      return "Invalid project shape: --effect true requires --backend true.";
    }

    if (error.message.startsWith("Destination is not empty: ")) {
      const destination = error.message.slice("Destination is not empty: ".length);
      return `Refusing to scaffold into a non-empty directory: ${destination}`;
    }

    if (error.message.startsWith("Refusing to overwrite existing sensitive file: ")) {
      const file = error.message.slice("Refusing to overwrite existing sensitive file: ".length);
      return `Refusing to overwrite existing sensitive file: ${file}`;
    }

    return error.message;
  }

  return String(error);
}

export function buildProgram(runtime: CliRuntime = defaultCliRuntime): Command {
  const program = new Command()
    .name("kitsmith")
    .version(CLI_VERSION)
    .description("Scaffold an opinionated Bun-first TypeScript project")
    .showHelpAfterError()
    .configureOutput({
      writeOut: (message) => runtime.stdout.write(message),
      writeErr: (message) => runtime.stderr.write(message),
      outputError: (message, write) => write(message),
    })
    .argument("[destination]")
    .option("--name <projectName>", "override the generated project name")
    .option("--backend <enabled>", "generate a Bun backend starter: true | false")
    .option("--frontend <preset>", "frontend preset: none | tanstack")
    .option("--ai <enabled>", "install Claude/AGENTS tooling: true | false")
    .option("--effect <enabled>", "install Effect runtime and tooling: true | false")
    .option("--install <enabled>", "run bun install and prepare steps: true | false")
    .option("--git-init <enabled>", "initialize a git repository: true | false")
    .option("--yes", "skip prompts and use defaults from the destination basename")
    .action(
      async (
        destination: string | undefined,
        flags: Record<string, string | boolean | undefined>,
      ) => {
        const partial: InitOptionsInput = {
          yes: flags["yes"] === true,
          ...(destination !== undefined ? { destination } : {}),
          ...(typeof flags["name"] === "string" ? { projectName: flags["name"] } : {}),
          ...(typeof flags["backend"] === "string"
            ? { backend: parseBoolean(flags["backend"]) }
            : {}),
          ...(typeof flags["frontend"] === "string"
            ? { frontend: parseFrontendPreset(flags["frontend"]) }
            : {}),
          ...(typeof flags["ai"] === "string" ? { ai: parseBoolean(flags["ai"]) } : {}),
          ...(typeof flags["effect"] === "string" ? { effect: parseBoolean(flags["effect"]) } : {}),
          ...(typeof flags["install"] === "string"
            ? { install: parseBoolean(flags["install"]) }
            : {}),
          ...(typeof flags["gitInit"] === "string"
            ? { gitInit: parseBoolean(flags["gitInit"]) }
            : {}),
        };

        const options =
          partial.yes === true
            ? runtime.normalizeFlagOptions(destination, partial)
            : await runtime.collectOptions(destination, partial);

        await runtime.generateProject(options);
        writeLine(runtime.stdout, `Project created at ${options.destination}`);
      },
    );

  program
    .command("adopt [destination]")
    .description("Adopt Kitsmith tooling in an existing Bun/TypeScript project")
    .option("--name <projectName>", "override the adopted project name")
    .option("--frontend <preset>", "frontend preset: none | tanstack")
    .option("--ai <enabled>", "install Claude/AGENTS tooling: true | false")
    .option("--effect <enabled>", "install Effect runtime and tooling: true | false")
    .option("--install <enabled>", "run bun install and prepare steps after apply: true | false")
    .option("--lint-severity <severity>", "adopted OXLint rule severity: warn | error")
    .option("--apply", "apply the adoption plan")
    .option("--rollback <runId>", "rollback a previous adoption run")
    .option("--yes", "skip prompts and use defaults from the destination package")
    .action(
      async (
        destination: string | undefined,
        _flags: Record<string, string | boolean | undefined>,
        command: Command,
      ) => {
        const flags = command.optsWithGlobals<Record<string, string | boolean | undefined>>();
        const partial: AdoptOptionsInput = {
          yes: flags["yes"] === true,
          apply: flags["apply"] === true,
          ...(destination !== undefined ? { destination } : {}),
          ...(typeof flags["name"] === "string" ? { projectName: flags["name"] } : {}),
          ...(typeof flags["frontend"] === "string"
            ? { frontend: parseFrontendPreset(flags["frontend"]) }
            : {}),
          ...(typeof flags["ai"] === "string" ? { ai: parseBoolean(flags["ai"]) } : {}),
          ...(typeof flags["effect"] === "string" ? { effect: parseBoolean(flags["effect"]) } : {}),
          ...(typeof flags["install"] === "string"
            ? { install: parseBoolean(flags["install"]) }
            : {}),
          ...(typeof flags["lintSeverity"] === "string"
            ? { lintSeverity: parseLintSeverity(flags["lintSeverity"]) }
            : {}),
          ...(typeof flags["rollback"] === "string" ? { rollback: flags["rollback"] } : {}),
        };

        const options =
          partial.yes === true
            ? await runtime.deriveAdoptOptions(destination, partial)
            : await runtime.collectAdoptOptions(destination, partial);
        const plan = await runtime.adoptProject(options);
        if (options.rollback !== undefined) {
          writeLine(runtime.stdout, `Rolled back Kitsmith adoption run ${options.rollback}`);
          return;
        }
        runtime.stdout.write(formatAdoptionPlan(plan));
        writeLine(
          runtime.stdout,
          options.apply
            ? `Applied Kitsmith adoption at ${options.destination}`
            : "Dry run only. Re-run with --apply to write changes.",
        );
      },
    );

  return program;
}

export async function runCli(
  argv: readonly string[],
  runtime: CliRuntime = defaultCliRuntime,
): Promise<number> {
  try {
    await buildProgram(runtime).exitOverride().parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return error.exitCode;
      }

      if (error.code.startsWith("commander.")) {
        return error.exitCode;
      }
    }

    writeLine(runtime.stderr, `error: ${formatCliError(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv);
}
