/**
 * The fleet's config to each machine, as acknowledged deltas (core fleet.ts
 * `FLEET_DELTA`, core fleet-items.ts), in Kubernetes' generation and
 * observedGeneration (github.com/kubernetes/community,
 * sig-architecture/api-conventions.md: "a sequence number representing a
 * specific generation of the desired state … monotonically increasing").
 *
 * The hub keeps, per machine, a generation and the fingerprint of what the
 * machine was to hold at it (`agents.fleet_generation`, through a restart),
 * and the hash of every item the machine acknowledged holding. A register
 * is answered at once with a welcome: the items that differ from what its
 * register says it holds (`FleetHeld`, which the agent keeps on disk),
 * every item for an agent that never held any; its answer (READY) marks the
 * machine online. Every fleet change is one {@link FleetSync.changed}:
 * 250 ms after the last, each machine's config is built again and diffed
 * against what it acknowledged, and only the items whose hash moved go, a
 * machine whose items did not move being sent nothing. The generation rises
 * only when what the machine is to hold moved, or a person asked it to act
 * (a Sync, a Retry, an Overwrite).
 *
 * One delta is in flight per machine: a change while it is waits until it
 * is answered. Each is said `sent` once it is on the connection; one not
 * answered within {@link FLEET_ACK_MS} is said `unacked` and sent again,
 * the same generation and payload under the same request (the agent's
 * request record answers it once), until it is answered or the machine's
 * connection closes; a refusal (NACK, in the agent's words) is kept and
 * the machine's config sent again on a heartbeat a minute later. What its
 * items come to as the machine's harnesses converge them arrives item by
 * item (`fleet_converge`) and is kept on the row too (`agents.fleet_items`).
 *
 * A person's Overwrite ({@link FleetSync.force}) sends the item forced
 * whether or not it moved, and the agent keeps it forced until a converge
 * has written it, whatever delta comes meanwhile.
 */
import {
  type ControlResultFrame,
  FLEET_ACK_MS,
  type FleetAck,
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
  /** The machine's generation as kept, and the fingerprint of what it was to hold at it. */
  generation: (machineId: string) => {
    fingerprint: string | null;
    generation: number;
  };
  /** Keeps the machine's delta outcome on its row and tells every dashboard. */
  keep: (machineId: string, outcome: FleetSyncOutcome) => void;
  /** Keeps the machine's generation and the fingerprint of what it is to hold at it. */
  keepGeneration: (
    machineId: string,
    generation: number,
    fingerprint: string
  ) => void;
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
  /** Puts the delta on the machine's connection under `requestId` (the same again for a resend); false when it has none. */
  send: (machineId: string, requestId: string, delta: FleetDelta) => boolean;
}

/** What a send asks beyond the items that moved. */
interface Ask {
  recheck?: true;
  reconverge?: true;
  why: string;
}

interface InFlight {
  /** The delta as sent, sent again as it is. */
  delta: FleetDelta;
  /** Each item it carried, by id, with its hash; `null` for one it took away. */
  items: Map<string, string | null>;
  machineId: string;
  requestId: string;
  sentAt: number;
  /** How many times it went unanswered for {@link FLEET_ACK_MS}. */
  silences: number;
  timer?: HubTimer;
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
 * (78 MB, the register's largest cost after its reads on a copy of the
 * live database).
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
 * holds (measured on a copy of the live database, 2026-10-23).
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

/** One hash of every item's: what the machine is to hold, told apart from the last build of it. */
const fingerprintOf = (desired: FleetItems): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const id of [...desired.keys()].sort()) {
    hasher.update(`${id}\0${hashOf(id, desired.get(id))}\n`);
  }
  return hasher.digest("hex");
};

export class FleetSync {
  readonly #deps: FleetSyncDeps;
  /** What each machine acknowledged holding: item id → hash. */
  readonly #acked = new Map<string, Map<string, string>>();
  /** Each machine's one delta in flight, by machine. */
  readonly #inFlight = new Map<string, InFlight>();
  /** Machines whose last delta was refused, with when: sent again on a heartbeat after {@link NACK_AGAIN_MS}. */
  readonly #owed = new Map<string, number>();
  /** The items a person's Overwrite forces on each machine, until a delta carrying them is acknowledged. */
  readonly #forced = new Map<string, Set<string>>();
  /** The changes gathered for the next build, by machine (`*`: every machine). */
  readonly #gathered = new Map<string, Ask[]>();
  /** The changes that came for a machine while its delta was in flight: sent once it is answered. */
  readonly #waiting = new Map<string, Ask[]>();
  #debounce: HubTimer | undefined;
  /** The machines that answered their welcome on their current connection: the ones a fleet change goes to. */
  readonly #ready = new Set<string>();

