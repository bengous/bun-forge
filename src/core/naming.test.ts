import { describe, expect, test } from "bun:test";
import { toBinName, toKebabCase, toPackageName } from "./naming.ts";

describe("toKebabCase", () => {
  test("normalizes mixed separators", () => {
    expect(toKebabCase("My cool_app")).toBe("my-cool-app");
  });

  test("trims leading and trailing separators", () => {
    expect(toKebabCase("  ---Hello World___ ")).toBe("hello-world");
  });

  test("collapses repeated separators", () => {
    expect(toKebabCase("hello---world___test")).toBe("hello-world-test");
  });

  test("drops unsupported characters", () => {
    expect(toKebabCase("Crème brûlée!")).toBe("cr-me-br-l-e");
  });

  test("can return an empty string", () => {
    expect(toKebabCase("!!!")).toBe("");
  });
});

describe("name derivation helpers", () => {
  test("package and bin names use kebab case", () => {
    expect(String(toPackageName("My Tool"))).toBe("my-tool");
    expect(String(toBinName("My Tool"))).toBe("my-tool");
  });
});
