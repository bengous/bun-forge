#!/usr/bin/env bun

import type { ScaffoldScenario, ScenarioConfig } from "./scenarios.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_SCAFFOLD_SCENARIOS,
  parseScenariosFromArgv,
  SCAFFOLD_SCENARIO_CONFIG,
} from "./scenarios.ts";

export type SmokeScenario = ScaffoldScenario;

async function run(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? "/tmp",
      BUN_INSTALL: process.env["BUN_INSTALL"] ?? "/tmp/bun-install",
    },
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

export function smokeScenariosFromArgv(argv: readonly string[]): SmokeScenario[] {
  return parseScenariosFromArgv(argv, ALL_SCAFFOLD_SCENARIOS);
}

export async function smoke(scenario: SmokeScenario, config: ScenarioConfig): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `bun-forge-${scenario}-`));
  try {
    await run(
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
      process.cwd(),
    );
    await run(["bun", "install"], dir);
    await run(["bun", "run", "validate"], dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const scenario of smokeScenariosFromArgv(process.argv)) {
    await smoke(scenario, SCAFFOLD_SCENARIO_CONFIG[scenario]);
  }
}
