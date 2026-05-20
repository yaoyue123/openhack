import { Context, Effect, Layer, ManagedRuntime } from "effect";
import type { OpenhackConfig } from "../config/schema.js";
import { ConfigLoader } from "../config/loader.js";

export interface ConfigInterface {
  get(): Effect.Effect<OpenhackConfig>;
}

export class ConfigService extends Context.Tag("@openhack/Config")<
  ConfigService,
  ConfigInterface
>() {}

export function ConfigLive() {
  return Layer.effect(
    ConfigService,
    Effect.tryPromise({
      try: () => new ConfigLoader().load(),
      catch: (error) => new Error(`Failed to load config: ${String(error)}`),
    }).pipe(
      Effect.map(
        (config): ConfigInterface => ({
          get: () => Effect.succeed(config),
        }),
      ),
    ),
  );
}

export type AppLayer = Layer.Layer<ConfigService>;

export interface AppRuntime {
  runPromise: <A, E>(
    effect: Effect.Effect<A, E, ConfigService>,
  ) => Promise<A>;
  runSync: <A, E>(
    effect: Effect.Effect<A, E, ConfigService>,
  ) => A;
  dispose: () => Promise<void>;
}

export function createAppRuntime(_projectDir?: string): AppRuntime {
  const layer = ConfigLive();
  const rt = ManagedRuntime.make(layer);
  return {
    runPromise: <A, E>(effect: Effect.Effect<A, E, ConfigService>) =>
      rt.runPromise(effect),
    runSync: <A, E>(effect: Effect.Effect<A, E, ConfigService>) =>
      rt.runSync(effect),
    dispose: () => rt.dispose(),
  };
}
