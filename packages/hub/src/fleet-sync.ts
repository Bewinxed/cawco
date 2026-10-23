/**
 * The fleet's config to each machine, as acknowledged deltas (core fleet.ts
 * `FLEET_DELTA`, core fleet-items.ts).
 *
 * The hub keeps a rev and, per machine, the hash of every item the machine
 * acknowledged holding. A register is answered at once with a welcome: the
 * items that differ from what its register says it holds (`FleetHeld`), every
 * item for an agent that holds none, the policy among them; the agent writes
 * the policy, answers (READY), and only then is the machine online. Every
 * fleet change is one {@link FleetSync.changed}: 250 ms after the last, each
 * machine's config is built again and diffed against what it acknowledged,
 * and only the items whose hash moved go, a machine whose items did not move
 * being sent nothing.
 *
 * Each delta is said `sent` once it is on the connection; its answer (ACK,
 * or NACK in the agent's words) or {@link FLEET_ACK_MS} with none is kept on
 * the machine's row (`agents.fleet_sync`), and one unanswered or refused is
 * sent again on the machine's next heartbeat. What its items come to as the
 * machine's harnesses converge them arrives item by item (`fleet_converge`)
 * and is kept on the row too (`agents.fleet_items`).
 *
 * A person's Overwrite ({@link FleetSync.force}) sends the item forced
 * whether or not it moved, and the agent keeps it forced until a converge
 * has written it, whatever delta comes meanwhile.
 */
import {
  type ControlResultFrame,
  FLEET_ACK_MS,
  type FleetDelta,
  type FleetDeltaItem,
  type FleetHeld,
  type FleetItemStatus,
  type FleetSyncOutcome,
} from "@cawco/core";
import { type FleetItems, itemHash } from "@cawco/core/fleet-items";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** How long fleet changes gather before each machine's delta is built. */
const DEBOUNCE_MS = 250;
/** The least time between two sends of a delta a machine refused, on its heartbeats. */
const NACK_AGAIN_MS = 60_000;

export interface FleetSyncDeps {
  /** The machine's config now, as items. */
  desired: (machineId: string) => FleetItems;
  /** Keeps the machine's delta outcome on its row and tells every dashboard. */
  keep: (machineId: string, outcome: FleetSyncOutcome) => void;
  /** Keeps the machine's item statuses on its row and tells every dashboard. */
  keepItems: (
    machineId: string,
    items: Record<string, FleetItemStatus>
  ) => void;
  /** The item statuses kept on the machine's row. */
  keptItems: (machineId: string) => Record<string, FleetItemStatus>;
  lifetime: HubLifetimeShape;
  /** The machine's name in the hub's log lines. */
  name: (machineId: string) => string;
  /** The machine answered its welcome: it is online. */
  ready: (machineId: string) => void;
  /** Puts the delta on the machine's connection; false when it has none. */
  send: (machineId: string, requestId: string, delta: FleetDelta) => boolean;
}

/** What a send asks beyond the items that moved. */
interface Ask {
  recheck?: true;
  reconverge?: true;
  why: string;
}