  constructor(deps: FleetSyncDeps) {
    this.#deps = deps;
  }

  /** Whether the machine answered its welcome on its current connection. */
  isReady(machineId: string): boolean {
    return this.#ready.has(machineId);
  }

  /** Whether the hub waits on `requestId` as a machine's delta. */
  has(requestId: string): boolean {
    return [...this.#inFlight.values()].some(
      (sent) => sent.requestId === requestId
    );
  }

  /**
   * A machine registered: its welcome goes now, the items that differ from
   * what it says it holds (every item when it holds none), the policy among
   * them, under its generation, or the one it says it observed if that is
   * later (a hub whose rows were lost). Its answer marks it online
   * ({@link FleetSyncDeps.ready}).
   */
  welcome(machineId: string, held: FleetHeld | undefined): void {
    this.#acked.set(machineId, new Map(Object.entries(held?.items ?? {})));
    this.#owed.delete(machineId);
    const kept = this.#deps.generation(machineId);
    if (held && held.observedGeneration > kept.generation) {
      this.#deps.keepGeneration(
        machineId,
        held.observedGeneration,
        kept.fingerprint ?? ""
      );
    }
    this.#sendDiff(
      machineId,
      {
        why: held
          ? `its welcome (it keeps gen ${held.observedGeneration})`
          : "its welcome",
      },
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

  /** The machine's heartbeat: a delta it refused a minute ago or more goes again. */
  heartbeat(machineId: string): void {
    const refusedAt = this.#owed.get(machineId);
    if (refusedAt === undefined || Date.now() - refusedAt < NACK_AGAIN_MS) {
      return;
    }
    this.#owed.delete(machineId);
    this.#sendDiff(
      machineId,
      { why: "sent again: the last delta was refused" },
      { welcome: !this.#ready.has(machineId), full: false }
    );
  }

