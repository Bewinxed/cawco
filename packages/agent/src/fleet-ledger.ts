/**
 * What this agent holds of the fleet: every item the hub's deltas carried
 * (core fleet-items.ts), by id, with its hash, and the generation of the
 * desired state it last acknowledged (its `observedGeneration`, core
 * fleet.ts `FLEET_DELTA`), kept on disk before the agent answers each delta
 * as a ledger (core paths/fleet.ts `fleetLedgerFile`) of item ids and
 * hashes. An item that carries files (a skill, a plugin) is a tree in the
 * fleet's pool (fleet-file-pool.ts): its value and its files' paths, each
 * file by the hash of its content, which the pool holds once, however many
 * items carry it. A delta writes what it carried that the pool does not
 * hold, then the ledger; what no item names goes from the pool after a
 * converge. Every other item's value (a server, a setting, a rule, a memory
 * document) stays in the ledger.
 *
 * Measured on obelisk-of-light on 2026-11-26: the file that held all of it
 * before was 34.3 MB for 204 items. Moved, the ledger is 70 KB, and the
 * pool 2,872 files, 25.3 MB (31.7 MB on disk): 145 trees, 0.5 MB, and the
 * 2,874 files they name, 147 of them named more than once. Naming those
 * files in the ledger itself made it 0.53 MB, 470 KB of it names every
 * delta wrote again, so they are in each item's tree, written only when
 * the item moves. Half the pool's files are under the 4 KiB one takes on
 * disk at least: 6 MB of slack, the price of one way to keep a file, each
 * kept once.
 *
 * Beside it, what its harnesses last converged (fleet-converged.ts). An item
 * a delta carries is moved only when its hash is not the one last converged
 * (or a person's Overwrite forces it), so only the parts it moved converge
 * (fleet-parts.ts). Its register says what it holds (`fleetHeld`), through
 * a restart too, so the hub sends only what moved since: an agent that
 * starts again is no full welcome and converges nothing that did not move.
 * A workspace cut before that welcome places its project's rows from here
 * (fleet-converger.ts `placeClone`).
 *
 * Builds before the ledger kept all of it, every file inside, in one file
 * (core paths/fleet.ts `earlierFleetItemsFile`), written whole at each
 * delta. At a start that finds that file written since the ledger was moved
 * from it, it is moved into the ledger again ({@link moveEarlierItems}); it
 * stays as it was while the build before may return (core
 * binary-installation.ts `buildBeforeMayReturn`), since a build rolled back
 * to reads only it and claims what it says, and the hub sends that build
 * what moved since. Once this build is confirmed, it goes.
 */

import { lstat, rm } from "node:fs/promises";
import { buildBeforeMayReturn } from "@cawco/core/binary-installation";
import {
  type FleetDelta,
  type FleetHeld,
  type FleetItemState,
  type FleetItemStatus,
  type FleetSyncReport,
  type MachineFleetConfig,
  type PlacedSection,
  worstFleetState,
} from "@cawco/core/fleet";
import {
  type FleetItems,
  fleetConfigOf,
  itemKind,
  itemKindOf,
  reportKeyOf,
} from "@cawco/core/fleet-items";
import { isRecord } from "@cawco/core/is-record";
import { makeLock } from "@cawco/core/keyed-lock";
import {
  OWN_TOOLS_DEFAULT,
  type OwnTools,
  OwnToolsSchema,
} from "@cawco/core/own-tools";
import {
  earlierFleetItemsFile,
  fleetFilePoolDir,
  fleetLedgerFile,
} from "@cawco/core/paths/fleet";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { SkillFileSchema } from "@cawco/core/stored-shapes";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import {
  type ConvergeBasis,
  type FleetConverged,
  keepConverged,
  readConverged,
} from "./fleet-converged";
import {
  collectPool,
  contentHashOf,
  holdsWhole,
  poolContents,
  readPooled,
} from "./fleet-file-pool";

/** What a delta moved: the items it changed or forced, the ones it took away, and whether the policy is among them. */
export interface DeltaApplied {
  changed: string[];
  policy: boolean;
  removed: string[];
}

/**
 * The fleet's policy item (core fleet-items.ts): the tools its sessions are
 * denied, whether they use CawCo's delegates and plan list or their
 * agent's own (core own-tools.ts; CawCo's on both from a hub before them),
 * and whether usability feedback is on (core usability-feedback.ts; off
 * from a hub before it).
 */
