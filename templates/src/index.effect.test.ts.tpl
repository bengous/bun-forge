import { expect, test } from "bun:test";
import { Effect } from "effect";
import { Greeter, GreeterLive, projectName } from "./index";

test("Greeter returns the starter greeting", async () => {
  const result = await Effect.gen(function* () {
    const greeter = yield* Greeter;
    return greeter.greet();
    // @effect-diagnostics effect/strictEffectProvide:off
  }).pipe(Effect.provide(GreeterLive), Effect.runPromise);

  expect(result).toBe(`Hello from ${projectName}`);
});