interface InFlight {
  full: boolean;
  /** Each item it carried, by id, with its hash; `null` for one it took away. */
  items: Map<string, string | null>;
  machineId: string;
  rev: number;
  sentAt: number;
  timer?: HubTimer;
  welcome: boolean;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** Each object an item holds, by a number of its own: what {@link hashOf} keys a value by. */
const refs = new WeakMap<object, number>();
let nextRef = 0;
const refOf = (value: object): number => {
  let ref = refs.get(value);
  if (ref === undefined) {
    ref = nextRef;
    nextRef += 1;
    refs.set(value, ref);
  }
  return ref;
};

/** Each item's last hash, by its id, with the shallow key it was taken for. */
const hashed = new Map<string, { hash: string; key: string }>();

/**
 * An item's hash (core `itemHash`), taken again only when the item is not
 * the one hashed last: its own fields the same and each object it holds the
 * same object. A skill's or plugin's files are kept by their content hash
 * (db `keptFiles`), the same arrays build after build, so each welcome and
 * delta no longer hashes every file the fleet holds for every machine
 * (78 MB, the register's largest cost after its reads: hub-restart-live-db).
 */
const hashOf = (id: string, value: unknown): string => {
  const key =
    value && typeof value === "object" && !Array.isArray(value)
      ? JSON.stringify(
          Object.entries(value).map(([field, inner]) => [
            field,
            inner && typeof inner === "object" ? `#${refOf(inner)}` : inner,
          ])
        )
      : undefined;
  const held = hashed.get(id);
  if (key !== undefined && held?.key === key) {
    return held.hash;
  }
  const hash = itemHash(value);
  if (key === undefined) {
    hashed.delete(id);
  } else {
    hashed.set(id, { hash, key });
  }
  return hash;
};

/**
 * Each of `items` hashed now, so the welcome that diffs them next takes
 * each hash kept: the hub's start does it for every machine it knows, before
 * it listens, rather than the first register paying for every file the fleet
 * holds (hub-restart-live-db, 2026-10-23).
 */
export const warmHashes = (items: FleetItems): void => {
  for (const [id, value] of items) {
    hashOf(id, value);
  }
};

/**
 * The items of `desired` whose hash differs from what was acknowledged
 * (`acked`), or that are forced, and, unless every item goes (`full`), each
 * acknowledged one `desired` no longer names, as a removal.
 */
const diffItems = (
  desired: FleetItems,
  acked: ReadonlyMap<string, string>,
  forced: ReadonlySet<string>,
  full: boolean
): FleetDeltaItem[] => {
  const items: FleetDeltaItem[] = [];
  for (const [id, value] of desired) {
    const hash = hashOf(id, value);
    if (acked.get(id) !== hash || forced.has(id)) {
      items.push({
        id,
        hash,
        value,
        ...(forced.has(id) ? { force: true as const } : {}),
      });
    }
  }
  if (!full) {
    for (const id of acked.keys()) {
      if (!desired.has(id)) {
        items.push({ id, hash: "", value: null });
      }
    }
  }
  return items;
};

export class FleetSync {
  readonly #deps: FleetSyncDeps;
  /** The fleet's rev: from the hub's start, so it only ever rises across restarts. */
  #rev = Date.now();
  /** What each machine acknowledged holding: item id → hash. */
  readonly #acked = new Map<string, Map<string, string>>();
  readonly #inFlight = new Map<string, InFlight>();
  /** Each machine's last delta sent, by request id: only its answer decides the row. */
  readonly #latest = new Map<string, string>();
  /** Machines whose last delta went unanswered or was refused, with when it was refused: sent again on a heartbeat. */
  readonly #owed = new Map<string, number>();
  /** The items a person's Overwrite forces on each machine, until a delta carrying them is acknowledged. */
  readonly #forced = new Map<string, Set<string>>();
  /** The changes gathered for the next build, by machine (`*`: every machine). */
  readonly #gathered = new Map<string, Ask[]>();
  #debounce: HubTimer | undefined;
  /** The machines that answered their welcome on their current connection: the ones a fleet change goes to. */
  readonly #ready = new Set<string>();
  /** Each wait for items to converge on a machine ({@link convergedAll}), checked as the machine reports. */
  readonly #waits = new Set<{ check: () => void; machineId: string }>();

  constructor(deps: FleetSyncDeps) {
    this.#deps = deps;
  }

  /** Whether the machine answered its welcome on its current connection. */
  isReady(machineId: string): boolean {
    return this.#ready.has(machineId);
  }

  /** Whether the hub waits on `requestId` as a machine's delta. */
  has(requestId: string): boolean {
    return this.#inFlight.has(requestId);
  }

  /**
   * A machine registered: its welcome goes now, the items that differ from
   * what it says it holds (every item when it holds none), the policy among
   * them. Its answer marks it online ({@link FleetSyncDeps.ready}).
   */
  welcome(machineId: string, held: FleetHeld | undefined): void {
    this.#acked.set(machineId, new Map(Object.entries(held?.items ?? {})));
    this.#owed.delete(machineId);
    this.#sendDiff(
      machineId,
      { why: held ? `its welcome (it holds rev ${held.rev})` : "its welcome" },
      { welcome: true, full: held === undefined }
    );
  }

