import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandTimeoutMs, kitsmithTempPath, runCommandEnv } from "./run-command";

describe("commandTimeoutMs", () => {
  test("uses the default timeout when unset or invalid", () => {
    expect(commandTimeoutMs({})).toBe(300_000);
    expect(commandTimeoutMs({ BUN_FORGE_TEST_COMMAND_TIMEOUT_MS: "0" })).toBe(300_000);
    expect(commandTimeoutMs({ BUN_FORGE_TEST_COMMAND_TIMEOUT_MS: "nope" })).toBe(300_000);
  });

  test("accepts a positive integer override", () => {
    expect(commandTimeoutMs({ BUN_FORGE_TEST_COMMAND_TIMEOUT_MS: "1000" })).toBe(1000);
  });
});

describe("runCommandEnv", () => {
  test("defaults Bun temp paths to the OS temp directory", () => {
    expect(kitsmithTempPath("bun-tmp")).toBe(join(tmpdir(), "bun-tmp"));
    expect(runCommandEnv({}, {})["TMPDIR"]).toBe(join(tmpdir(), "bun-tmp"));
    expect(runCommandEnv({}, {})["BUN_TMPDIR"]).toBe(join(tmpdir(), "bun-tmp"));
    expect(runCommandEnv({}, {})["BUN_INSTALL"]).toBeUndefined();
  });

  test("preserves explicit Bun temp path overrides", () => {
    expect(
      runCommandEnv(
        {
          BUN_TMPDIR: "custom-tmp",
          BUN_INSTALL: "custom-install",
          BUN_INSTALL_CACHE_DIR: "custom-cache",
          TMPDIR: "custom-tmpdir",
        },
        {},
      ),
    ).toMatchObject({
      BUN_TMPDIR: "custom-tmp",
      BUN_INSTALL: "custom-install",
      BUN_INSTALL_CACHE_DIR: "custom-cache",
      TMPDIR: "custom-tmpdir",
    });
  });
});
