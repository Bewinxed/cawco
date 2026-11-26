/**
 * The harness registry: which adapters this daemon can spawn sessions on. Each
 * adapter implements {@link Harness}; a machine can run several at once, and a
 * spawn names which one it wants (`SpawnPayload.harness`, default `claude`).
 */
import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
import type { Harness } from "../harness";
import { agyHarness } from "./agy";
import { claudeHarness } from "./claude";
import { codexHarness } from "./codex";
import { opencodeHarness } from "./opencode";
import { piHarness } from "./pi";
import { registryOf } from "./service";

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

/**
 * Every harness this daemon has an adapter for (`harnesses`), one by kind
 * (`harness`, `undefined` when it has none), and the layer that provides
 * them as the service (service.ts `Harnesses`, by `HarnessesLayer`).
 */
export const { harnesses, harness, HarnessesLayer } = registryOf(registry);
