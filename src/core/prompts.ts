import type {
  AdoptOptions,
  AdoptOptionsInput,
  FrontendPreset,
  InitOptions,
  InitOptionsInput,
  LintSeverity,
} from "../types.ts";
import { confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import { basename, resolve } from "node:path";
import { deriveAdoptOptions } from "./adopt.ts";
import { toBinName, toKebabCase, toPackageName, toProjectName } from "./naming.ts";

export type PromptRuntime = {
  readonly intro: (message: string) => void;
  readonly outro: (message: string) => void;
  readonly text: (options: {
    readonly message: string;
    readonly placeholder?: string;
    readonly defaultValue?: string;
  }) => Promise<string | symbol>;
  readonly select: (options: {
    readonly message: string;
    readonly initialValue?: string;
    readonly options: Array<{ readonly label: string; readonly value: string }>;
  }) => Promise<string | symbol>;
  readonly confirm: (options: {
    readonly message: string;
    readonly initialValue?: boolean;
  }) => Promise<boolean | symbol>;
  readonly isCancel: typeof isCancel;
  readonly resolvePath: typeof resolve;
};

export const defaultPromptRuntime: PromptRuntime = {
  intro,
  outro,
  text,
  select,
  confirm,
  isCancel,
  resolvePath: resolve,
};

function assertNotCancelled<T>(runtime: PromptRuntime, value: T | symbol): T {
  if (runtime.isCancel(value)) {
    throw new Error("Cancelled");
  }
  return value;
}

function isFrontendPreset(value: string): value is FrontendPreset {
  return value === "none" || value === "tanstack";
}

function isLintSeverity(value: string): value is LintSeverity {
  return value === "warn" || value === "error";
}

function normalizeProjectNameInput(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Project name must not be empty");
  }
  return normalized;
}

function defaultProjectName(destinationArg: string | undefined): string {
  if (destinationArg === undefined) {
    return "my-app";
  }

  const resolvedBasename = basename(destinationArg);
  return resolvedBasename.length > 0 ? resolvedBasename : destinationArg;
}

export async function collectOptions(
  destinationArg: string | undefined,
  flags: InitOptionsInput,
): Promise<InitOptions> {
  return collectOptionsWithRuntime(destinationArg, flags);
}

export async function collectOptionsWithRuntime(
  destinationArg: string | undefined,
  flags: InitOptionsInput,
  runtime: PromptRuntime = defaultPromptRuntime,
): Promise<InitOptions> {
  runtime.intro("kitsmith");

  const defaultName = defaultProjectName(flags.destination ?? destinationArg);

  const projectName =
    (flags.projectName !== undefined ? normalizeProjectNameInput(flags.projectName) : undefined) ??
    assertNotCancelled(
      runtime,
      await runtime.text({
        message: "Project name",
        placeholder: defaultName,
        defaultValue: defaultName,
      }),
    );
  const normalizedProjectName = toProjectName(normalizeProjectNameInput(projectName));

  const destination = runtime.resolvePath(
    flags.destination ?? destinationArg ?? normalizedProjectName,
  );

  const backend =
    flags.backend ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Generate a Bun backend starter?",
        initialValue: true,
      }),
    );

  let frontend = flags.frontend;
  if (frontend === undefined) {
    const selectedFrontend = assertNotCancelled(
      runtime,
      await runtime.select({
        message: "Frontend preset",
        initialValue: "none",
        options: [
          { label: "None", value: "none" },
          { label: "TanStack frontend", value: "tanstack" },
        ],
      }),
    );
    frontend = isFrontendPreset(selectedFrontend) ? selectedFrontend : "none";
  }

  if (!backend && frontend === "none") {
    throw new Error("Backend cannot be disabled without a frontend preset");
  }

  const ai =
    flags.ai ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Install Claude/AGENTS tooling?",
        initialValue: true,
      }),
    );

  const effect =
    flags.effect ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Install Effect runtime and tooling?",
        initialValue: false,
      }),
    );

  if (!backend && effect) {
    throw new Error("Effect starter requires the backend preset");
  }

  const install =
    flags.install ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Run bun install, setup, and mise install when available?",
        initialValue: true,
      }),
    );

  const gitInit =
    flags.gitInit ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Initialize a git repository?",
        initialValue: true,
      }),
    );

  runtime.outro(`Scaffolding ${destination}`);

  return {
    destination,
    projectName: normalizedProjectName,
    packageName:
      flags.packageName !== undefined
        ? toPackageName(flags.packageName)
        : toPackageName(normalizedProjectName),
    binName:
      flags.binName !== undefined ? toBinName(flags.binName) : toBinName(normalizedProjectName),
    backend,
    frontend,
    ai,
    effect,
    install,
    gitInit,
    yes: flags.yes ?? false,
  };
}

export function normalizeFlagOptions(
  destinationArg: string | undefined,
  flags: InitOptionsInput,
): InitOptions {
  const rawName =
    (flags.projectName !== undefined ? normalizeProjectNameInput(flags.projectName) : undefined) ??
    defaultProjectName(flags.destination ?? destinationArg);
  const projectName = toProjectName(toKebabCase(rawName));

  if (projectName.length === 0) {
    throw new Error("Project name must not be empty");
  }

  const backend = flags.backend ?? true;
  const frontend = flags.frontend ?? "none";
  if (!backend && frontend === "none") {
    throw new Error("Backend cannot be disabled without a frontend preset");
  }
  const effect = flags.effect ?? false;
  if (!backend && effect) {
    throw new Error("Effect starter requires the backend preset");
  }

  return {
    destination: resolve(flags.destination ?? destinationArg ?? projectName),
    projectName,
    packageName:
      flags.packageName !== undefined
        ? toPackageName(flags.packageName)
        : toPackageName(projectName),
    binName: flags.binName !== undefined ? toBinName(flags.binName) : toBinName(projectName),
    backend,
    frontend,
    ai: flags.ai ?? true,
    effect,
    install: flags.install ?? true,
    gitInit: flags.gitInit ?? true,
    yes: flags.yes ?? false,
  };
}

export async function collectAdoptOptions(
  destinationArg: string | undefined,
  flags: AdoptOptionsInput,
): Promise<AdoptOptions> {
  return collectAdoptOptionsWithRuntime(destinationArg, flags);
}

export async function collectAdoptOptionsWithRuntime(
  destinationArg: string | undefined,
  flags: AdoptOptionsInput,
  runtime: PromptRuntime = defaultPromptRuntime,
): Promise<AdoptOptions> {
  runtime.intro("kitsmith adopt");

  let lintSeverity = flags.lintSeverity;
  if (lintSeverity === undefined) {
    const selectedSeverity = assertNotCancelled(
      runtime,
      await runtime.select({
        message: "Adopt OXLint rules as",
        initialValue: "warn",
        options: [
          { label: "Warnings", value: "warn" },
          { label: "Errors", value: "error" },
        ],
      }),
    );
    lintSeverity = isLintSeverity(selectedSeverity) ? selectedSeverity : "warn";
  }

  const options = await deriveAdoptOptions(destinationArg, {
    ...flags,
    lintSeverity,
  });
  runtime.outro(`Planning adoption for ${options.destination}`);

  return options;
}