  /**
   * The fleet changed (`why`): 250 ms after the last change, every ready
   * machine (or `machineId` alone) is sent the items that moved for it.
   * `recheck`: its workspace boundaries are checked again; `reconverge`:
   * every item it holds is converged again (the person's Sync).
   */
  changed(why: string, ask: Omit<Ask, "why"> & { machineId?: string } = {}) {
    const { machineId, ...rest } = ask;
    const key = machineId ?? "*";
    this.#gathered.set(key, [
      ...(this.#gathered.get(key) ?? []),
      { why, ...rest },
    ]);
    this.#deps.lifetime.cancel(this.#debounce);
    this.#debounce = this.#deps.lifetime.after(DEBOUNCE_MS, () =>
      this.#flush()
    );
  }

  /** A person's Overwrite of `ids` on the machine: sent forced on its next delta, moved or not. */
  force(machineId: string, ids: readonly string[]): void {
    const owed = this.#forced.get(machineId) ?? new Set<string>();
    for (const id of ids) {
      owed.add(id);
    }
    this.#forced.set(machineId, owed);
  }

  /** The machine's heartbeat: a delta it did not acknowledge, or refused a while ago, goes again. */
  heartbeat(machineId: string): void {
    const refusedAt = this.#owed.get(machineId);
    if (
      refusedAt === undefined ||
      (refusedAt > 0 && Date.now() - refusedAt < NACK_AGAIN_MS)
    ) {
      return;
    }
    this.#owed.delete(machineId);
    this.#sendDiff(
      machineId,
      { why: "sent again: the last delta was not acknowledged" },
      { welcome: !this.#ready.has(machineId), full: false }
    );
  }

  /**
   * The machine answered `requestId`: its ACK (READY for a welcome), or its
   * refusal in its own words. Answers whether the hub waited on it.
   */
  answered(requestId: string, result: ControlResultFrame): boolean {
    const sent = this.#inFlight.get(requestId);
    if (!sent) {
      return false;
    }
    this.#inFlight.delete(requestId);
    this.#deps.lifetime.cancel(sent.timer);
    const { machineId, rev, sentAt } = sent;
    const name = this.#deps.name(machineId);
    const took = seconds(Date.now() - sentAt);
    const latest = this.#latest.get(machineId) === requestId;
    if (!result.ok) {
      const error =
        result.error ??
        result.refusal?.message ??
        "the machine refused the delta and said nothing";
      console.warn(
        `[fleet] ${sent.welcome ? "welcome" : "delta"} rev ${rev} refused by ${name} (${took}): ${error}`
      );
      if (latest) {
        this.#owed.set(machineId, Date.now());
        this.#deps.keep(machineId, {
          state: "nacked",
          rev,
          sentAt,
          at: Date.now(),
          error,
        });
      }
      return true;
    }
    this.#hold(machineId, sent);
    console.info(
      `[fleet] ${sent.welcome ? "welcome" : "delta"} rev ${rev} acknowledged by ${name} (${took}, ${sent.items.size} item(s))`
    );
    if (sent.welcome && !this.#ready.has(machineId)) {
      this.#ready.add(machineId);
      this.#deps.ready(machineId);
    }
    if (latest) {
      this.#owed.delete(machineId);
      this.#deps.keep(machineId, {
        state: "acked",
        rev,
        sentAt,
        at: Date.now(),
      });
    }
    return true;
  }

  /** The machine's word on items as its harnesses converge them: kept on its row. */
  converged(machineId: string, items: readonly FleetItemStatus[]): void {
    const kept = { ...this.#deps.keptItems(machineId) };
    for (const item of items) {
      kept[item.id] = item;
    }
    this.#deps.keepItems(machineId, kept);
    for (const wait of this.#waits) {
      if (wait.machineId === machineId) {
        wait.check();
      }
    }
  }

  /**
   * Whether the machine's harnesses converged every one of `wanted` (item
   * id → hash) at that hash, ok or failed, within `ms`: true as soon as its
   * reports say so, false when `ms` passes first. What a new place's first
   * session waits on, so it starts with the project's rows placed there
   * (work-items.ts `placeTaken`).
   */
  convergedAll(
    machineId: string,
    wanted: ReadonlyMap<string, string>,
    ms: number
  ): Promise<boolean> {
    const done = (): boolean => {
      const kept = this.#deps.keptItems(machineId);
      return [...wanted].every(([id, hash]) => {
        const item = kept[id];
        return (
          item?.hash === hash &&
          (item.state === "ok" || item.state === "failed")
        );
      });
    };
    if (done()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const wait = {
        machineId,
        check: () => {
          if (done()) {
            end(true);
          }
        },
      };
      const timer = this.#deps.lifetime.after(ms, () => end(false));
      const end = (converged: boolean) => {
        this.#waits.delete(wait);
        this.#deps.lifetime.cancel(timer);
        resolve(converged);
      };
      this.#waits.add(wait);
    });
  }

  /** A person's Retry of one failed item on a machine: sent forced, so it converges again. */
  retry(machineId: string, id: string): void {
    this.force(machineId, [id]);
    this.changed(`a retry of ${id}`, { machineId });
  }

  /** The machine's connection closed: nothing on it answers now, and its next register is welcomed. */
  gone(machineId: string): void {
    for (const [requestId, sent] of this.#inFlight) {
      if (sent.machineId === machineId) {
        this.#deps.lifetime.cancel(sent.timer);
        this.#inFlight.delete(requestId);
      }
    }
    this.#latest.delete(machineId);
    this.#owed.delete(machineId);
    this.#ready.delete(machineId);
  }

  /** What an acknowledged delta carried is what the machine holds now; its forces are spent. */
  #hold(machineId: string, sent: InFlight): void {
    const acked = sent.full
      ? new Map<string, string>()
      : new Map(this.#acked.get(machineId) ?? []);
    const forced = this.#forced.get(machineId);
    const statuses = { ...this.#deps.keptItems(machineId) };
    let dropped = false;
    for (const [id, hash] of sent.items) {
      forced?.delete(id);
      if (hash === null) {
        acked.delete(id);
        if (statuses[id]) {
          delete statuses[id];
          dropped = true;
        }
      } else {
        acked.set(id, hash);
      }
    }
    if (forced?.size === 0) {
      this.#forced.delete(machineId);
    }
    this.#acked.set(machineId, acked);
    if (dropped) {
      this.#deps.keepItems(machineId, statuses);
    }
  }

  #flush(): void {
    this.#debounce = undefined;
    const gathered = new Map(this.#gathered);
    this.#gathered.clear();
    const every = gathered.get("*") ?? [];
    for (const machineId of this.#ready) {
      const asks = [...every, ...(gathered.get(machineId) ?? [])];
      if (asks.length === 0) {
        continue;
      }
      this.#sendDiff(
        machineId,
        {
          why: [...new Set(asks.map((ask) => ask.why))].join("; "),
          ...(asks.some((ask) => ask.recheck) ? { recheck: true } : {}),
          ...(asks.some((ask) => ask.reconverge) ? { reconverge: true } : {}),
        },
        { welcome: false, full: false }
      );
    }
  }

  /**
   * The items that moved for `machineId` since what it acknowledged, and
   * the ones it is to hold no more, forced ones among them, sent as one
   * delta: nothing at all when nothing moved and nothing more was asked.
   */
  #sendDiff(
    machineId: string,
    ask: Ask,
    how: { full: boolean; welcome: boolean }
  ): void {
    const name = this.#deps.name(machineId);
    let desired: FleetItems;
    try {
      desired = this.#deps.desired(machineId);
    } catch (error) {
      const at = Date.now();
      const words = error instanceof Error ? error.message : String(error);
      console.warn(
        `[fleet] no delta for ${name} (${ask.why}): the hub could not build its config: ${words}`
      );
      this.#deps.keep(machineId, {
        state: "nacked",
        rev: this.#rev,
        sentAt: at,
        at,
        error: `The hub could not build this machine's config: ${words}`,
      });
      return;
    }
    const items = diffItems(
      desired,
      how.full ? new Map() : (this.#acked.get(machineId) ?? new Map()),
      this.#forced.get(machineId) ?? new Set(),
      how.full
    );
    if (items.length === 0 && !how.welcome && !ask.recheck && !ask.reconverge) {
      console.info(`[fleet] no delta for ${name}: nothing moved (${ask.why})`);
      return;
    }
    this.#rev += 1;
    const rev = this.#rev;
    const delta: FleetDelta = {
      rev,
      full: how.full,
      welcome: how.welcome,
      items,
      ...(ask.recheck ? { recheck: true as const } : {}),
      ...(ask.reconverge ? { reconverge: true as const } : {}),
    };
    const requestId = crypto.randomUUID();
    if (!this.#deps.send(machineId, requestId, delta)) {
      console.info(
        `[fleet] no delta for ${name} (${ask.why}): it holds no link`
      );
      return;
    }
    const sentAt = Date.now();
    this.#latest.set(machineId, requestId);
    this.#inFlight.set(requestId, {
      machineId,
      rev,
      sentAt,
      full: how.full,
      welcome: how.welcome,
      items: new Map(
        items.map((item) => [item.id, item.value === null ? null : item.hash])
      ),
      timer: this.#deps.lifetime.after(FLEET_ACK_MS, () =>
        this.#unacked(requestId)
      ),
    });
    console.info(
      `[fleet] ${how.welcome ? "welcome" : "delta"} rev ${rev} sent → ${name}: ${items.length} item(s)${how.full ? " (all it holds)" : ""}; ${ask.why}`
    );
    this.#deps.keep(machineId, { state: "sent", rev, sentAt, why: ask.why });
  }

  #unacked(requestId: string): void {
    const sent = this.#inFlight.get(requestId);
    if (!sent) {
      return;
    }
    // Still waited on: an answer that comes late is read as any other.
    sent.timer = undefined;
    const { machineId, rev, sentAt } = sent;
    console.warn(
      `[fleet] delta rev ${rev} to ${this.#deps.name(machineId)} not acknowledged within ${FLEET_ACK_MS / 1000} s: sent again on its next heartbeat`
    );
    if (this.#latest.get(machineId) !== requestId) {
      return;
    }
    this.#owed.set(machineId, 0);
    this.#deps.keep(machineId, {
      state: "unacked",
      rev,
      sentAt,
      at: Date.now(),
    });
  }
}
