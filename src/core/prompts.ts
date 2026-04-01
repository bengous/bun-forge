import type { FrontendPreset, InitOptions } from "../types.ts";
import { confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import { basename, resolve } from "node:path";
import { toBinName, toKebabCase, toPackageName } from "./naming.ts";

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
  flags: Partial<InitOptions>,
): Promise<InitOptions> {
  return collectOptionsWithRuntime(destinationArg, flags);
}

export async function collectOptionsWithRuntime(
  destinationArg: string | undefined,
  flags: Partial<InitOptions>,
  runtime: PromptRuntime = defaultPromptRuntime,
): Promise<InitOptions> {
  runtime.intro("bun-forge");

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
  const normalizedProjectName = normalizeProjectNameInput(projectName);

  const destination = runtime.resolvePath(
    flags.destination ?? destinationArg ?? normalizedProjectName,
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

  const ai =
    flags.ai ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Install Claude/AGENTS tooling?",
        initialValue: true,
      }),
    );

  const install =
    flags.install ??
    assertNotCancelled(
      runtime,
      await runtime.confirm({
        message: "Run bun install, prepare, and mise install when available?",
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
    packageName: flags.packageName ?? toPackageName(normalizedProjectName),
    binName: flags.binName ?? toBinName(normalizedProjectName),
    frontend,
    ai,
    install,
    gitInit,
    yes: flags.yes ?? false,
  };
}

export function normalizeFlagOptions(
  destinationArg: string | undefined,
  flags: Partial<InitOptions>,
): InitOptions {
  const rawName =
    (flags.projectName !== undefined ? normalizeProjectNameInput(flags.projectName) : undefined) ??
    defaultProjectName(flags.destination ?? destinationArg);
  const projectName = toKebabCase(rawName);

  if (projectName.length === 0) {
    throw new Error("Project name must not be empty");
  }

  return {
    destination: resolve(flags.destination ?? destinationArg ?? projectName),
    projectName,
    packageName: flags.packageName ?? toPackageName(projectName),
    binName: flags.binName ?? toBinName(projectName),
    frontend: flags.frontend ?? "none",
    ai: flags.ai ?? true,
    install: flags.install ?? true,
    gitInit: flags.gitInit ?? true,
    yes: flags.yes ?? false,
  };
}
