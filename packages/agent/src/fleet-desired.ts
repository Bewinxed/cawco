/**
 * What this agent holds of the fleet: every item the hub's deltas carried
 * (core fleet-items.ts), by id, with its hash, and the generation of the
 * desired state it last acknowledged (its `observedGeneration`, core
 * fleet.ts `FLEET_DELTA`), kept on disk (core paths.ts `fleetDesiredFile`)
 * before the agent answers each delta; beside it, what its harnesses last
 * converged (fleet-converged.ts). An item a delta carries is moved only when
 * its hash is not the one last converged (or a person's Overwrite forces
 * it), so only the parts it moved converge (fleet-parts.ts). Its register
 * says what it holds (`fleetHeld`), through a restart too, so the hub sends
 * only what moved since: an agent that starts again is no full welcome and
 * converges nothing that did not move. A workspace cut before that welcome
 * places its project's rows from here (session.ts `placeClone`).
 */
import {
  type FleetDelta,
  type FleetHeld,
  type FleetItemState,
  type FleetItemStatus,
  type FleetSyncReport,
  type MachineFleetConfig,
  type PlacedSection,
  worstFleetState,
} from "@cawco/core";
import {
  type FleetItems,
  fleetConfigOf,
  itemKind,
  reportKeyOf,
} from "@cawco/core/fleet-items";
import { fleetDesiredFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import {
  type FleetConverged,
  keepConverged,
  readConverged,
} from "./fleet-converged";

/** What a delta moved: the items it changed or forced, the ones it took away, and whether the policy is among them. */
export interface DeltaApplied {
  changed: string[];
  policy: boolean;
  removed: string[];
}

/** What the disk keeps of what the agent holds ({@link FleetDesired.keep}). */
const FleetDesiredShape = z.object({
  forced: z.array(z.string()),
  generation: z.number(),
  items: z.record(
    z.string(),
    z.object({ hash: z.string(), value: z.unknown() })
  ),
});

/** What the disk keeps; nothing when there is none, or it does not read (said: the hub then sends every item). */
const readDesired = async (): Promise<
  z.output<typeof FleetDesiredShape> | undefined
> => {
  try {
    return await readRecord(fleetDesiredFile(), FleetDesiredShape);
  } catch (error) {
    console.warn(
      `[fleet] ${fleetDesiredFile()} was not read, so the hub's welcome carries every item: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export class FleetDesired {
  readonly #items: FleetItems = new Map();
  readonly #hashes = new Map<string, string>();
  /** Items a person's Overwrite forced, kept forced until a converge has written them. */
  readonly #forced = new Set<string>();
  /** The generation of the desired state held: none before the first delta this machine ever took. */
  #generation: number | undefined;
  /** The generation the disk keeps: what a delta sent again is judged observed by. */
  #kept: number | undefined;
  /** What the harnesses last converged, as the disk keeps it: the basis every delta's items are judged moved against. */
  #converged: FleetConverged = { items: {} };
  /** Each write of what is held, one after another, so the last delta's is the one on disk. */
  #writing: Promise<void> = Promise.resolve();
  /** Once what the disk keeps is read: the register and every delta wait for it. */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = Promise.all([readConverged(), readDesired()]).then(
      ([converged, desired]) => {
        this.#converged = converged;
        if (!desired) {
          return;
        }
        this.#generation = desired.generation;
        this.#kept = desired.generation;
        for (const [id, { hash, value }] of Object.entries(desired.items)) {
          this.#items.set(id, value);
          this.#hashes.set(id, hash);
        }
        for (const id of desired.forced) {
          this.#forced.add(id);
        }
      }
    );
  }

  /** What the register says this agent holds; none before the first delta it ever took. */
  held(): FleetHeld | undefined {
    return this.#generation === undefined
      ? undefined
      : {
          observedGeneration: this.#generation,
          items: Object.fromEntries(this.#hashes),
        };
  }

  /** The generation of the desired state this agent holds: its `observedGeneration`. */
  get generation(): number | undefined {
    return this.#generation;
  }

  /**
   * Whether `delta` is one this agent holds already: a generation it
   * observed, sent again because its answer went unheard. A welcome is
   * never one: it carries what differs from what the register claimed.
   */
  observed(delta: FleetDelta): boolean {
    return (
      !delta.welcome &&
      this.#kept !== undefined &&
      delta.generation <= this.#kept
    );
  }

  /** The fleet's denied tools as held now; none before a delta carried the policy. */
  get deniedTools(): string[] | undefined {
    const policy = this.#items.get("policy") as
      { deniedTools: string[] } | undefined;
    return policy?.deniedTools;
  }

  /** The generation whose converge has ended (fleet-converged.ts): 0 before the first. */
  get convergedGeneration(): number {
    return this.#converged.generation ?? 0;
  }

  /**
   * Whether a converge this agent began may not have ended: what it keeps
   * is a generation past the one it converged, as when it stopped mid-way.
   */
  get behind(): boolean {
    return (
      this.#generation !== undefined &&
      this.convergedGeneration < this.#generation
    );
  }

  /** Each item held whose hash is not the one converged, and each converged one no longer held: what a converge cut short left owed. */
  unconverged(): string[] {
    const converged = this.#converged.items;
    return [
      ...[...this.#hashes]
        .filter(([id, hash]) => converged[id] !== hash)
        .map(([id]) => id),
      ...Object.keys(converged).filter((id) => !this.#items.has(id)),
    ].filter((id) => id !== "policy");
  }

  /** The converge of every generation up to `generation` has ended: kept on disk. */
  convergedTo(generation: number): void {
    if (this.#converged.generation === generation) {
      return;
    }
    this.#keep({ ...this.#converged, generation });
  }

  /** The report the machine last sent, as the disk keeps it; none before its first converge. */
  get report(): FleetSyncReport | undefined {
    return this.#converged.report;
  }

  /**
   * Holds `delta`'s items: each whose hash is not the one last converged, or
   * that is forced, as moved; each it takes away, and for a whole one each
   * held or converged that it does not name, as removed.
   */
  apply(delta: FleetDelta): DeltaApplied {
    const changed: string[] = [];
    const removed: string[] = [];
    const named = new Set<string>();
    const converged = this.#converged.items;
    for (const item of delta.items) {
      named.add(item.id);
      if (item.value === null) {
        if (this.#items.delete(item.id) || item.id in converged) {
          removed.push(item.id);
        }
        this.#hashes.delete(item.id);
        this.#forced.delete(item.id);
        continue;
      }
      if (item.force) {
        this.#forced.add(item.id);
      }
      if (converged[item.id] !== item.hash || item.force) {
        changed.push(item.id);
      }
      this.#items.set(item.id, item.value);
      this.#hashes.set(item.id, item.hash);
    }
    if (delta.full) {
      for (const id of new Set([
        ...this.#items.keys(),
        ...Object.keys(converged),
      ])) {
        if (!named.has(id)) {
          this.#items.delete(id);
          this.#hashes.delete(id);
          this.#forced.delete(id);
          removed.push(id);
        }
      }
    }
    this.#generation = delta.generation;
    return { changed, removed, policy: changed.includes("policy") };
  }

  /**
   * What is held now, written to disk whole, after every write begun before:
   * what the agent's answer to a delta waits on (ACK means kept), and what
   * its next start reads back.
   */
  keep(): Promise<void> {
    const generation = this.#generation ?? 0;
    const kept = {
      generation,
      forced: [...this.#forced],
      items: Object.fromEntries(
        [...this.#items].map(([id, value]) => [
          id,
          { hash: this.#hashes.get(id) ?? "", value },
        ])
      ),
    } satisfies z.input<typeof FleetDesiredShape>;
    const next = this.#writing.then(async () => {
      await writeStateFile(fleetDesiredFile(), JSON.stringify(kept));
      this.#kept = generation;
    });
    this.#writing = next.catch(() => undefined);
    return next;
  }

  /** Every item id held now. */
  ids(): string[] {
    return [...this.#items.keys()];
  }

  /** Whether item `id` is held now. */
  has(id: string): boolean {
    return this.#items.has(id);
  }

  hashOf(id: string): string {
    return this.#hashes.get(id) ?? "";
  }

  /** The config the harnesses converge, joined from the items held, each still-forced item forced. */
  config(): MachineFleetConfig {
    const items: FleetItems = new Map(
      [...this.#items].map(([id, value]) => [
        id,
        this.#forced.has(id) && value && typeof value === "object"
          ? { ...(value as object), force: true }
          : value,
      ])
    );
    return fleetConfigOf(items);
  }

  /**
   * A converge came to `statuses` over `ids` and to `report`, and every
   * generation up to `generation` has converged: a force on any of them is
   * spent, each that came out ok is converged at its hash, each no longer
   * held is converged away, and the report is the one kept. Kept on disk; a
   * write that fails is said, and the next converge writes again.
   */
  converged(
    ids: readonly string[],
    statuses: readonly FleetItemStatus[],
    report: FleetSyncReport | undefined,
    generation: number
  ): void {
    const items = { ...this.#converged.items };
    for (const id of ids) {
      this.#forced.delete(id);
      if (!this.#items.has(id)) {
        delete items[id];
      }
    }
    for (const status of statuses) {
      if (status.state === "ok" && this.#items.has(status.id)) {
        items[status.id] = status.hash;
      }
    }
    this.#keep({
      generation,
      items,
      report: report ?? this.#converged.report,
    });
  }

  /** The policy held now was written (denied-tools.ts `applyFleetDenials`): converged at its hash. */
  policyWritten(): void {
    const hash = this.#hashes.get("policy");
    if (hash === undefined || this.#converged.items.policy === hash) {
      return;
    }
    this.#keep({
      ...this.#converged,
      items: { ...this.#converged.items, policy: hash },
    });
  }

  /** `report` is the machine's last one sent: a status read, or a clone's placement laid over the last. */
  reported(report: FleetSyncReport): void {
    this.#keep({ ...this.#converged, report });
  }

  #keep(converged: FleetConverged): void {
    this.#converged = converged;
    keepConverged(converged).catch((error: unknown) =>
      console.warn(
        `[fleet] what the machine converged was not kept on disk, so its next start converges those items again: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * A project row's state as the report says it per place (core
 * `FleetSyncReport.placed`): the worst of its places, a failure naming its
 * place; none where it is placed nowhere yet.
 */
const placedState = (
  report: FleetSyncReport,
  section: PlacedSection,
  key: string
): FleetItemState | undefined => {
  const places = Object.entries(report.placed?.[section]?.[key] ?? {});
  if (places.length === 0) {
    return;
  }
  const worst = worstFleetState(places.map(([, state]) => state));
  const [where] = places.find(([, state]) => state === worst) ?? [];
  return worst.detail && where
    ? { ...worst, detail: `${where}: ${worst.detail}` }
    : worst;
};

/** One item's state as a converge's report names it: failed in its words, or done. */
const reported = (
  report: FleetSyncReport,
  id: string
): { detail?: string; state: string } | undefined => {
  const key = reportKeyOf(id);
  if (key === undefined) {
    return;
  }
  const kind = itemKind(id);
  switch (kind) {
    case "mcp":
      return report.mcp[key];
    case "skill":
      return report.skills?.[key];
    case "marketplace":
      return report.marketplaces[key];
    case "plugin":
      return report.plugins[key];
    case "memory":
      return report.memory;
    case "memoryDoc":
      return report.memoryDocs?.[key];
    case "hook":
      return report.hooks?.[key];
    case "harnessConfig":
      return report.harnessConfig?.[key];
    case "projectMcp":
      return placedState(report, "mcp", key);
    case "projectSkill":
      return placedState(report, "skills", key);
    case "projectMemory":
      return placedState(report, "memoryDocs", key);
    case "projectHook":
      return placedState(report, "hooks", key);
    case "projectHarnessConfig":
      return placedState(report, "harnessConfig", key);
    case "policy":
    case "hubOnly":
    case "pluginPayload":
    case "projectCheckout":
      // No report names them: written as asked.
      return;
    default:
      unhandled("kind", kind);
  }
};

/**
 * What a converge came to for each of `ids`, off its report: `failed` with
 * the machine's words where the report says a row failed, `ok` for the rest
 * (applied, unchanged, a server that needs a sign-in the hub holds: written
 * as asked). `thrown`: a harness's converge that threw, failing every item.
 */
export const itemStatuses = (
  desired: FleetDesired,
  ids: readonly string[],
  report: FleetSyncReport | undefined,
  ms: number,
  thrown?: string
): FleetItemStatus[] =>
  ids.map((id) => {
    const state = report ? reported(report, id) : undefined;
    const error =
      thrown ??
      (state?.state === "failed" ? (state.detail ?? "failed") : undefined);
    return {
      id,
      hash: desired.hashOf(id),
      ms,
      ...(error
        ? { state: "failed" as const, error }
        : { state: "ok" as const }),
    };
  });
