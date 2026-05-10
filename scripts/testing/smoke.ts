#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./run-command.ts";
import {
  ALL_SCAFFOLD_SCENARIOS,
  parseScenariosFromArgv,
  SCAFFOLD_SCENARIO_CONFIG,
} from "./scenarios.ts";

export type SmokeScenario = ScaffoldScenario;

function smokePortForScenario(scenario: SmokeScenario): string {
  return String(3100 + ALL_SCAFFOLD_SCENARIOS.indexOf(scenario));
}

export function smokeScenariosFromArgv(argv: readonly string[]): SmokeScenario[] {
  return parseScenariosFromArgv(argv, ALL_SCAFFOLD_SCENARIOS);
}

export async function smoke(scenario: SmokeScenario, config: ScenarioConfig): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `kitsmith-${scenario}-`));
  const envDir = await mkdtemp(join(tmpdir(), `kitsmith-smoke-env-${scenario}-`));
  const bunTmpDir = join(envDir, "bun-tmp");
  const bunCacheDir = join(envDir, "bun-cache");
  const env = {
    BUN_INSTALL_CACHE_DIR: bunCacheDir,
    BUN_TMPDIR: bunTmpDir,
    TMPDIR: bunTmpDir,
  };

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
        env,
      },
    );
    await runCommand(["bun", "install"], { cwd: dir, env });
    await runCommand(["bun", "run", "validate"], {
      cwd: dir,
      env: { ...env, PLAYWRIGHT_PORT: smokePortForScenario(scenario) },
    });
  } finally {
    await Promise.all([
      rm(dir, { recursive: true, force: true }),
      rm(envDir, { recursive: true, force: true }),
    ]);
  }
}

if (import.meta.main) {
  await Promise.all(
    smokeScenariosFromArgv(process.argv).map(async (scenario) =>
      smoke(scenario, SCAFFOLD_SCENARIO_CONFIG[scenario]),
    ),
  );
}
