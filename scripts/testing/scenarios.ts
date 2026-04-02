export type ScaffoldScenario =
  | "none-plain"
  | "none-ai"
  | "none-effect"
  | "none-ai-effect"
  | "tanstack-plain"
  | "tanstack-ai"
  | "tanstack-effect"
  | "tanstack-ai-effect";

export const ALL_SCAFFOLD_SCENARIOS = [
  "none-plain",
  "none-ai",
  "none-effect",
  "none-ai-effect",
  "tanstack-plain",
  "tanstack-ai",
  "tanstack-effect",
  "tanstack-ai-effect",
] as const satisfies readonly ScaffoldScenario[];

export const SCAFFOLD_SCENARIO_CONFIG = {
  "none-plain": { frontend: "none", ai: false, effect: false },
  "none-ai": { frontend: "none", ai: true, effect: false },
  "none-effect": { frontend: "none", ai: false, effect: true },
  "none-ai-effect": { frontend: "none", ai: true, effect: true },
  "tanstack-plain": { frontend: "tanstack", ai: false, effect: false },
  "tanstack-ai": { frontend: "tanstack", ai: true, effect: false },
  "tanstack-effect": { frontend: "tanstack", ai: false, effect: true },
  "tanstack-ai-effect": { frontend: "tanstack", ai: true, effect: true },
} as const satisfies Record<
  ScaffoldScenario,
  { frontend: "none" | "tanstack"; ai: boolean; effect: boolean }
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
