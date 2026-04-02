import type { TemplateContext } from "../types.ts";
import { describe, expect, test } from "bun:test";
import { renderTemplate, templateValues } from "./template.ts";

const backendContext: TemplateContext = {
  projectName: "forge-backend",
  packageName: "forge-backend",
  binName: "forge-backend",
  frontend: "none",
  ai: false,
  effect: false,
  hasWorkspaces: false,
};

const frontendAiContext: TemplateContext = {
  projectName: "forge-frontend",
  packageName: "forge-frontend",
  binName: "forge-frontend",
  frontend: "tanstack",
  ai: true,
  effect: false,
  hasWorkspaces: true,
};

const effectContext: TemplateContext = {
  projectName: "forge-effect",
  packageName: "forge-effect",
  binName: "forge-effect",
  frontend: "none",
  ai: false,
  effect: true,
  hasWorkspaces: false,
};

describe("templateValues", () => {
  test("omits optional script blocks when features are disabled", () => {
    const values = templateValues(backendContext);
    expect(values["WORKSPACES_BLOCK"]).toBe("");
    expect(values["AI_SCRIPTS"]).toBe("");
    expect(values["EFFECT_SCRIPTS"]).toBe("");
    expect(values["EFFECT_DEPENDENCIES_BLOCK"]).toBe("");
    expect(values["EFFECT_DEV_DEPENDENCIES"]).toBe("");
    expect(values["EFFECT_TSCONFIG_PLUGINS"]).toBe("");
    expect(values["FRONTEND_SCRIPTS"]).toBe("");
  });

  test("includes optional script blocks when features are enabled", () => {
    const values = templateValues(frontendAiContext);
    expect(values["WORKSPACES_BLOCK"]).toContain('"workspaces": ["apps/*"]');
    expect(values["AI_SCRIPTS"]).toContain('"agents:check"');
    expect(values["FRONTEND_SCRIPTS"]).toContain('"validate:frontend"');
  });

  test("includes Effect tokens when effect is enabled", () => {
    const values = templateValues(effectContext);
    expect(values["EFFECT_SCRIPTS"]).toContain('"effect:diagnose"');
    expect(values["EFFECT_SCRIPTS"]).toContain('"effect:quickfixes"');
    expect(values["EFFECT_DEPENDENCIES_BLOCK"]).toContain('"effect"');
    expect(values["EFFECT_DEPENDENCIES_BLOCK"]).toContain('"@effect/cli"');
    expect(values["EFFECT_DEPENDENCIES_BLOCK"]).toContain('"@effect/platform"');
    expect(values["EFFECT_DEPENDENCIES_BLOCK"]).toContain('"@effect/platform-bun"');
    expect(values["EFFECT_DEV_DEPENDENCIES"]).toContain('"@effect/language-service"');
    expect(values["EFFECT_TSCONFIG_PLUGINS"]).toContain("@effect/language-service");
    expect(values["EFFECT_TSCONFIG_PLUGINS"]).toContain("diagnosticSeverity");
  });
});

describe("renderTemplate", () => {
  test("renders package.json without unresolved tokens", () => {
    const rendered = renderTemplate("package.json.tpl", frontendAiContext);
    expect(rendered).toContain('"name": "forge-frontend"');
    expect(rendered).toContain('"agents:sync"');
    expect(rendered).toContain('"validate:frontend"');
    expect(rendered).not.toContain("__");
  });

  test("renders frontend route content with the project title", () => {
    const rendered = renderTemplate("apps/frontend/src/routes/index.tsx.tpl", frontendAiContext);
    expect(rendered).toContain("<h1>forge-frontend</h1>");
    expect(rendered).toContain("normalized by bun-forge");
  });

  test("renders lefthook without frontend commands for backend-only projects", () => {
    const rendered = renderTemplate("lefthook.yml.tpl", backendContext);
    expect(rendered).toContain("glob_matcher: doublestar");
    expect(rendered).toContain("root-oxc:");
    expect(rendered).toContain("typecheck:");
    expect(rendered).not.toContain("frontend-oxc:");
    expect(rendered).not.toContain("apps/frontend/**/*.{ts,tsx}");
  });

  test("renders lefthook with frontend commands when TanStack is enabled", () => {
    const rendered = renderTemplate("lefthook.yml.tpl", frontendAiContext);
    expect(rendered).toContain("frontend-oxc:");
    expect(rendered).toContain("apps/frontend/**/*.{ts,tsx}");
  });

  test("renders package.json with Effect dependencies when enabled", () => {
    const rendered = renderTemplate("package.json.tpl", effectContext);
    expect(rendered).toContain('"effect"');
    expect(rendered).toContain('"@effect/language-service"');
    expect(rendered).toContain('"effect:diagnose"');
    expect(rendered).not.toContain("__");
  });

  test("renders tsconfig.json with Effect plugin when enabled", () => {
    const rendered = renderTemplate("tsconfig.json.tpl", effectContext);
    expect(rendered).toContain("@effect/language-service");
    expect(rendered).toContain("diagnosticSeverity");
    expect(rendered).not.toContain("__");
  });

  test("renders tsconfig.json without plugin when effect is disabled", () => {
    const rendered = renderTemplate("tsconfig.json.tpl", backendContext);
    expect(rendered).not.toContain("plugins");
    expect(rendered).not.toContain("__");
  });

  test("renders Effect starter module and test", () => {
    const entry = renderTemplate("src/index.effect.ts.tpl", effectContext);
    const starterTest = renderTemplate("src/index.effect.test.ts.tpl", effectContext);

    expect(entry).toContain('export const projectName = "forge-effect"');
    expect(entry).toContain("Context.Tag");
    expect(entry).toContain("BunRuntime.runMain");
    expect(entry).toContain("Effect.gen");
    expect(starterTest).toContain("Effect.runPromise");
    expect(starterTest).toContain("Greeter");
  });

  test("renders a real backend starter module and test", () => {
    const entry = renderTemplate("src/index.ts.tpl", backendContext);
    const starterTest = renderTemplate("src/index.test.ts.tpl", backendContext);

    expect(entry).toContain('export const projectName = "forge-backend";');
    expect(entry).toContain("export function createGreeting");
    expect(entry).toContain("console.log(createGreeting())");
    expect(starterTest).toContain('import { createGreeting, projectName } from "./index";');
    expect(starterTest).toContain("expect(createGreeting()).toBe(`Hello from ");
    expect(starterTest).toContain("$" + "{projectName}`)");
  });
});
