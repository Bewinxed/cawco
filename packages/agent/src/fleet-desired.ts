/**
 * What this agent holds of the fleet: every item the hub's deltas carried
 * (core fleet-items.ts), by id, with its hash and the rev it was last
 * acknowledged at, beside what its harnesses last converged
 * (fleet-converged.ts), which is kept on disk. A delta is held as it
 * arrives, before the agent answers it; an item it carries is moved only
 * when its hash is not the one last converged (or a person's Overwrite
 * forces it), so only the parts it moved converge (fleet-parts.ts), and an
 * agent that starts again converges only what moved while it was away. Its
 * own register says what it holds (`fleetHeld`), so a hub that restarted
 * sends only what moved since. The items themselves are in memory only: an
 * agent that starts again is sent every item. The project rows among them
 * are also kept on disk (fleet-place.ts `keepProjectRows`), for a workspace
 * cut before that welcome.
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
  projectItemOf,
  reportKeyOf,
} from "@cawco/core/fleet-items";
import { unhandled } from "@cawco/core/unhandled";
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

export class FleetDesired {
  readonly #items: FleetItems = new Map();
  readonly #hashes = new Map<string, string>();
  /** Items a person's Overwrite forced, kept forced until a converge has written them. */
  readonly #forced = new Set<string>();
  #rev: number | undefined;
  /** What the harnesses last converged, as the disk keeps it: the basis every delta's items are judged moved against. */
  #converged: FleetConverged = { items: {} };
  /** Once what the disk keeps is read: every delta waits for it. */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = readConverged().then((converged) => {
      this.#converged = converged;
    });
  }

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
    this.#rev = delta.rev;
    return { changed, removed, policy: changed.includes("policy") };
  }

  /** Every item id held now. */
  ids(): string[] {
    return [...this.#items.keys()];
  }

  /** Whether item `id` is held now. */
  has(id: string): boolean {
    return this.#items.has(id);
  }

  /** The project items held now (core `projectItemOf`), by id: what the disk keeps of them. */
  projectItems(): Record<string, unknown> {
    return Object.fromEntries(
      [...this.#items].filter(([id]) => projectItemOf(id) !== undefined)
    );
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
   * A converge came to `statuses` over `ids` and to `report`: a force on any
   * of them is spent, each that came out ok is converged at its hash, each no
   * longer held is converged away, and the report is the one kept. Kept on
   * disk; a write that fails is said, and the next converge writes again.
   */
  converged(
    ids: readonly string[],
    statuses: readonly FleetItemStatus[],
    report: FleetSyncReport | undefined
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
    this.#keep({ items, report: report ?? this.#converged.report });
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