const PolicyItem = z.object({
  deniedTools: z.array(z.string()),
  ownTools: OwnToolsSchema.default(OWN_TOOLS_DEFAULT),
  usabilityFeedback: z.boolean().default(false),
});

/**
 * One file of an item's tree: its content's hash and size in the pool, and
 * the rest of the file as the hub sent it (its path, its execute bit, and
 * any key a newer hub adds) in `file`.
 */
const TreeFileShape = z.object({
  content: z.string(),
  file: z.record(z.string(), z.unknown()),
  size: z.number(),
});
type TreeFile = z.output<typeof TreeFileShape>;

/** An item that carries files, as its tree in the pool holds it: its value but its files, and each of them. */
const TreeShape = z.object({
  files: z.array(TreeFileShape),
  value: z.record(z.string(), z.unknown()),
});

/** What the pool holds, named: the hash of its bytes, and how many there are. */
const PooledShape = z.object({ content: z.string(), size: z.number() });
type Pooled = z.output<typeof PooledShape>;

/** One item as the ledger keeps it: its hash, and its value, or for one that carries files its tree. */
const LedgerItemShape = z.object({
  hash: z.string(),
  tree: PooledShape.optional(),
  value: z.unknown().optional(),
});
type LedgerItem = z.output<typeof LedgerItemShape>;

/** One item as the agent holds it: its hash and value, and for one that carries files, its tree and those files apart from the value. */
interface Held {
  files?: TreeFile[];
  hash: string;
  tree?: Pooled;
  value: unknown;
}

/** The earlier file as the ledger was moved from it: its size and when it was written. */
const EarlierMarkShape = z.object({ mtimeMs: z.number(), size: z.number() });
type EarlierMark = z.output<typeof EarlierMarkShape>;

/** What the ledger file holds ({@link FleetLedger.keep}). */
const LedgerShape = z.object({
  earlier: EarlierMarkShape.optional(),
  forced: z.array(z.string()),
  generation: z.number(),
  items: z.record(z.string(), LedgerItemShape),
});
type Ledger = z.output<typeof LedgerShape>;

/** What builds before the ledger kept, in one file ({@link moveEarlierItems}). */
const EarlierShape = z.object({
  forced: z.array(z.string()),
  generation: z.number(),
  items: z.record(
    z.string(),
    z.object({ hash: z.string(), value: z.unknown() })
  ),
});

/** Where the ledger, its pool and the earlier file lie: this machine's own, or a copy's. */
export interface LedgerPaths {
  earlier: string;
  ledger: string;
  pool: string;
}

const ledgerPaths = (): LedgerPaths => ({
  earlier: earlierFleetItemsFile(),
  ledger: fleetLedgerFile(),
  pool: fleetFilePoolDir(),
});

/** An item value's files, when it carries them: a skill's or a plugin's. */
const CarriesFiles = z.object({ files: z.array(SkillFileSchema.loose()) });

/**
 * Item `value`, of hash `hash`, as the agent holds it: one that carries
 * files with its files apart, each named by its content's hash, and its
 * tree; each file's content and the tree's bytes put in `contents` by their
 * hash, for the pool.
 */
const heldOf = (
  hash: string,
  value: unknown,
  contents: Map<string, Buffer>
): Held => {
  const carried = CarriesFiles.safeParse(value);
  if (!(isRecord(value) && carried.success)) {
    return { hash, value };
  }
  const files: TreeFile[] = [];
  for (const { contentBase64, ...file } of carried.data.files) {
    const bytes = Buffer.from(contentBase64, "base64");
    const content = contentHashOf(bytes);
    contents.set(content, bytes);
    files.push({ content, size: bytes.byteLength, file });
  }
  const rest = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "files")
  );
  const tree = Buffer.from(
    JSON.stringify({ files, value: rest } satisfies z.input<typeof TreeShape>)
  );
  const content = contentHashOf(tree);
  contents.set(content, tree);
  return {
    hash,
    value: rest,
    files,
    tree: { content, size: tree.byteLength },
  };
};

/** Item `held` as the ledger keeps it. */
const ledgerItemOf = ({ hash, tree, value }: Held): LedgerItem =>
  tree ? { hash, tree } : { hash, value };

/** Every content hash `items` name: each one's tree and its files. */
const namedIn = (items: Iterable<Held>): Set<string> => {
  const named = new Set<string>();
  for (const item of items) {
    if (item.tree) {
      named.add(item.tree.content);
    }
    for (const file of item.files ?? []) {
      named.add(file.content);
    }
  }
  return named;
};

