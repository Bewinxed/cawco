/**
 * What this agent holds of the fleet: every item the hub's deltas carried
 * (core fleet-items.ts), by id, with its hash and the rev it was last
 * acknowledged at. A delta is held as it arrives, before the agent answers
 * it; the config the harnesses converge is joined from the items here, and
 * only a delta that moved an item (or a person's Sync) sends one to
 * converge. Its own register says what it holds (`fleetHeld`), so a hub that
 * restarted sends only what moved since. In memory only: an agent that
 * starts again holds nothing and is sent every item, which its harnesses
 * converge by hash and leave as they are.
 */
import type {
  FleetDelta,
  FleetHeld,
  FleetItemStatus,
  FleetSyncReport,
  MachineFleetConfig,
} from "@cawco/core";
import {
  type FleetItems,
  fleetConfigOf,
  itemKind,
  placedFolder,
  reportKeyOf,
} from "@cawco/core/fleet-items";

/**
 * What a delta moved: the items it changed or forced, the ones it took away,
 * and whether the policy is among them; the folders of the placed copies
 * among them (core `placedFolder`), and whether any other item moved
 * (`wide`): a delta that moved only placed copies (the hub's "a place
 * changed", a delegate's workspace cut or archived) is converged at those
 * folders alone. The policy is neither: it is written as the delta arrives.
 */
export interface DeltaApplied {
  changed: string[];
  places: string[];
  policy: boolean;
  removed: string[];
  wide: boolean;
}

export class FleetDesired {
  readonly #items: FleetItems = new Map();
  readonly #hashes = new Map<string, string>();
  /** Items a person's Overwrite forced, kept forced until a converge has written them. */
  readonly #forced = new Set<string>();
  #rev: number | undefined;

  /** What the register says this agent holds; none before its first delta. */
  held(): FleetHeld | undefined {
    return this.#rev === undefined
      ? undefined
      : { rev: this.#rev, items: Object.fromEntries(this.#hashes) };
  }

  get rev(): number | undefined {
    return this.#rev;
  }

  /** The fleet's denied tools as held now; none before a delta carried the policy. */
  get deniedTools(): string[] | undefined {
    const policy = this.#items.get("policy") as
      { deniedTools: string[] } | undefined;
    return policy?.deniedTools;
  }

  /** Holds `delta`'s items: what it moved, forced or took away. */
  apply(delta: FleetDelta): DeltaApplied {
    const changed: string[] = [];
    const removed: string[] = [];
    const places = new Set<string>();
    let wide = false;
    // Each item moved, by the value it had (one taken away) or has now.
    const moved = (id: string, value: unknown): void => {
      if (id === "policy") {
        return;
      }
      const folder = placedFolder(value);
      if (folder === undefined) {
        wide = true;
      } else {
        places.add(folder);
      }
    };
    const named = new Set<string>();
    for (const item of delta.items) {
      named.add(item.id);
      if (item.value === null) {
        const held = this.#items.get(item.id);
        if (this.#items.delete(item.id)) {
          removed.push(item.id);
          moved(item.id, held);
        }
        this.#hashes.delete(item.id);
        this.#forced.delete(item.id);
        continue;
      }
      if (item.force) {
        this.#forced.add(item.id);
      }
      if (this.#hashes.get(item.id) !== item.hash || item.force) {
        changed.push(item.id);
        moved(item.id, item.value);
      }
      this.#items.set(item.id, item.value);
      this.#hashes.set(item.id, item.hash);
    }
    if (delta.full) {
      for (const [id, held] of [...this.#items]) {
        if (!named.has(id)) {
          this.#items.delete(id);
          this.#hashes.delete(id);
          this.#forced.delete(id);
          removed.push(id);
          moved(id, held);
        }
      }
    }
    this.#rev = delta.rev;
    return {
      changed,
      removed,
      places: [...places],
      policy: changed.includes("policy"),
      wide,
    };
  }

  /** Every item id held now. */
  ids(): string[] {
    return [...this.#items.keys()];
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

  /** A converge wrote these items: a force on any of them is spent. */
  converged(ids: readonly string[]): void {
    for (const id of ids) {
      this.#forced.delete(id);
    }
  }
}

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
    case "placedMcp":
      return report.mcp[key];
    case "skill":
    case "placedSkill":
      return report.skills?.[key];
    case "marketplace":
      return report.marketplaces[key];
    case "plugin":
      return report.plugins[key];
    case "memory":
      return report.memory;
    case "memoryDoc":
    case "placedMemory":
      return report.memoryDocs?.[key];
    case "hook":
      return report.hooks?.[key];
    case "harnessConfig":
      return report.harnessConfig?.[key];
    case "policy":
    case "hubOnly":
    case "pluginPayload":
      // No report names them: written as asked.
      return;
    default: {
      const unhandled: never = kind;
      throw new Error(`unhandled kind: ${String(unhandled)}`);
    }
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
