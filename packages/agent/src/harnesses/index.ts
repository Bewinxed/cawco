/**
 * The harness registry: which adapters this daemon can spawn sessions on. Each
 * adapter implements {@link Harness}; a machine can run several at once, and a
 * spawn names which one it wants (`SpawnPayload.harness`, default `claude`).
 */
import type { HarnessKind } from "@cawco/core";
import type { Harness } from "../harness";
import { claudeHarness } from "./claude";
import { opencodeHarness } from "./opencode";
import { piHarness } from "./pi";

const registry = new Map<HarnessKind, Harness>();

/** Registers a harness; the last registration for a kind wins. */
export const registerHarness = (adapter: Harness): void => {
  registry.set(adapter.kind, adapter);
};

registerHarness(claudeHarness);
registerHarness(opencodeHarness);
registerHarness(piHarness);

/** Every harness this daemon has an adapter for. */
export const harnesses = (): Harness[] => [...registry.values()];

/** A harness by kind; `undefined` when the daemon has no adapter for it. */
export const harness = (kind: HarnessKind): Harness | undefined =>
  registry.get(kind);