/** The earlier file's mark, as it stands now; none when it is not there. */
const markOf = async (path: string): Promise<EarlierMark | undefined> => {
  const found = await lstat(path).catch(() => undefined);
  return found?.isFile()
    ? { mtimeMs: found.mtimeMs, size: found.size }
    : undefined;
};

const sameMark = (a: EarlierMark | undefined, b: EarlierMark): boolean =>
  a?.mtimeMs === b.mtimeMs && a.size === b.size;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const megabytes = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The earlier file at `paths.earlier`, which stands as `mark` says, moved
 * into a ledger at `paths.ledger`: its every file and tree into the pool at
 * `paths.pool`, then the ledger written, marked with `mark`. The earlier
 * file is only read. Answers the ledger and what the pool took; none when
 * the earlier file is not there.
 */
const moveEarlierItems = async (
  paths: LedgerPaths,
  mark: EarlierMark
): Promise<
  { ledger: Ledger; pooled: { bytes: number; files: number } } | undefined
> => {
  const earlier = await readRecord(paths.earlier, EarlierShape);
  if (!earlier) {
    return;
  }
  const contents = new Map<string, Buffer>();
  const ledger: Ledger = {
    earlier: mark,
    forced: earlier.forced,
    generation: earlier.generation,
    items: Object.fromEntries(
      Object.entries(earlier.items).map(([id, { hash, value }]) => [
        id,
        ledgerItemOf(heldOf(hash, value, contents)),
      ])
    ),
  };
  const pooled = await poolContents(paths.pool, contents);
  await writeStateFile(paths.ledger, JSON.stringify(ledger));
  return { ledger, pooled };
};

/** Whether item `id` is of a kind this build knows (core fleet-items.ts `itemKindOf`). */
const isKnown = (id: string): boolean => itemKindOf(id) !== undefined;

export class FleetLedger {
  readonly #paths: LedgerPaths;
  /** Each item held. */
  readonly #items = new Map<string, Held>();
  /** Items a person's Overwrite forced, kept forced until a converge has written them. */
  readonly #forced = new Set<string>();
  /** The generation of the desired state held: none before the first delta this machine ever took. */
  #generation: number | undefined;
  /** The generation the disk keeps: what a delta sent again is judged observed by. */
  #kept: number | undefined;
  /** What the harnesses last converged, as the disk keeps it: the basis every delta's items are judged moved against. */
  #converged: FleetConverged = { items: {} };
  /** The files and trees deltas carried since the last keep, by hash: read from here until that keep puts them in the pool. */
  readonly #unpooled = new Map<string, Buffer>();
  /** Every content hash the items in the ledger on disk name: kept in the pool until a ledger that does not name it is written. */
  #keptNamed = new Set<string>();
  /** The earlier file as the ledger was moved from it, while it stands. */
  #earlier: EarlierMark | undefined;
  /** Each write of the ledger and the pool, and each collection of the pool, one after another, so the last delta's is the one on disk. */
  readonly #writing = makeLock();
  /** Once what the disk keeps is read: the register and every delta wait for it. */
  readonly loaded: Promise<void>;

  constructor(paths: LedgerPaths = ledgerPaths()) {
    this.#paths = paths;
    this.loaded = this.#writing.run(() => this.#load());
  }

