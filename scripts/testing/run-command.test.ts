import { describe, expect, test } from "bun:test";
import { commandTimeoutMs } from "./run-command";

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
