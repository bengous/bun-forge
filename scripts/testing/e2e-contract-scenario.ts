#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { join } from "node:path";
import { buildGeneratedProjectContract } from "../../src/core/generated-project-contract.ts";
import { toBinName, toPackageName, toProjectName } from "../../src/core/naming.ts";
import { assertGeneratedProjectContract } from "./generated-project-contract-runner.ts";
import { runCommand } from "./run-command.ts";
import { isScaffoldScenario, SCAFFOLD_SCENARIO_CONFIG } from "./scenarios.ts";

export type E2eContractScenarioOptions = {
  readonly scenario: ScaffoldScenario;
  readonly projectDir: string;
};

export function e2eContractScenarioOptionsFromArgv(
  argv: readonly string[],
): E2eContractScenarioOptions {
  const scenarioFlag = argv.indexOf("--scenario");
  const scenario = scenarioFlag === -1 ? undefined : argv[scenarioFlag + 1];
  if (scenario === undefined || !isScaffoldScenario(scenario)) {
    throw new Error("Expected --scenario to name a known generated-project scenario");
  }

  const projectDirFlag = argv.indexOf("--project-dir");
  const projectDir = projectDirFlag === -1 ? undefined : argv[projectDirFlag + 1];
  if (projectDir === undefined || !projectDir.startsWith("/")) {
    throw new Error("Expected --project-dir to be an absolute path");
  }

  return { scenario, projectDir };
}

function scenarioArgs(config: ScenarioConfig): string[] {
  return [
    "--backend",
    String(config.backend),
    "--frontend",
    config.frontend,
    "--ai",
    String(config.ai),
    "--effect",
    String(config.effect),
  ];
}

export async function runE2eContractScenario(options: E2eContractScenarioOptions): Promise<void> {
  const config = SCAFFOLD_SCENARIO_CONFIG[options.scenario];
  const projectName = `forge-e2e-${options.scenario}`;
  const cliPath = join(process.cwd(), "src/index.ts");

  await runCommand(
    [
      "bun",
      "run",
      cliPath,
      options.projectDir,
      "--yes",
      "--name",
      projectName,
      ...scenarioArgs(config),
      "--git-init",
      "false",
      "--install",
      "false",
    ],
    { cwd: process.cwd() },
  );

  await assertGeneratedProjectContract(
    options.projectDir,
    buildGeneratedProjectContract({
      destination: options.projectDir,
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
}

if (import.meta.main) {
  await runE2eContractScenario(e2eContractScenarioOptionsFromArgv(process.argv));
}
