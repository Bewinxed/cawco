/**
 * The harness registry: which adapters this daemon can spawn sessions on. Each
 * adapter implements {@link Harness}; a machine can run several at once, and a
 * spawn names which one it wants (`SpawnPayload.harness`, default `claude`).
 */
import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
import { Context, Layer } from "effect";
import type { Harness } from "../harness";
import { agyHarness } from "./agy";
import { claudeHarness } from "./claude";
import { codexHarness } from "./codex";
import { opencodeHarness } from "./opencode";
import { piHarness } from "./pi";

const ADAPTERS: { [K in HarnessKind]: Harness<K> } = {
  agy: agyHarness,
  claude: claudeHarness,
  codex: codexHarness,
  opencode: opencodeHarness,
  pi: piHarness,
};

const registry = new Map<HarnessKind, Harness>(
  HARNESSES.map((kind) => [kind, ADAPTERS[kind]])
);

/** Every harness this daemon has an adapter for. */
export const harnesses = (): Harness[] => [...registry.values()];

/** A harness by kind; `undefined` when the daemon has no adapter for it. */
export const harness = (kind: HarnessKind): Harness | undefined =>
  registry.get(kind);

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

export const HarnessesLayer = Layer.succeed(Harnesses)({
  all: harnesses,
  of: harness,
});
