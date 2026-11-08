/**
 * The harness registry: which adapters this daemon can spawn sessions on. Each
 * adapter implements {@link Harness}; a machine can run several at once, and a
 * spawn names which one it wants (`SpawnPayload.harness`, default `claude`).
 */
import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
import type { Harness } from "../harness";
import { claudeHarness } from "./claude";
import { opencodeHarness } from "./opencode";
import { piHarness } from "./pi";

const ADAPTERS: { [K in HarnessKind]: Harness<K> } = {
  claude: claudeHarness,
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
