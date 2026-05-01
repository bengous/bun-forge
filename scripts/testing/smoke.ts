#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./run-command.ts";
import {
  ALL_SCAFFOLD_SCENARIOS,
  parseScenariosFromArgv,
  SCAFFOLD_SCENARIO_CONFIG,
} from "./scenarios.ts";

export type SmokeScenario = ScaffoldScenario;

export function smokeScenariosFromArgv(argv: readonly string[]): SmokeScenario[] {
  return parseScenariosFromArgv(argv, ALL_SCAFFOLD_SCENARIOS);
}

export async function smoke(scenario: SmokeScenario, config: ScenarioConfig): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `bun-forge-${scenario}-`));
  try {
    await runCommand(
      [
        "bun",
        "run",
        "src/index.ts",
        dir,
        "--yes",
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
    await runCommand(["bun", "install"], { cwd: dir });
    await runCommand(["bun", "run", "validate"], { cwd: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const scenario of smokeScenariosFromArgv(process.argv)) {
    await smoke(scenario, SCAFFOLD_SCENARIO_CONFIG[scenario]);
  }
}
