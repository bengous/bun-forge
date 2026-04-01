export type ScaffoldScenario = "none-plain" | "none-ai" | "tanstack-plain" | "tanstack-ai";

export const ALL_SCAFFOLD_SCENARIOS = [
  "none-plain",
  "none-ai",
  "tanstack-plain",
  "tanstack-ai",
] as const satisfies readonly ScaffoldScenario[];

export const SCAFFOLD_SCENARIO_CONFIG = {
  "none-plain": { frontend: "none", ai: false },
  "none-ai": { frontend: "none", ai: true },
  "tanstack-plain": { frontend: "tanstack", ai: false },
  "tanstack-ai": { frontend: "tanstack", ai: true },
} as const satisfies Record<ScaffoldScenario, { frontend: "none" | "tanstack"; ai: boolean }>;

export function isScaffoldScenario(value: string): value is ScaffoldScenario {
  return (
    value === "none-plain" ||
    value === "none-ai" ||
    value === "tanstack-plain" ||
    value === "tanstack-ai"
  );
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