  /**
   * The machine answered `requestId`: its ACK with the generation it kept
   * (READY for a welcome), or its refusal in its own words. Answers whether
   * the hub waited on it. Either way the changes that waited behind it go.
   */
  answered(requestId: string, result: ControlResultFrame): boolean {
    const sent = [...this.#inFlight.values()].find(
      (one) => one.requestId === requestId
    );
    if (!sent) {
      return false;
    }
    const { machineId, delta, sentAt } = sent;
    this.#inFlight.delete(machineId);
    this.#deps.lifetime.cancel(sent.timer);
    const name = this.#deps.name(machineId);
    const took = seconds(Date.now() - sentAt);
    const what = `${delta.welcome ? "welcome" : "delta"} gen ${delta.generation}`;
    const observed = (result.result as Partial<FleetAck> | undefined)
      ?.observedGeneration;
    if (
      !result.ok ||
      typeof observed !== "number" ||
      observed < delta.generation
    ) {
      const error = result.ok
        ? `the machine answered gen ${delta.generation} keeping gen ${String(observed)}`
        : (result.error ??
          result.refusal?.message ??
          "the machine refused the delta and said nothing");
      console.warn(`[fleet] ${what} refused by ${name} (${took}): ${error}`);
      this.#owed.set(machineId, Date.now());
      this.#deps.keep(machineId, {
        state: "nacked",
        generation: delta.generation,
        sentAt,
        at: Date.now(),
        error,
      });
      this.#sendWaiting(machineId);
      return true;
    }
    this.#hold(machineId, sent);
    console.info(
      `[fleet] ${what} acknowledged by ${name} (${took}, ${sent.items.size} item(s)${sent.silences > 0 ? `, after ${sent.silences} send(s) again` : ""})`
    );
    if (delta.welcome && !this.#ready.has(machineId)) {
      this.#ready.add(machineId);
      this.#deps.ready(machineId);
    }
    this.#owed.delete(machineId);
    this.#deps.keep(machineId, {
      state: "acked",
      generation: delta.generation,
      sentAt,
      at: Date.now(),
    });
    this.#sendWaiting(machineId);
    return true;
  }

  /** The machine's word on items as its harnesses converge them: kept on its row. */
  converged(machineId: string, items: readonly FleetItemStatus[]): void {
    const kept = { ...this.#deps.keptItems(machineId) };
    for (const item of items) {
      kept[item.id] = item;
    }
    this.#deps.keepItems(machineId, kept);
  }

  /** A person's Retry of failed items on a machine: sent forced, so they converge again. */
  retry(machineId: string, ids: string[]): void {
    this.force(machineId, ids);
    this.changed(
      ids.length === 1
        ? `a retry of ${ids[0]}`
        : `a retry of ${ids.length} items`,
      { machineId }
    );
  }

  /** The machine's connection closed: nothing on it answers now, and its next register is welcomed. */
  gone(machineId: string): void {
    const sent = this.#inFlight.get(machineId);
    if (sent) {
      this.#deps.lifetime.cancel(sent.timer);
      this.#inFlight.delete(machineId);
    }
    this.#waiting.delete(machineId);
    this.#owed.delete(machineId);
    this.#ready.delete(machineId);
  }

  /** What an acknowledged delta carried is what the machine holds now; its forces are spent. */
  #hold(machineId: string, sent: InFlight): void {
    const acked = sent.delta.full
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
      if (this.#inFlight.has(machineId)) {
        this.#waiting.set(machineId, [
          ...(this.#waiting.get(machineId) ?? []),
          ...asks,
        ]);
        continue;
      }
      this.#sendAsks(machineId, asks);
    }
  }

  /** The changes that waited behind the machine's answered delta, sent now as one. */
  #sendWaiting(machineId: string): void {
    const asks = this.#waiting.get(machineId);
    this.#waiting.delete(machineId);
    if (asks && this.#ready.has(machineId)) {
      this.#sendAsks(machineId, asks);
    }
  }

  #sendAsks(machineId: string, asks: readonly Ask[]): void {
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

  /**
   * The items that moved for `machineId` since what it acknowledged, and
   * the ones it is to hold no more, forced ones among them, sent as one
   * delta: nothing at all when nothing moved and nothing more was asked.
   * Under the machine's generation, raised when what it is to hold moved
   * since the last, or a person asked it to act.
   */
  #sendDiff(
    machineId: string,
    ask: Ask,
    how: { full: boolean; welcome: boolean }
  ): void {
    const name = this.#deps.name(machineId);
    const kept = this.#deps.generation(machineId);
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
        generation: kept.generation,
        sentAt: at,
        at,
        error: `The hub could not build this machine's config: ${words}`,
      });
      return;
    }
    const forced = this.#forced.get(machineId) ?? new Set<string>();
    const items = diffItems(
      desired,
      how.full ? new Map() : (this.#acked.get(machineId) ?? new Map()),
      forced,
      how.full
    );
    if (items.length === 0 && !how.welcome && !ask.recheck && !ask.reconverge) {
      console.info(`[fleet] no delta for ${name}: nothing moved (${ask.why})`);
      return;
    }
    const fingerprint = fingerprintOf(desired);
    const acts =
      Boolean(ask.recheck || ask.reconverge) ||
      items.some((item) => item.force);
    const generation =
      fingerprint !== kept.fingerprint || acts
        ? kept.generation + 1
        : kept.generation;
    if (generation !== kept.generation || fingerprint !== kept.fingerprint) {
      this.#deps.keepGeneration(machineId, generation, fingerprint);
    }
    const delta: FleetDelta = {
      generation,
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
    this.#inFlight.set(machineId, {
      machineId,
      requestId,
      delta,
      sentAt,
      silences: 0,
      items: new Map(
        items.map((item) => [item.id, item.value === null ? null : item.hash])
      ),
      timer: this.#deps.lifetime.after(FLEET_ACK_MS, () =>
        this.#unacked(machineId, requestId)
      ),
    });
    console.info(
      `[fleet] ${how.welcome ? "welcome" : "delta"} gen ${generation} sent → ${name}: ${items.length} item(s)${how.full ? " (all it holds)" : ""}; ${ask.why}`
    );
    this.#deps.keep(machineId, {
      state: "sent",
      generation,
      sentAt,
      why: ask.why,
    });
  }

  /** {@link FLEET_ACK_MS} passed with no answer: said, and the same delta sent again under the same request. */
  #unacked(machineId: string, requestId: string): void {
    const sent = this.#inFlight.get(machineId);
    if (sent?.requestId !== requestId) {
      return;
    }
    sent.silences += 1;
    const { delta, sentAt } = sent;
    const name = this.#deps.name(machineId);
    if (!this.#deps.send(machineId, requestId, delta)) {
      // No link: its next register is welcomed.
      this.#inFlight.delete(machineId);
      return;
    }
    console.warn(
      `[fleet] gen ${delta.generation} sent again → ${name}: not acknowledged within ${(FLEET_ACK_MS / 1000) * sent.silences} s`
    );
    sent.timer = this.#deps.lifetime.after(FLEET_ACK_MS, () =>
      this.#unacked(machineId, requestId)
    );
    if (sent.silences === 1) {
      this.#deps.keep(machineId, {
        state: "unacked",
        generation: delta.generation,
        sentAt,
        at: Date.now(),
      });
    }
  }
}
