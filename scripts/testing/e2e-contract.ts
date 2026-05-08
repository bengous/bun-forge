#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGeneratedProjectContract } from "../../src/core/generated-project-contract.ts";
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
  const dir = await mkdtemp(join(tmpdir(), `kitsmith-e2e-contract-${scenario}-`));
  const envDir = await mkdtemp(join(tmpdir(), `kitsmith-e2e-env-${scenario}-`));
  const projectName = `forge-e2e-${scenario}`;
  const bunTmpDir = join(envDir, "bun-tmp");
  const bunCacheDir = join(envDir, "bun-cache");

  try {
    await mkdir(bunTmpDir, { recursive: true });
    await mkdir(bunCacheDir, { recursive: true });

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
      {
        cwd: process.cwd(),
        env: {
          BUN_INSTALL_CACHE_DIR: bunCacheDir,
          BUN_TMPDIR: bunTmpDir,
          TMPDIR: bunTmpDir,
        },
      },
    );

    await assertGeneratedProjectContract(
      dir,
      buildGeneratedProjectContract({
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
    await Promise.all([
      rm(dir, { recursive: true, force: true }),
      rm(envDir, { recursive: true, force: true }),
    ]);
  }
}

if (import.meta.main) {
  await Promise.all(
    e2eContractScenariosFromArgv(process.argv).map(async (scenario) =>
      e2eContract(scenario, SCAFFOLD_SCENARIO_CONFIG[scenario]),
    ),
  );
}
