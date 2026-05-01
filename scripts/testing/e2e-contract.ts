#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeGeneratedProject } from "../../src/core/generated-project-contract.ts";
import { toBinName, toPackageName, toProjectName } from "../../src/core/naming.ts";
import { assertGeneratedProjectContract } from "./generated-project-contract-runner.ts";
import { runCommand } from "./run-command.ts";
import { parseScenariosFromArgv, SCAFFOLD_SCENARIO_CONFIG } from "./scenarios.ts";

export type E2eContractScenario = ScaffoldScenario;

const DEFAULT_E2E_CONTRACT_SCENARIOS = [
  "none-ai",
  "none-effect",
  "tanstack-ai",
  "tanstack-ai-frontend",
  "tanstack-ai-effect",
] as const satisfies readonly E2eContractScenario[];

export function e2eContractScenariosFromArgv(argv: readonly string[]): E2eContractScenario[] {
  return parseScenariosFromArgv(argv, DEFAULT_E2E_CONTRACT_SCENARIOS);
}

export async function e2eContract(
  scenario: E2eContractScenario,
  config: ScenarioConfig,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `bun-forge-e2e-contract-${scenario}-`));
  const projectName = `forge-e2e-${scenario}`;

  try {
    await runCommand(
      [
        "bun",
        "run",
        "src/index.ts",
        dir,
        "--yes",
        "--name",
        projectName,
        "--backend",
        String(config.backend),
        "--frontend",
        config.frontend,
        "--ai",
        String(config.ai),
        "--effect",
        String(config.effect),
        "--git-init",
        "false",
        "--install",
        "false",
      ],
      { cwd: process.cwd() },
    );

    await assertGeneratedProjectContract(
      dir,
      describeGeneratedProject({
        destination: dir,
        projectName: toProjectName(projectName),
        packageName: toPackageName(projectName),
        binName: toBinName(projectName),
        backend: config.backend,
        frontend: config.frontend,
        ai: config.ai,
        effect: config.effect,
        install: false,
        gitInit: false,
        yes: true,
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const scenario of e2eContractScenariosFromArgv(process.argv)) {
    const config = SCAFFOLD_SCENARIO_CONFIG[scenario];
    await e2eContract(scenario, config);
  }
}