  /** What the disk keeps, read: the earlier file moved first when it was written since the ledger was moved from it. */
  async #load(): Promise<void> {
    const converged = await readConverged();
    // An item of a kind this build no longer knows, which an earlier
    // build held (`hubOnly`, gone at wire epoch 9), is neither claimed
    // at the register nor read as owed a converge: no hub this build
    // speaks to sends it, or acts on it.
    this.#converged = {
      ...converged,
      items: Object.fromEntries(
        Object.entries(converged.items).filter(([id]) => isKnown(id))
      ),
    };
    const ledger = await this.#readLedger();
    if (ledger) {
      await this.#hold(ledger);
    }
    await this.#collect();
  }

  /** The ledger on disk, or the earlier file moved into one; none when neither reads (said: the hub then sends every item). */
  async #readLedger(): Promise<Ledger | undefined> {
    const { earlier, ledger: file } = this.#paths;
    let ledger: Ledger | undefined;
    let unread: string | undefined;
    try {
      ledger = await readRecord(file, LedgerShape);
    } catch (error) {
      unread = errorText(error);
    }
    const mark = await markOf(earlier);
    // Written since the ledger was moved from it, or never moved: by a
    // build before the ledger, which is the last that ran.
    const moved =
      mark && !sameMark(ledger?.earlier, mark)
        ? await this.#moveEarlier(mark, ledger !== undefined)
        : undefined;
    if (moved) {
      return moved;
    }
    if (unread !== undefined) {
      console.warn(
        `[fleet] ${file} was not read, so the hub's welcome carries every item: ${unread}`
      );
    }
    return ledger;
  }

  /** The earlier file, which stands as `mark` says, moved into the ledger ({@link moveEarlierItems}); none when it was not (said). */
  async #moveEarlier(
    mark: EarlierMark,
    ledgerRead: boolean
  ): Promise<Ledger | undefined> {
    const { earlier, ledger: file } = this.#paths;
    try {
      const started = Date.now();
      const moved = await moveEarlierItems(this.#paths, mark);
      if (moved) {
        console.info(
          `[fleet] ${earlier} (${megabytes(mark.size)}, ${Object.keys(moved.ledger.items).length} items) is moved into ${file} and its pool, which took ${moved.pooled.files} file(s), ${megabytes(moved.pooled.bytes)}, in ${Date.now() - started} ms`
        );
      }
      return moved?.ledger;
    } catch (error) {
      console.warn(
        `[fleet] ${earlier} was not moved into ${file}${ledgerRead ? ", so the ledger is read as it stands" : ""}: ${errorText(error)}`
      );
    }
  }

  /** `ledger` held: each item whose tree and files the pool holds whole, so one it lost is claimed no more and the hub sends it again. */
  async #hold(ledger: Ledger): Promise<void> {
    this.#generation = ledger.generation;
    this.#kept = ledger.generation;
    this.#earlier = ledger.earlier;
    const lost: string[] = [];
    for (const [id, item] of Object.entries(ledger.items)) {
      if (!isKnown(id)) {
        continue;
      }
      const held = item.tree
        ? await this.#treeHeld(item.hash, item.tree)
        : { hash: item.hash, value: item.value };
      if (held) {
        this.#items.set(id, held);
      } else {
        lost.push(id);
      }
    }
    this.#keptNamed = namedIn(this.#items.values());
    for (const id of ledger.forced) {
      if (this.#items.has(id)) {
        this.#forced.add(id);
      }
    }
    if (lost.length > 0) {
      console.warn(
        `[fleet] the pool does not hold every file of ${lost.join(", ")}, so they are not claimed and the hub's welcome carries them again`
      );
    }
  }

  /** The item of hash `hash` whose tree is `tree`, read from the pool; none when the pool does not hold it, or each of its files, whole. */
  async #treeHeld(hash: string, tree: Pooled): Promise<Held | undefined> {
    const { pool } = this.#paths;
    try {
      if (!(await holdsWhole(pool, tree.content, tree.size))) {
        return;
      }
      const read = TreeShape.safeParse(
        JSON.parse(readPooled(pool, tree.content).toString("utf8"))
      );
      if (!read.success) {
        return;
      }
      for (const { content, size } of read.data.files) {
        if (!(await holdsWhole(pool, content, size))) {
          return;
        }
      }
      return { hash, value: read.data.value, files: read.data.files, tree };
    } catch (error) {
      console.warn(
        `[fleet] the tree ${tree.content} was not read from ${pool}: ${errorText(error)}`
      );
    }
  }

  /**
   * In a turn of {@link #writing}: each file of the pool that neither an
   * item held nor the ledger on disk names taken away, then the earlier
   * file, once the build before cannot return. Never throws: what fails is
   * said, and the next collection tries again.
   */
  async #collect(): Promise<void> {
    try {
      const named = new Set([
        ...this.#keptNamed,
        ...namedIn(this.#items.values()),
        ...this.#unpooled.keys(),
      ]);
      const gone = await collectPool(this.#paths.pool, named);
      if (gone.files > 0) {
        console.info(
          `[fleet] ${gone.files} file(s) no fleet item names, ${megabytes(gone.bytes)}, are taken out of ${this.#paths.pool}`
        );
      }
    } catch (error) {
      console.warn(
        `[fleet] ${this.#paths.pool} was not cleared of the files no item names: ${errorText(error)}`
      );
    }
    await this.#dropEarlier();
  }

  /** The earlier file the ledger was moved from, removed once the build before cannot return; one written since is left, for the next start to move. */
  async #dropEarlier(): Promise<void> {
    const moved = this.#earlier;
    if (!moved) {
      return;
    }
    const { earlier } = this.#paths;
    try {
      if (await buildBeforeMayReturn()) {
        return;
      }
      if (sameMark(await markOf(earlier), moved)) {
        await rm(earlier, { force: true });
        console.info(
          `[fleet] ${earlier}, which builds before the ledger read, is removed: this build is confirmed`
        );
      }
      this.#earlier = undefined;
    } catch (error) {
      console.warn(
        `[fleet] ${earlier} stays for now, as whether the build before may return was not read: ${errorText(error)}`
      );
    }
  }

  /** What the register says this agent holds; none before the first delta it ever took. */
  held(): FleetHeld | undefined {
    return this.#generation === undefined
      ? undefined
      : {
          observedGeneration: this.#generation,
          items: Object.fromEntries(
            [...this.#items].map(([id, { hash }]) => [id, hash])
          ),
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

  /** The fleet's policy as held now; none before a delta carried it. */
  get policy():
    | { deniedTools: string[]; ownTools: OwnTools; usabilityFeedback: boolean }
    | undefined {
    return PolicyItem.safeParse(this.#items.get("policy")?.value).data;
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
      ...[...this.#items]
        .filter(([id, { hash }]) => converged[id] !== hash)
        .map(([id]) => id),
      ...Object.keys(converged).filter((id) => !this.#items.has(id)),
    ].filter((id) => id !== "policy");
  }

  /** The converge of every generation up to `generation` has ended: kept on disk. */
  convergedTo(generation: number): void {
    if (this.#converged.generation === generation) {
      return;
    }
    this.#keepConverged({ ...this.#converged, generation });
  }

  /** What the last converge of every part ran as (fleet-converged.ts `build`, `homes`). */
  get convergedBasis(): Pick<FleetConverged, "build" | "homes"> {
    return { build: this.#converged.build, homes: this.#converged.homes };
  }

  /** The report the machine last sent, as the disk keeps it; none before its first converge. */
  get report(): FleetSyncReport | undefined {
    return this.#converged.report;
  }

  /**
   * Holds `delta`'s items: each whose hash is not the one last converged, or
   * that is forced, as moved; each it takes away, and for a whole one each
   * held or converged that it does not name, as removed. The files they
   * carry are held in memory until the next {@link keep} puts them in the
   * pool.
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
        this.#forced.delete(item.id);
        continue;
      }
      if (item.force) {
        this.#forced.add(item.id);
      }
      if (converged[item.id] !== item.hash || item.force) {
        changed.push(item.id);
      }
      this.#items.set(item.id, heldOf(item.hash, item.value, this.#unpooled));
    }
    if (delta.full) {
      for (const id of new Set([
        ...this.#items.keys(),
        ...Object.keys(converged),
      ])) {
        if (!named.has(id)) {
          this.#items.delete(id);
          this.#forced.delete(id);
          removed.push(id);
        }
      }
    }
    this.#generation = delta.generation;
    return { changed, removed, policy: changed.includes("policy") };
  }

  /**
   * What is held now, kept on disk, after every write begun before: the
   * files and trees deltas carried since the last keep that the pool does
   * not hold, then the ledger. What the agent's answer to a delta waits on (ACK means
   * kept), and what its next start reads back.
   */
  keep(): Promise<void> {
    const generation = this.#generation ?? 0;
    const held = [...this.#items.values()];
    const ledger: Ledger = {
      ...(this.#earlier ? { earlier: this.#earlier } : {}),
      generation,
      forced: [...this.#forced],
      items: Object.fromEntries(
        [...this.#items].map(([id, item]) => [id, ledgerItemOf(item)])
      ),
    };
    const text = JSON.stringify(ledger);
    const contents = new Map(this.#unpooled);
    return this.#writing.run(async () => {
      await poolContents(this.#paths.pool, contents);
      await writeStateFile(this.#paths.ledger, text);
      for (const hash of contents.keys()) {
        this.#unpooled.delete(hash);
      }
      this.#keptNamed = namedIn(held);
      this.#kept = generation;
    });
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
    return this.#items.get(id)?.hash ?? "";
  }

  /**
   * The config the harnesses converge, joined from the items held, each
   * still-forced item forced, every file's content read now: from the
   * pool, or for a delta not yet kept from memory.
   */
  config(): MachineFleetConfig {
    const read = new Map<string, string>();
    const contentOf = (id: string, hash: string): string => {
      let base64 = read.get(hash);
      if (base64 === undefined) {
        const bytes = this.#unpooled.get(hash) ?? this.#pooled(id, hash);
        base64 = bytes.toString("base64");
        read.set(hash, base64);
      }
      return base64;
    };
    const items: FleetItems = new Map(
      [...this.#items].map(([id, { files, value: kept }]) => {
        const value =
          files && isRecord(kept)
            ? {
                ...kept,
                files: files.map(({ content, file }) => ({
                  ...file,
                  contentBase64: contentOf(id, content),
                })),
              }
            : kept;
        return [id, this.#forcedAs(id, value)];
      })
    );
    return fleetConfigOf(items);
  }

  /**
   * The config of the items held that carry no files (MCP servers, harness
   * settings, hooks, memory documents, the policy, checkouts), from the
   * ledger alone, each still-forced item forced: no skill or plugin that
   * carries files is in it, and no file is read. What a caller that needs
   * no file reads, in place of {@link config}.
   */
  fileless(): MachineFleetConfig {
    return fleetConfigOf(
      new Map(
        [...this.#items]
          .filter(([, { files }]) => !files)
          .map(([id, { value }]) => [id, this.#forcedAs(id, value)])
      )
    );
  }

  /** Item `id`'s `value`, with `force` on it while a person's Overwrite has not been converged. */
  #forcedAs(id: string, value: unknown): unknown {
    return this.#forced.has(id) && value && typeof value === "object"
      ? { ...value, force: true }
      : value;
  }

  /** The bytes of item `id`'s file of content `hash`, from the pool; one the pool lost is thrown, naming the item. */
  #pooled(id: string, hash: string): Buffer {
    try {
      return readPooled(this.#paths.pool, hash);
    } catch (error) {
      throw new Error(
        `fleet item ${id}'s file ${hash} was not read from ${this.#paths.pool}: ${errorText(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * A converge came to `statuses` over `pass.ids` and to `report`, and every
   * generation up to `generation` has converged: a force on any of them is
   * spent, each that came out ok is converged at its hash, each no longer
   * held is converged away, and the report is the one kept; `basis`, what
   * a converge of every part ran as, when this one was. A converge of every
   * part (`pass.all`) took away whatever the machine no longer holds, so
   * every item the record names that is not held is converged away, not
   * only the ones in `pass.ids` (the held items). Kept on disk; a write
   * that fails is said, and the next converge writes again. Then the pool
   * is cleared of every file no item names.
   */
  converged(
    pass: { all: boolean; ids: readonly string[] },
    statuses: readonly FleetItemStatus[],
    report: FleetSyncReport | undefined,
    generation: number,
    basis?: ConvergeBasis
  ): void {
    const items = { ...this.#converged.items };
    for (const id of pass.ids) {
      this.#forced.delete(id);
    }
    for (const id of pass.all ? Object.keys(items) : pass.ids) {
      if (!this.#items.has(id)) {
        delete items[id];
      }
    }
    for (const status of statuses) {
      if (status.state === "ok" && this.#items.has(status.id)) {
        items[status.id] = status.hash;
      }
    }
    const { build, homes } = basis ?? this.#converged;
    this.#keepConverged({
      ...(build ? { build } : {}),
      ...(homes ? { homes } : {}),
      generation,
      items,
      report: report ?? this.#converged.report,
    });
    this.#writing.run(() => this.#collect());
  }

  /** The policy held now was written (denied-tools.ts `applyFleetDenials`): converged at its hash. */
  policyWritten(): void {
    const hash = this.#items.get("policy")?.hash;
    if (hash === undefined || this.#converged.items.policy === hash) {
      return;
    }
    this.#keepConverged({
      ...this.#converged,
      items: { ...this.#converged.items, policy: hash },
    });
  }

  /** `report` is the machine's last one sent: a status read, or a clone's placement laid over the last. */
  reported(report: FleetSyncReport): void {
    this.#keepConverged({ ...this.#converged, report });
  }

  #keepConverged(converged: FleetConverged): void {
    this.#converged = converged;
    keepConverged(converged).catch((error: unknown) =>
      console.warn(
        `[fleet] what the machine converged was not kept on disk, so its next start converges those items again: ${errorText(error)}`
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
  ledger: FleetLedger,
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
      hash: ledger.hashOf(id),
      ms,
      ...(error
        ? { state: "failed" as const, error }
        : { state: "ok" as const }),
    };
  });
