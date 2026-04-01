import type { TemplateContext } from "../types.ts";
import { describe, expect, test } from "bun:test";
import { renderTemplate, templateValues } from "./template.ts";

const backendContext: TemplateContext = {
  projectName: "forge-backend",
  packageName: "forge-backend",
  binName: "forge-backend",
  frontend: "none",
  ai: false,
  hasWorkspaces: false,
};

const frontendAiContext: TemplateContext = {
  projectName: "forge-frontend",
  packageName: "forge-frontend",
  binName: "forge-frontend",
  frontend: "tanstack",
  ai: true,
  hasWorkspaces: true,
};

describe("templateValues", () => {
  test("omits optional script blocks when features are disabled", () => {
    const values = templateValues(backendContext);
    expect(values["WORKSPACES_BLOCK"]).toBe("");
    expect(values["AI_SCRIPTS"]).toBe("");
    expect(values["FRONTEND_SCRIPTS"]).toBe("");
  });

  test("includes optional script blocks when features are enabled", () => {
    const values = templateValues(frontendAiContext);
    expect(values["WORKSPACES_BLOCK"]).toContain('"workspaces": ["apps/*"]');
    expect(values["AI_SCRIPTS"]).toContain('"agents:check"');
    expect(values["FRONTEND_SCRIPTS"]).toContain('"validate:frontend"');
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
