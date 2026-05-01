export type ScaffoldScenario =
  | "none-plain"
  | "none-ai"
  | "none-effect"
  | "none-ai-effect"
  | "tanstack-plain"
  | "tanstack-ai"
  | "tanstack-ai-frontend"
  | "tanstack-effect"
  | "tanstack-ai-effect";

export const ALL_SCAFFOLD_SCENARIOS = [
  "none-plain",
  "none-ai",
  "none-effect",
  "none-ai-effect",
  "tanstack-plain",
  "tanstack-ai",
  "tanstack-ai-frontend",
  "tanstack-effect",
  "tanstack-ai-effect",
] as const satisfies readonly ScaffoldScenario[];

export const SCAFFOLD_SCENARIO_CONFIG = {
  "none-plain": { backend: true, frontend: "none", ai: false, effect: false },
  "none-ai": { backend: true, frontend: "none", ai: true, effect: false },
  "none-effect": { backend: true, frontend: "none", ai: false, effect: true },
  "none-ai-effect": { backend: true, frontend: "none", ai: true, effect: true },
  "tanstack-plain": { backend: true, frontend: "tanstack", ai: false, effect: false },
  "tanstack-ai": { backend: true, frontend: "tanstack", ai: true, effect: false },
  "tanstack-ai-frontend": { backend: false, frontend: "tanstack", ai: true, effect: false },
  "tanstack-effect": { backend: true, frontend: "tanstack", ai: false, effect: true },
  "tanstack-ai-effect": { backend: true, frontend: "tanstack", ai: true, effect: true },
} as const satisfies Record<
  ScaffoldScenario,
  { backend: boolean; frontend: "none" | "tanstack"; ai: boolean; effect: boolean }
>;

export type ScenarioConfig = (typeof SCAFFOLD_SCENARIO_CONFIG)[ScaffoldScenario];

export function isScaffoldScenario(value: string): value is ScaffoldScenario {
  return (ALL_SCAFFOLD_SCENARIOS as readonly string[]).includes(value);
}

export function parseScenariosFromArgv(
  argv: readonly string[],
  defaultScenarios: readonly ScaffoldScenario[],
): ScaffoldScenario[] {
  const scenarioFlag = argv.indexOf("--scenario");
  if (scenarioFlag === -1) {
    return [...defaultScenarios];
  }

  const scenario = argv[scenarioFlag + 1];
  if (scenario === undefined || !isScaffoldScenario(scenario)) {
    throw new Error(
      `Expected --scenario to be one of ${ALL_SCAFFOLD_SCENARIOS.join(", ")}, got ${String(
        scenario,
      )}`,
    );
  }

  return [scenario];
}
