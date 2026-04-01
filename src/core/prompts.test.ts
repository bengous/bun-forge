import type { FrontendPreset, InitOptions } from "../types.ts";
import type { PromptRuntime } from "./prompts.ts";
import { describe, expect, test } from "bun:test";
import {
  collectOptionsWithRuntime,
  defaultPromptRuntime,
  normalizeFlagOptions,
} from "./prompts.ts";

const cancelled = Symbol("cancelled");

function createPromptRuntime(
  responses: {
    readonly texts?: Array<string | symbol>;
    readonly selects?: Array<FrontendPreset | symbol>;
    readonly confirms?: Array<boolean | symbol>;
  },
  resolvedPrefix = "/tmp",
): PromptRuntime {
  const textQueue = [...(responses.texts ?? [])];
  const selectQueue = [...(responses.selects ?? [])];
  const confirmQueue = [...(responses.confirms ?? [])];

  function nextResponse<T>(queue: T[], kind: string): T {
    const response = queue.shift();
    if (response === undefined) {
      throw new Error(`Missing queued ${kind} prompt response`);
    }
    return response;
  }

  return {
    ...defaultPromptRuntime,
    intro() {},
    outro() {},
    text: async () => nextResponse(textQueue, "text"),
    select: async () => nextResponse(selectQueue, "select"),
    confirm: async () => nextResponse(confirmQueue, "confirm"),
    isCancel: (value: unknown) => value === cancelled,
    resolvePath: (value: string) => (value.startsWith("/") ? value : `${resolvedPrefix}/${value}`),
  };
}

describe("normalizeFlagOptions", () => {
  test("derives defaults from destination and project name", () => {
    const normalized = normalizeFlagOptions("My App", {});
    expect(normalized).toMatchObject({
      projectName: "my-app",
      packageName: "my-app",
      binName: "my-app",
      frontend: "none",
      ai: true,
      install: true,
      gitInit: true,
      yes: false,
    } satisfies Omit<InitOptions, "destination">);
    expect(normalized.destination.endsWith("/My App")).toBe(true);
  });

  test("respects explicit flags", () => {
    const normalized = normalizeFlagOptions("ignored", {
      destination: "/work/custom",
      projectName: "Chosen Name",
      packageName: "pkg-name",
      binName: "custom-bin",
      frontend: "tanstack",
      ai: false,
      install: false,
      gitInit: false,
      yes: true,
    });

    expect(normalized).toEqual({
      destination: "/work/custom",
      projectName: "chosen-name",
      packageName: "pkg-name",
      binName: "custom-bin",
      frontend: "tanstack",
      ai: false,
      install: false,
      gitInit: false,
      yes: true,
    } satisfies InitOptions);
  });

  test("derives the default name from the destination basename", () => {
    const normalized = normalizeFlagOptions("/tmp/nested/Fancy Project", {});
    expect(normalized.projectName).toBe("fancy-project");
    expect(normalized.packageName).toBe("fancy-project");
    expect(normalized.binName).toBe("fancy-project");
  });

  test("rejects an explicit empty project name", () => {
    expect(() =>
      normalizeFlagOptions("/tmp/forge", {
        projectName: "   ",
      }),
    ).toThrow("Project name must not be empty");
  });
});

describe("collectOptionsWithRuntime", () => {
  test("collects answers from prompts and resolves the destination", async () => {
    const options = await collectOptionsWithRuntime(
      undefined,
      {},
      createPromptRuntime(
        {
          texts: ["Forge App"],
          selects: ["tanstack"],
          confirms: [true, false, true],
        },
        "/workspace",
      ),
    );

    expect(options).toEqual({
      destination: "/workspace/Forge App",
      projectName: "Forge App",
      packageName: "forge-app",
      binName: "forge-app",
      frontend: "tanstack",
      ai: true,
      install: false,
      gitInit: true,
      yes: false,
    } satisfies InitOptions);
  });

  test("uses flag values instead of prompting when already provided", async () => {
    const options = await collectOptionsWithRuntime(
      "starter",
      {
        projectName: "starter",
        destination: "/repo/starter",
        frontend: "none",
        ai: false,
        install: false,
        gitInit: false,
      },
      createPromptRuntime({}, "/ignored"),
    );

    expect(options).toEqual({
      destination: "/repo/starter",
      projectName: "starter",
      packageName: "starter",
      binName: "starter",
      frontend: "none",
      ai: false,
      install: false,
      gitInit: false,
      yes: false,
    } satisfies InitOptions);
  });

  test("throws when a prompt is cancelled", async () => {
    try {
      await collectOptionsWithRuntime(undefined, {}, createPromptRuntime({ texts: [cancelled] }));
      throw new Error("Expected prompt collection to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toContain("Cancelled");
    }
  });

  test("uses the destination basename as the interactive default name", async () => {
    const options = await collectOptionsWithRuntime(
      "/tmp/absolute/Forge App",
      {},
      createPromptRuntime({
        texts: ["Forge App"],
        selects: ["none"],
        confirms: [true, true, true],
      }),
    );

    expect(options.projectName).toBe("Forge App");
    expect(options.packageName).toBe("forge-app");
    expect(options.destination).toBe("/tmp/absolute/Forge App");
  });

  test("rejects an empty interactive project name", async () => {
    try {
      await collectOptionsWithRuntime(
        "/tmp/forge",
        {},
        createPromptRuntime({
          texts: ["   "],
          selects: ["none"],
          confirms: [true, true, true],
        }),
      );
      throw new Error("Expected empty project name to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toContain("Project name must not be empty");
    }
  });
});
