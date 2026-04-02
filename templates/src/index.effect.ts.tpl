import { BunRuntime } from "@effect/platform-bun";
import { Context, Effect, Layer } from "effect";

export const projectName = "__PROJECT_NAME__";

export class Greeter extends Context.Tag("__PACKAGE_NAME__/index/Greeter")<
  Greeter,
  { readonly greet: (name?: string) => string }
>() {}

export const GreeterLive: Layer.Layer<Greeter> = Layer.succeed(Greeter, {
  greet: (name = projectName) => `Hello from ${name}`,
});

const program = Effect.gen(function* () {
  const greeter = yield* Greeter;
  console.log(greeter.greet());
});

if (import.meta.main) {
  // @effect-diagnostics effect/strictEffectProvide:off
  BunRuntime.runMain(program.pipe(Effect.provide(GreeterLive)));
}
