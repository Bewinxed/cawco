/**
 * The page's mirror of the artifact's doc, whose Yjs doc the overlay's
 * worker holds (doc-worker.ts): its maps of plain values (core doc-maps.ts
 * `MIRRORED_MAPS`), read at once, as the page drew from the doc itself.
 * The page's writes stand here at once and go to the worker in one batch a
 * transaction; the worker's report of each transaction (the hub's, the
 * device's, its own sweep, the page's echoed) comes back to it. A key the
 * page wrote again since the batch the report was made after keeps the
 * page's value until the worker has that write: the doc's value after it
 * comes in a later report. It is a core `MapDoc`, so the comment helpers
 * (core comments.ts) write through it as through a Yjs doc.
 */
import type { DocMap, MapChange, MapDoc } from "@cawco/core/doc-maps";
import type { ChangeOrigin, FromWorker, WriteOp } from "./doc-wire";

type Watcher = (change: MapChange) => void;

/** One mirrored map: its values, and its watchers. */
class MirrorMap<T> implements DocMap<T> {
  readonly held = new Map<string, T>();
  readonly watchers = new Set<Watcher>();
  readonly #name: string;
  readonly #mirror: Mirror;

  constructor(name: string, mirror: Mirror) {
    this.#name = name;
    this.#mirror = mirror;
  }

  get size(): number {
    return this.held.size;
  }

  get(key: string): T | undefined {
    return this.held.get(key);
  }

  has(key: string): boolean {
    return this.held.has(key);
  }

  keys(): IterableIterator<string> {
    return this.held.keys();
  }

  values(): IterableIterator<T> {
    return this.held.values();
  }

  entries(): IterableIterator<[string, T]> {
    return this.held.entries();
  }

  toJSON(): Record<string, T> {
    return Object.fromEntries(this.held);
  }

  set(key: string, value: T): T {
    this.#mirror.write({ map: this.#name, key, value });
    return value;
  }

  delete(key: string): void {
    if (this.held.has(key)) {
      this.#mirror.write({ map: this.#name, key, deleted: true });
    }
  }

  observe(watcher: Watcher): void {
    this.watchers.add(watcher);
  }

  unobserve(watcher: Watcher): void {
    this.watchers.delete(watcher);
  }
}

/** The changes report the worker sends. */
type Changes = Extract<FromWorker, { type: "changes" }>;

/** Whether two plain values hold the same data. */
const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** Of each origin, whether the page counts it its own, as a Yjs transaction's `local` says. */
const LOCAL: Record<ChangeOrigin, boolean> = {
  page: true,
  local: true,
  replica: true,
  kept: false,
  remote: false,
  seed: false,
};

export class Mirror implements MapDoc {
  readonly #maps = new Map<string, MirrorMap<unknown>>();
  /** The writes of the transaction running now, and the keys it changed. */
  #batch: { changed: Map<string, Set<string>>; ops: WriteOp[] } | null = null;
  #seq = 0;
  /** Each key's last write by the page, by the batch it went in. */
  readonly #pending = new Map<string, number>();
  /** Which doc of the worker's this mirrors. */
  generation = 0;
  readonly #send: (ops: WriteOp[], seq: number) => void;

  constructor(send: (ops: WriteOp[], seq: number) => void) {
    this.#send = send;
  }

  getMap<T = unknown>(name: string): DocMap<T> {
    let map = this.#maps.get(name);
    if (!map) {
      map = new MirrorMap<unknown>(name, this);
      this.#maps.set(name, map);
    }
    return map as unknown as DocMap<T>;
  }

  /** `writes` as one transaction: one batch to the worker, and one change heard by each map's watchers. A transaction inside another is part of it. */
  transact(writes: () => void, origin: unknown = null): void {
    if (this.#batch) {
      writes();
      return;
    }
    const batch: { changed: Map<string, Set<string>>; ops: WriteOp[] } = {
      changed: new Map(),
      ops: [],
    };
    this.#batch = batch;
    try {
      writes();
    } finally {
      this.#batch = null;
    }
    if (batch.ops.length > 0) {
      this.#seq += 1;
      for (const op of batch.ops) {
        this.#pending.set(`${op.map}\u0000${op.key}`, this.#seq);
      }
      this.#send(batch.ops, this.#seq);
    }
    this.#tell(batch.changed, { local: true, origin });
  }

  /** One write of the page's, in the transaction running now or one of its own. */
  write(op: WriteOp): void {
    const batch = this.#batch;
    if (!batch) {
      this.transact(() => this.write(op));
      return;
    }
    const map = this.getMap(op.map) as unknown as MirrorMap<unknown>;
    if ("deleted" in op) {
      map.held.delete(op.key);
    } else {
      map.held.set(op.key, op.value);
    }
    batch.ops.push(op);
    let keys = batch.changed.get(op.map);
    if (!keys) {
      keys = new Set();
      batch.changed.set(op.map, keys);
    }
    keys.add(op.key);
  }

  /** The worker's report of one transaction on the doc this mirrors. */
  heard(changes: Changes): void {
    if (changes.generation !== this.generation) {
      return;
    }
    const changed = new Map<string, Set<string>>();
    const take = (name: string, key: string, value: unknown, gone: boolean) => {
      const pendingKey = `${name}\u0000${key}`;
      const wrote = this.#pending.get(pendingKey);
      if (wrote !== undefined && wrote > changes.seq) {
        return;
      }
      this.#pending.delete(pendingKey);
      const map = this.getMap(name) as unknown as MirrorMap<unknown>;
      if (gone ? !map.held.has(key) : same(map.held.get(key), value)) {
        return;
      }
      if (gone) {
        map.held.delete(key);
      } else {
        map.held.set(key, value);
      }
      let keys = changed.get(name);
      if (!keys) {
        keys = new Set();
        changed.set(name, keys);
      }
      keys.add(key);
    };
    for (const [name, values] of Object.entries(changes.set)) {
      for (const [key, value] of Object.entries(values)) {
        take(name, key, value, false);
      }
    }
    for (const [name, keys] of Object.entries(changes.deleted)) {
      for (const key of keys) {
        take(name, key, undefined, true);
      }
    }
    this.#tell(changed, {
      local: LOCAL[changes.origin],
      origin: changes.origin,
    });
  }

  /** Empty, mirroring the worker's doc `generation`, its page's writes before it forgotten. */
  reset(generation: number): void {
    this.generation = generation;
    this.#pending.clear();
    for (const map of this.#maps.values()) {
      map.held.clear();
    }
  }

  #tell(
    changed: Map<string, Set<string>>,
    transaction: MapChange["transaction"]
  ): void {
    for (const [name, keys] of changed) {
      const map = this.#maps.get(name);
      for (const watcher of map?.watchers ?? []) {
        watcher({ keysChanged: keys, transaction });
      }
    }
  }
}
