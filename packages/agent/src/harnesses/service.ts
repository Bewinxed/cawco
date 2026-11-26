/**
 * The harnesses as a service, apart from any registry of them: the real
 * adapters' (./index.ts) and a test build's stand-ins
 * (scripts/binary/test-harnesses.ts, which build-binary.ts links in place of
 * ./index.ts) each provide this one tag through their own layer.
 */
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { Context, Layer } from "effect";
import type { Harness } from "../harness";

/** The registry as the supervisor reads it ({@link Harnesses}). */
export interface HarnessRegistry {
  /** Every harness this daemon has an adapter for. */
  readonly all: () => Harness[];
  /** A harness by kind; `undefined` when the daemon has no adapter for it. */
  readonly of: (kind: HarnessKind) => Harness | undefined;
}

/**
 * The harnesses, as a service: what the session supervisor is built with
 * (session.ts `SupervisorLayer`). Its adapters hold what outlives the
 * daemon (a kept OpenCode server generation, the sessions sessiond keeps),
 * so the layer releases nothing.
 */
export class Harnesses extends Context.Service<Harnesses, HarnessRegistry>()(
  "Harnesses"
) {}

/**
 * A registry's exports, as ./index.ts and its stand-in both export them: its
 * reads, and the layer that provides {@link Harnesses} from it.
 */
export const registryOf = (registry: ReadonlyMap<HarnessKind, Harness>) => {
  const all = (): Harness[] => [...registry.values()];
  const of = (kind: HarnessKind): Harness | undefined => registry.get(kind);
  return {
    harnesses: all,
    harness: of,
    HarnessesLayer: Layer.succeed(Harnesses)(Harnesses.of({ all, of })),
  };
};
