import { expect, test } from "bun:test";
import { createGreeting, projectName } from "./index";

test("createGreeting returns the starter greeting", () => {
  expect(createGreeting()).toBe(`Hello from ${projectName}`);
});
