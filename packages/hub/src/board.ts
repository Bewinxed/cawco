/**
 * THE BOARD: every session the board lists, and every machine's facts,
 * live status and inventory, kept in memory as keyed collections, each
 * entry laid again only when what it is made of moves, and every dashboard
 * told only what moved.
 *
 * What moves an entry comes two ways, and neither is a call to "publish":
 * - a write to a table the board reads: the database's own change log
 *   (db/board-log.ts) names the kind and key of every row a write moved,
 *   and the board takes it on the turn after any write, whoever wrote it;
 * - what the database does not hold (a machine's socket, a held session, a
 *   send queued, a stall, a preview): its keeper names the entries it moved
 *   through this module's typed events ({@link BoardShape}).
 * A beat that moves nothing moves no entry, and sends nothing; a quiet fleet
 * sends nothing at all. Nothing on the board is a value that changes as time
 * passes (a keep-alive's deadline goes, not a state read off the clock), so
 * nothing needs laying again for time alone, but a row ageing out of the
 * listing, which leaves at its own time ({@link scheduleAgeOut}).
 *
 * Each change takes a version (one numbering per hub run): a dashboard that
 * reconnects names the version it holds and is sent what moved since.
 *
 * One of the hub's services, built once from its layer (hub-layer.ts). What
 * it reads of the keepers the hub's closure makes, and whom it tells what
 * moved, it is handed as it starts ({@link BoardKeepers}).
 */
import type { BoardChanges, BoardKeyed } from "@cawco/core/frames";
import { syncSection } from "@cawco/core/loop-watch";
import type {
  AgentRow,
  InstanceRow,
  MachineFacts,
  MachineInventory,
  MachineStatus,
  SessionCustody,
} from "@cawco/core/protocol";
import { Context, Effect, Layer } from "effect";
import { withAncestors } from "./board-ancestors";
import {
  type BoardKeepers,
  type BoardList,
  type BoardListValues,
  type BoardRow,
  type BoardShape,
  laidRow,
} from "./board-shape";
import { DamagedRecords, type DamagedRecordsShape } from "./damaged-rows";
import { Db, type DbShape } from "./db";
import type { BoardChangeKind } from "./db/board-log";
import type { BoardInstanceRow } from "./db/instances";
import { listedAt, listedUntil } from "./db/instances";
import type { OwedMove } from "./db/owed-moves";
import { HandoverState } from "./handover-state";
import { Laws } from "./laws";
import { HubLifetime, type HubLifetimeShape, type HubTimer } from "./lifetime";
import { MachineRuntime } from "./machine-runtime";
import { previewTargets } from "./preview";
import { Registry, type RegistryShape } from "./registry";
import { SessionRuntime } from "./session-runtime";
import { speaksContract } from "./speaks-contract";
import { createViewChanges, VIEW_OF } from "./views/changes";
import { isHubParent } from "./work-item-state";

/** What the board reads of the hub's services, each when it lays an entry: what its layer builds it from. */
interface BoardDeps {
  damagedRecords: DamagedRecordsShape;
  db: DbShape;
  heldSessions: SessionRuntime["Service"]["heldSessions"];
  laws: Laws["Service"];
  lifetime: HubLifetimeShape;
  machinePresence: HandoverState["Service"]["machinePresence"];
  machines: Pick<
    MachineRuntime["Service"],
    "agentProtocols" | "binaryUpdateStates" | "machineCustody"
  >;
  registry: RegistryShape;
}

/** How many removals a collection keeps the version of, for a page that reconnects. */
const REMOVALS_KEPT = 10_000;

/**
 * One keyed collection: each entry by its key, with the version it last
 * moved at, and the keys that went with the version they went at, so a
 * page that names a version is sent what moved after it. `floor`: the
 * oldest version a removal is still known from; a page holding one before
 * it is sent the board whole.
 */
class Keyed<Entry> {
  readonly entries = new Map<string, Entry>();
  readonly #at = new Map<string, number>();
  readonly #gone = new Map<string, number>();
  floor = 0;

  /**
   * `entry` laid at `version`; whether it moved. An entry laid as it is held
   * moves nothing: no frame carries it and nothing that follows a move is
   * told of it (a pulse that relaid a session's row unchanged once read
   * Needs you's whole lane again).
   */
  put(key: string, entry: Entry, version: number): boolean {
    const held = this.entries.get(key);
    if (held !== undefined && Bun.deepEquals(held, entry)) {
      return false;
    }
    this.entries.set(key, entry);
    this.#at.set(key, version);
    this.#gone.delete(key);
    return true;
  }

  /** Whether the key was held. */
  drop(key: string, version: number): boolean {
    if (!this.entries.delete(key)) {
      return false;
    }
    this.#at.delete(key);
    this.#gone.set(key, version);
    if (this.#gone.size > REMOVALS_KEPT) {
      const [oldest, at] = this.#gone.entries().next().value ?? [];
      if (oldest !== undefined && at !== undefined) {
        this.#gone.delete(oldest);
        this.floor = Math.max(this.floor, at);
      }
    }
    return true;
  }

  /** What moved after `version`. */
  since(version: number): BoardKeyed<Entry> {
    const upserts: Entry[] = [];
    for (const [key, at] of this.#at) {
      const entry = this.entries.get(key);
      if (at > version && entry !== undefined) {
        upserts.push(entry);
      }
    }
    const removed: string[] = [];
    for (const [key, at] of this.#gone) {
      if (at > version) {
        removed.push(key);
      }
    }
    return { upserts, removed };
  }
}

/** One flush's changes to a collection, as they are made. */
const keyedChanges = <Entry>(): BoardKeyed<Entry> => ({
  upserts: [],
  removed: [],
});

const make = ({
  damagedRecords,
  db,
  heldSessions,
  laws,
  lifetime,
  machinePresence,
  machines: { agentProtocols, binaryUpdateStates, machineCustody },
  registry,
}: BoardDeps): BoardShape => {
  /* ---- what each entry is laid from ---- */

  /** What the board reads of the closure's keepers, and whom it tells: handed as it starts. */
  let keepers: BoardKeepers | undefined;
  /** The keepers, read as an entry is laid or a publish tells: never before the board starts. */
  const keepersNow = (): BoardKeepers => {
    if (!keepers) {
      throw new Error("the board was read before it started");
    }
    return keepers;
  };

  /**
   * Every listed row as the database holds it, by id. Read whole once, as
   * the hub starts; from then on only the rows the change log names are
   * read again, by key. A row that ages out of the listing leaves it by the
   * listing's own rule ({@link listedAt}), with no write.
   */
  const base = new Map<string, BoardInstanceRow>();
  /**
   * Ancestors of listed rows the board does not keep (stopped, failed or
   * gone from the listing a day ago), as the database last gave them, by
   * id; null for an id it has no row for. A change to one drops it here,
   * and it is read again when a row still nests under it.
   */
  const ancestorRows = new Map<string, BoardInstanceRow | null>();
  /** The board's rows by id: each listed row and every ancestor it nests under. */
  let members = new Map<string, BoardInstanceRow>();
  /** The sessions above live work, by how many live delegates each has under it. */
  let delegateCounts = new Map<string, number>();
  /** Every session stopped at its limit now. */
  let stalled = new Set<string>();

  /* ---- the collections ---- */

  let version = 0;
  const sessions = new Keyed<BoardRow>();
  const machineFacts = new Keyed<MachineFacts>();
  const machineStatus = new Keyed<MachineStatus>();
  const inventories = new Keyed<MachineInventory>();

  /* ---- what is owed laying ---- */

  /** Sessions whose stored row moved: read again by key. */
  const sessionsWritten = new Set<string>();
  /** Sessions whose overlay moved: laid again off the row held. */
  const sessionsOwed = new Set<string>();
  const factsOwed = new Set<string>();
  const statusOwed = new Set<string>();
  const inventoryOwed = new Set<string>();
  const listsOwed = new Set<BoardList>();
  let delegatesOwed = false;
  let stallsOwed = false;
  /** Sessions an input of whose own tool list moved (db board-log.ts `tools`): told delegation-mcp.ts, which looks at theirs alone. */
  const toolsOwed = new Set<string>();
  /** Whether an input every tool list may read moved (db board-log.ts `tool_inputs`). */
  let toolInputsOwed = false;
  /** What the views thread is owed hearing (views/changes.ts): told once the log is taken. */
  const viewsOwed = createViewChanges();
  /** Which rows the board lists may have moved: worked out again. */
  let membersOwed = false;
  /**
   * What Recent's stored list is owed hearing (stored-recent.ts
   * `rowsMoved`): every session laid, listed or not, and every one that
   * left the board, by id; the machines whose presence moved, whose
   * sessions it lays again of its own. Told once a publish has laid them.
   */
  const storedOwed = new Set<string>();
  const storedMachinesOwed = new Set<string>();
  /** Whether {@link BoardShape.start} ran: nothing is laid before it. */
  let started = false;
  /** Whether a flush is under way: a flush asked for meanwhile runs after it. */
  let flushing = false;

  /**
   * The publish, wanted from the hub's admission (scheduler.ts): what a
   * screen waits on, so a person's priority, and one publish however often
   * it is asked before it runs. A hub closed first (scripts/openapi.ts
   * closes its scratch hub) publishes nothing after.
   */
  const schedule = (): void => {
    lifetime.jobs.want({
      key: "board publish",
      name: "board publish",
      priority: "person",
      run: () => flush(),
    });
  };

  /* ---- sessions ---- */

  /**
   * The same law as a machine's, applied to sessions.
   *
   * `instances.status` is written on lifecycle events and read back by every
   * rail as if it were a statement about now. It is not: the hub cannot see a
   * process, only the daemon can, and when the hub is not holding that daemon's
   * socket there is no one to ask. Measured in exactly that state:
   * `/api/instances` reported 178 sessions `running` on a machine carrying 42
   * `claude` processes, all of them idling at ≤1.5% CPU and 36–44 hours old,
   * with two rows touched in the last hour and a half.
   *
   * So a row whose machine is absent from the socket registry is served
   * `unknown`, which is precisely what the hub knows about it. The stored
   * column is left alone; it is history. The overlay covers the values that
   * *claim* something about a live process — `running`, `starting`,
   * `sleeping`. `stopped`, `error` and `discarded` pass through untouched.
   */
  const withSessionPresence = <
    Row extends { id: string; machineId: string; status: string },
  >(
    rows: Row[]
  ): Row[] =>
    rows.map((row) => {
      const held = heldSessions.get(row.id);
      if (
        held &&
        registry.agent(row.machineId) &&
        (row.status === "sleeping" || row.status === "error")
      ) {
        return {
          ...row,
          status: "sleeping",
          held: { since: held.since, reason: held.reason },
        };
      }
      return registry.agent(row.machineId) ||
        (row.status !== "running" &&
          row.status !== "starting" &&
          row.status !== "sleeping")
        ? row
        : { ...row, status: "unknown" };
    });

  /**
   * The move `row` owes as its menu says it (InstanceRow `owedMove`): a
   * person's to another account, or any whose relaunch carries a model a
   * person picked meanwhile, named by the account it lands on (the row's
   * own, for a relaunch alone). None for a move of the hub's own with no
   * pick, or one landing on no account.
   */
  const owedMoveOf = (
    row: { accountId?: string | null },
    owed: OwedMove | undefined
  ): Pick<InstanceRow, "owedMove"> => {
    const accountId = owed?.to ?? row.accountId;
    const said =
      owed !== undefined &&
      ((owed.to !== undefined && owed.byHand) || owed.model !== undefined);
    if (!(said && accountId)) {
      return {};
    }
    return {
      owedMove: {
        accountId,
        waits: owed.waits,
        ...(owed.model === undefined ? {} : { model: owed.model }),
      },
    };
  };

  /**
   * Rows as every reader of the board is handed them: what the database
   * does not hold laid over each (presence, damage, running delegates,
   * keep-alive's facts, its queued sends, its owed move, its stall). Whether
   * its work item is live was read to list it, and goes no further.
   *
   * Law `running-session-machine-connected` (core invariant.ts), paired with
   * the presence overlay: checked on the rows as they leave for a reader,
   * after every overlay laid on them, so no later one serves a stored
   * `running` as now. A row that breaks it is left out, logged and filed
   * (laws.ts), and every other row goes.
   */
  const asBoard = (rows: BoardInstanceRow[]): BoardRow[] => {
    const keeper = keepersNow().rows;
    return damagedRecords
      .overlay(withSessionPresence(rows))
      .flatMap(({ workLive: _workLive, ...row }) => {
        const queued = keeper.queuedSends(row.id);
        const refused = keeper.moveRefusal(row);
        const stall = stalled.has(row.id) ? keeper.stall(row.id) : undefined;
        const laid = laidRow(row, {
          runningDelegates: delegateCounts.get(row.id) ?? 0,
          ...(queued > 0 ? { queuedSends: queued } : {}),
          ...owedMoveOf(row, db.owedMoves.get(row.id)),
          ...(refused === undefined ? {} : { moveRefused: refused }),
          ...(stall ? { stalled: stall } : {}),
        });
        return laws.holds(
          laid.status !== "running" || registry.agent(laid.machineId),
          "running-session-machine-connected",
          () =>
            `Session ${laid.id} was about to be served running on machine ${laid.machineId}, which holds no socket at the hub.`,
          () => ({ session: laid.id, machine: laid.machineId })
        )
          ? [laid]
          : [];
      });
  };

  /** Rows by id for the board's ancestors: the board's own first, then the database's. */
  const boardRowsByIds = (ids: string[]): Map<string, BoardInstanceRow> => {
    const out = new Map<string, BoardInstanceRow>();
    const unread: string[] = [];
    for (const id of ids) {
      const kept = base.get(id) ?? ancestorRows.get(id);
      if (kept) {
        out.set(id, kept);
      } else if (!ancestorRows.has(id)) {
        unread.push(id);
      }
    }
    if (unread.length > 0) {
      const read = new Map(
        db.boardAncestors(unread).map((row) => [row.id, row] as const)
      );
      for (const id of unread) {
        const row = read.get(id) ?? null;
        ancestorRows.set(id, row);
        if (row) {
          out.set(id, row);
        }
      }
    }
    return out;
  };

  let ageOut: HubTimer | undefined;
  /** When the age-out timer fires; never while none is armed. */
  let ageOutAt = Number.POSITIVE_INFINITY;
  /** The age-out timer armed for `at`, unless it already fires sooner. */
  const armAgeOut = (at: number, now: number): void => {
    if (at <= now || at >= ageOutAt) {
      return;
    }
    lifetime.cancel(ageOut);
    ageOutAt = at;
    ageOut = lifetime.after("board rows aged out", at - now, () => {
      ageOutAt = Number.POSITIVE_INFINITY;
      membersOwed = true;
      schedule();
    });
  };
  /**
   * The next row to age out of the listing ({@link listedUntil}) takes the
   * board's membership again when its time comes: the one move the board
   * makes for time alone.
   */
  const scheduleAgeOut = (now: number): void => {
    lifetime.cancel(ageOut);
    ageOutAt = Number.POSITIVE_INFINITY;
    let soonest = Number.POSITIVE_INFINITY;
    for (const row of base.values()) {
      const until = listedUntil(row);
      if (until !== null && until > now && until < soonest) {
        soonest = until;
      }
    }
    armAgeOut(soonest, now);
  };

  /**
   * Which rows the board lists, worked out again from the rows held: each
   * listed row ({@link listedAt}) with the sessions it nests under, and one
   * whose chain names a session the hub no longer has not at all
   * (board-ancestors.ts). Answers the ids that came and went. A row that
   * aged out leaves the rows held too: it is read again as an ancestor, or
   * when it is written.
   */
  const takeMembers = (): { added: string[]; gone: string[] } => {
    const now = Date.now();
    const shown: BoardInstanceRow[] = [];
    for (const [id, row] of base) {
      if (!listedAt(row, now)) {
        base.delete(id);
      } else if (row.kind !== "summariser") {
        shown.push(row);
      }
    }
    const next = new Map(
      withAncestors(shown, boardRowsByIds, isHubParent).map(
        (row) => [row.id, row] as const
      )
    );
    const added = [...next.keys()].filter((id) => !members.has(id));
    const gone = [...members.keys()].filter((id) => !next.has(id));
    members = next;
    scheduleAgeOut(now);
    return { added, gone };
  };

  /** Whether a row written moves which rows the board lists, rather than only itself. */
  const movesMembers = (
    before: BoardInstanceRow | undefined,
    after: BoardInstanceRow | undefined,
    now: number
  ): boolean =>
    (before === undefined) !== (after === undefined) ||
    before?.parentInstanceId !== after?.parentInstanceId ||
    before?.kind !== after?.kind ||
    (before !== undefined &&
      after !== undefined &&
      listedAt(before, now) !== listedAt(after, now));

  /** The stored rows the change log named, read again by key. */
  const readWritten = (ids: string[]): void => {
    const fresh = new Map(
      db.listedBoardInstancesByIds(ids).map((row) => [row.id, row] as const)
    );
    const now = Date.now();
    for (const id of ids) {
      const before = base.get(id);
      const after = fresh.get(id);
      if (after) {
        base.set(id, after);
        armAgeOut(listedUntil(after) ?? Number.POSITIVE_INFINITY, now);
      } else {
        base.delete(id);
      }
      if (ancestorRows.delete(id) || movesMembers(before, after, now)) {
        membersOwed = true;
      }
      // The live delegates above a session follow its chain of parents.
      if (before?.parentInstanceId !== after?.parentInstanceId) {
        delegatesOwed = true;
      }
      if (members.has(id) && after) {
        members.set(id, after);
      }
      sessionsOwed.add(id);
    }
  };

  /** The running delegates read again; each session whose count moved is laid again. */
  const readDelegates = (): void => {
    const next = db.runningDelegateCounts();
    for (const id of new Set([...delegateCounts.keys(), ...next.keys()])) {
      if (delegateCounts.get(id) !== next.get(id)) {
        sessionsOwed.add(id);
      }
    }
    delegateCounts = next;
  };

  /** The stalled sessions read again; each, before and after, is laid again. */
  const readStalls = (): void => {
    const next = new Set(keepersNow().rows.stalledNow());
    for (const id of new Set([...stalled, ...next])) {
      sessionsOwed.add(id);
    }
    stalled = next;
  };

  /* ---- machines ---- */

  /** A machine's live status ({@link MachineStatus}); undefined when the hub knows none. */
  const statusOf = (machineId: string): MachineStatus | undefined => {
    const lastSeenAt = db.machineSeen(machineId);
    if (lastSeenAt === undefined) {
      return undefined;
    }
    const custody = machineCustody.get(machineId);
    const visibleCustody: SessionCustody | undefined =
      custody?.state === "available"
        ? {
            ...custody,
            instances: db
              .getInstancesByIds(custody.instances)
              .map((owner) => owner.id),
          }
        : custody;
    const away = machinePresence(machineId);
    const linked = registry.agent(machineId);
    const update = binaryUpdateStates.get(machineId);
    // Online while its agent holds a link and, when it speaks this hub's
    // contract, once it has answered its welcome (fleet-sync.ts).
    const online =
      linked &&
      (keepersNow().machines.fleetReady(machineId) ||
        !speaksContract(agentProtocols.get(machineId)));
    // Offline, its update as it last said it, kept (db `keptBinaryUpdates`).
    const [kept] = update || online ? [] : db.keptBinaryUpdates(machineId);
    return {
      machineId,
      lastSeenAt,
      ...(visibleCustody ? { custody: visibleCustody } : {}),
      // The window a read off it answers `reconnecting` in (awayHeaders),
      // so a reader that does not ask it says the same.
      reconnectingUntil:
        away.kind === "reconnecting" && !linked ? away.until : null,
      status: online ? "online" : "offline",
      lostAt: keepersNow().machines.lostAt(machineId),
      ...(update ? { binaryUpdate: update } : {}),
      ...(kept
        ? { lastBinaryUpdate: { seenAt: kept.lastSeenAt, state: kept.state } }
        : {}),
    };
  };

  /** A machine's facts, the hub's own reading of whether it runs there laid on. */
  const factsOf = (machineId: string): MachineFacts | undefined => {
    const facts = db.machineFactsOf(machineId);
    return (
      facts && {
        ...facts,
        hostsHub: machineId === keepersNow().machines.ownMachineId(),
      }
    );
  };

  /* ---- the lists ---- */

  /** How each list is read, whole. */
  const readList: { [List in BoardList]: () => BoardListValues[List] } = {
    previews: () =>
      [...previewTargets].map(([id, target]) =>
        keepersNow().lists.shownFrame(id, target, false)
      ),
    handoffs: () => keepersNow().lists.handoffs(),
    // Carried so a dashboard follows a continuation it started over the
    // socket rather than over the request that started it.
    continuations: () => keepersNow().lists.continuations(),
    // Every former id, whole: a session folded into its continuation
    // leaves a tab on its id for the session it is now.
    formerIds: () => db.formerIds(),
    // A notice acknowledged on one device leaves every other one live, and
    // is never shown after a reload.
    noticesSeen: () => keepersNow().lists.noticesSeen.ids(),
    // A damaged record says so, and notices are off until it is reset.
    noticesDamaged: () => keepersNow().lists.noticesSeen.damaged(),
    // The fleet's preview mode: a switch moves every origin, so a decision
    // page a dashboard loaded on its own (PageFrame) loads again.
    previewSettings: () => keepersNow().lists.previewSettings(),
  };

  const LISTS: readonly BoardList[] = [
    "continuations",
    "formerIds",
    "handoffs",
    "noticesDamaged",
    "noticesSeen",
    "previewSettings",
    "previews",
  ];

  /** Each list as last read; every one once the board started. */
  const listsHeld: Partial<BoardListValues> = {};
  /** The version each list last moved at. */
  const listsAt = new Map<BoardList, number>();

  /** One list read again, at `at`. */
  const takeList = <List extends BoardList>(list: List, at: number): void => {
    listsHeld[list] = readList[list]();
    listsAt.set(list, at);
  };

  /** One list onto a frame, as it is held. */
  const putList = <List extends BoardList>(
    out: BoardChanges,
    list: List
  ): void => {
    const value = listsHeld[list];
    if (value !== undefined) {
      out[list] = value;
    }
  };

  /** The lists named, as a frame carries them. */
  const listsIn = (named: Iterable<BoardList>): BoardChanges => {
    const out: BoardChanges = {};
    for (const list of named) {
      putList(out, list);
    }
    // The notices record's damage moved (a Reset): its ids go with it, so a
    // client that cannot tell a null from an absent field still hears the
    // record is whole again.
    if ("noticesDamaged" in out) {
      putList(out, "noticesSeen");
    }
    return out;
  };

  /* ---- taking what moved ---- */

  /** Nothing the board lays: the views alone hear it. */
  const viewsOnly = (): void => undefined;

  /** What each kind of logged change owes, by its key. */
  const owedBy: { [Kind in BoardChangeKind]: (id: string) => void } = {
    session: (id) => sessionsWritten.add(id),
    delegates: () => {
      delegatesOwed = true;
    },
    stall: () => {
      stallsOwed = true;
    },
    machine: (id) => factsOwed.add(id),
    machine_status: (id) => statusOwed.add(id),
    inventory: (id) => inventoryOwed.add(id),
    former: () => listsOwed.add("formerIds"),
    continuation: () => listsOwed.add("continuations"),
    view_session: viewsOnly,
    view_work_item: viewsOnly,
    view_workspace: viewsOnly,
    view_artifact: viewsOnly,
    view_tasks: viewsOnly,
    view_routine: viewsOnly,
    view_project: viewsOnly,
    view_purged: viewsOnly,
    tools: (id) => toolsOwed.add(id),
    tool_inputs: () => {
      toolInputsOwed = true;
    },
  };

  /** The change log, sorted into what each collection owes, and what the views hear. */
  const takeLog = (): void => {
    for (const change of db.takeBoardChanges()) {
      owedBy[change.kind](change.id);
      const view = VIEW_OF[change.kind];
      if (view) {
        viewsOwed.add(view, change.id);
      }
    }
  };

  /** A work item follows its session's life (work-items `followSessions`). */
  const followWritten = (ids: string[]): void => {
    if (ids.length > 0) {
      syncSection("publish: work items followed", () =>
        keepersNow().followers.followSessions(new Set(ids))
      );
    }
  };

  /** Which rows the board lists, worked out again when owed: what came is owed laying, what went is dropped. */
  const takeMembersOwed = (at: number, changes: BoardKeyed<BoardRow>): void => {
    if (!membersOwed) {
      return;
    }
    membersOwed = false;
    const { added, gone } = takeMembers();
    for (const id of added) {
      sessionsOwed.add(id);
    }
    for (const id of gone) {
      storedOwed.add(id);
      if (sessions.drop(id, at)) {
        changes.removed.push(id);
      }
    }
  };

  /** Lays every session owed, answering what moved. */
  const laySessions = (at: number): BoardKeyed<BoardRow> => {
    const changes = keyedChanges<BoardRow>();
    takeMembersOwed(at, changes);
    const rows: BoardInstanceRow[] = [];
    for (const id of sessionsOwed) {
      storedOwed.add(id);
      const row = members.get(id);
      if (row) {
        rows.push(row);
      } else if (sessions.drop(id, at)) {
        changes.removed.push(id);
      }
    }
    sessionsOwed.clear();
    const laid = new Map(asBoard(rows).map((row) => [row.id, row] as const));
    for (const { id } of rows) {
      const row = laid.get(id);
      if (row) {
        if (sessions.put(id, row, at)) {
          changes.upserts.push(row);
        }
      } else if (sessions.drop(id, at)) {
        changes.removed.push(id);
      }
    }
    return changes;
  };

  /** Lays each machine entry owed in `owed` with `read`, answering what moved. */
  const layMachines = <Entry>(
    owed: Set<string>,
    collection: Keyed<Entry>,
    read: (machineId: string) => Entry | undefined,
    at: number
  ): BoardKeyed<Entry> => {
    const changes = keyedChanges<Entry>();
    for (const machineId of owed) {
      const entry = read(machineId);
      if (entry) {
        if (collection.put(machineId, entry, at)) {
          changes.upserts.push(entry);
        }
      } else if (collection.drop(machineId, at)) {
        changes.removed.push(machineId);
      }
    }
    owed.clear();
    return changes;
  };

  /** Whether a keyed change moved anything. */
  const moved = <Entry>(changes: BoardKeyed<Entry>): boolean =>
    changes.upserts.length > 0 || changes.removed.length > 0;

  /**
   * Takes what moved: the change log, then every entry owed laying, laid,
   * at one new version; every dashboard on this wire is sent what moved,
   * and nothing when nothing did. Each step a section of its own (core
   * loop-watch.ts `syncSection`): a hold in a publish names its step.
   */
  const flush = (): void => {
    if (!started) {
      return;
    }
    if (flushing) {
      schedule();
      return;
    }
    flushing = true;
    try {
      flushOnce(true);
    } finally {
      flushing = false;
    }
  };

  /**
   * One flush; `announce` false lays the board and tells no one: its first,
   * as the hub starts, before any dashboard or anything that hears a move
   * is made.
   */
  const flushOnce = (announce: boolean): void => {
    const written = syncSection("publish: change log taken", readOwed);
    // The views thread hears what moved of its own, before any reader below
    // asks it anything (views/client.ts: one ordered line of messages).
    const heard = viewsOwed.take();
    if (heard && announce) {
      keepersNow().followers.viewsHear(heard);
    }
    const at = version + 1;
    const changes = layOwed(at);
    // A work item follows its session's life: of every row the database
    // changed (whichever path wrote it), one in `error` or gone fails its
    // live item.
    followWritten(written);
    const movedNow = Object.keys(changes).length > 0;
    if (movedNow) {
      version = at;
    }
    const toolsMoved = [...toolsOwed];
    const toolInputsMoved = toolInputsOwed;
    toolsOwed.clear();
    toolInputsOwed = false;
    const storedMoved = new Set(storedOwed);
    const storedMachinesMoved = new Set(storedMachinesOwed);
    storedOwed.clear();
    storedMachinesOwed.clear();
    if (!announce) {
      return;
    }
    // A tool list follows its inputs alone (delegation-mcp.ts `look`): a
    // fleet one moved looks at every list, a session's own at its list.
    if (toolInputsMoved) {
      syncSection("publish: tool inputs moved", () =>
        keepersNow().followers.toolInputsChanged()
      );
    } else if (toolsMoved.length > 0) {
      syncSection("publish: tool lists owed", () =>
        keepersNow().followers.toolsMoved(toolsMoved)
      );
    }
    if (movedNow) {
      syncSection("publish: broadcast", () =>
        registry.broadcastBoard({
          verb: "frames",
          machineId: "",
          payload: { kind: "board", version, ...changes },
        })
      );
    }
    tellMoved(changes, written);
    // Recent's stored list lays its own rows as the board lays its own,
    // after it: a row that left the board is the list's from now.
    if (storedMoved.size > 0 || storedMachinesMoved.size > 0) {
      syncSection("publish: stored rows moved", () =>
        keepersNow().followers.storedRowsMoved(storedMoved, storedMachinesMoved)
      );
    }
  };

  /**
   * The change log taken, and what it and the keepers said moved read
   * again: the rows written, the running delegates, the stalls. Answers the
   * rows written.
   */
  const readOwed = (): string[] => {
    takeLog();
    const written = [...sessionsWritten];
    sessionsWritten.clear();
    if (written.length > 0) {
      syncSection("publish: written rows read", () => readWritten(written));
    }
    if (delegatesOwed) {
      delegatesOwed = false;
      syncSection("publish: running delegates read", readDelegates);
    }
    if (stallsOwed) {
      stallsOwed = false;
      syncSection("publish: stalls read", readStalls);
    }
    return written;
  };

  /** Every entry and list owed laying, laid at version `at`: what moved. */
  const layOwed = (at: number): BoardChanges => {
    const changes: BoardChanges = {};
    const sessionChanges = syncSection("publish: rows laid", () =>
      laySessions(at)
    );
    if (moved(sessionChanges)) {
      changes.sessions = sessionChanges;
    }
    const facts = syncSection("publish: machines laid", () =>
      layMachines(factsOwed, machineFacts, factsOf, at)
    );
    if (moved(facts)) {
      changes.machines = facts;
    }
    const status = layMachines(statusOwed, machineStatus, statusOf, at);
    if (moved(status)) {
      changes.machineStatus = status;
    }
    const inventory = syncSection("publish: inventories laid", () =>
      layMachines(inventoryOwed, inventories, db.machineInventory, at)
    );
    if (moved(inventory)) {
      changes.inventories = inventory;
    }
    for (const list of listsOwed) {
      takeList(list, at);
    }
    Object.assign(changes, listsIn(listsOwed));
    listsOwed.clear();
    return changes;
  };

  /**
   * What moved, told to what follows a move; `written`, the sessions whose
   * stored rows were written, on the board or not (a rule's facts are any
   * live session's).
   */
  const tellMoved = (changes: BoardChanges, written: string[]): void => {
    if (written.length === 0 && Object.keys(changes).length === 0) {
      return;
    }
    const sessionsMovedNow =
      written.length > 0 || changes.sessions !== undefined;
    const machinesMovedNow =
      changes.machines !== undefined ||
      changes.machineStatus !== undefined ||
      changes.inventories !== undefined;
    if (sessionsMovedNow) {
      // A session's model, project or harness can move under a live rule.
      syncSection("publish: rule facts forgotten", () =>
        keepersNow().followers.ruleFactsMoved()
      );
      // A session ending ends its artifacts' asks (Needs you's rule 4):
      // the lane hears which sessions moved, and reads again only for one
      // it read.
      syncSection("publish: artifact lane moved", () =>
        keepersNow().followers.laneSessionsMoved([
          ...written,
          ...(changes.sessions?.upserts.map((row) => row.id) ?? []),
          ...(changes.sessions?.removed ?? []),
        ])
      );
    }
    // An artifact's tab hears what moved of its own session, every one the
    // machines when one moved (its frame lists them), and what it shows
    // when a preview opened or closed.
    syncSection("publish: artifact tabs refreshed", () => {
      if (machinesMovedNow) {
        keepersNow().followers.tabMoved({ kind: "machines" });
      }
      if (changes.previews !== undefined) {
        keepersNow().followers.tabMoved({ kind: "shown" });
      }
      for (const row of changes.sessions?.upserts ?? []) {
        keepersNow().followers.tabMoved({
          kind: "session",
          instanceId: row.id,
        });
      }
      for (const id of changes.sessions?.removed ?? []) {
        keepersNow().followers.tabMoved({ kind: "session", instanceId: id });
      }
    });
  };

  /* ---- what the keepers say moved ---- */

  const listMoved: BoardShape["listMoved"] = (list) => {
    listsOwed.add(list);
    schedule();
  };

  const machineMoved: BoardShape["machineMoved"] = (machineId) => {
    statusOwed.add(machineId);
    storedMachinesOwed.add(machineId);
    for (const row of members.values()) {
      if (row.machineId === machineId) {
        sessionsOwed.add(row.id);
      }
    }
    schedule();
  };

  const machineStatusMoved: BoardShape["machineStatusMoved"] = (machineId) => {
    statusOwed.add(machineId);
    schedule();
  };

  const sessionsMoved: BoardShape["sessionsMoved"] = (ids) => {
    for (const id of ids) {
      sessionsOwed.add(id);
    }
    schedule();
  };

  /* ---- start ---- */

  const start = (handed: BoardKeepers): void => {
    if (started) {
      return;
    }
    started = true;
    keepers = handed;
    // The board read whole once; the log emptied first, so nothing written
    // before this is laid twice.
    db.takeBoardChanges();
    for (const row of db.listBoardInstances()) {
      base.set(row.id, row);
    }
    delegateCounts = db.runningDelegateCounts();
    stalled = new Set(keepersNow().rows.stalledNow());
    membersOwed = true;
    for (const { machineId } of db.machineFacts()) {
      factsOwed.add(machineId);
      statusOwed.add(machineId);
      inventoryOwed.add(machineId);
    }
    for (const list of LISTS) {
      listsOwed.add(list);
    }
    flushOnce(false);
    db.onLogged(schedule);
    // From here on, each of the hub's services that keeps what an entry is
    // laid from says what moved.
    registry.onPresence(machineMoved);
    heldSessions.hear((id) => sessionsMoved([id]));
    machineCustody.hear(machineStatusMoved);
    binaryUpdateStates.hear(machineStatusMoved);
    agentProtocols.hear(machineStatusMoved);
    previewTargets.hear(() => listMoved("previews"));
  };

  /** Takes what is owed now, before a read. */
  const settle = (): void => {
    flush();
  };

  /** A machine whole: its three entries put together, and when it was last heard now. */
  const machineWhole = (facts: MachineFacts): AgentRow | undefined => {
    const status = machineStatus.entries.get(facts.machineId);
    if (!status) {
      return undefined;
    }
    return {
      ...facts,
      ...status,
      ...inventories.entries.get(facts.machineId),
      lastSeenAt: db.machineSeen(facts.machineId) ?? status.lastSeenAt,
    };
  };

  /** Every machine's facts, in the order they joined. */
  const factsInOrder = (): MachineFacts[] =>
    [...machineFacts.entries.values()].sort(
      (a, b) =>
        a.joinedAt - b.joinedAt || a.machineId.localeCompare(b.machineId)
    );

  /** The board whole, as the first frame on a socket carries it. */
  const whole = (): BoardChanges => ({
    sessions: { upserts: [...sessions.entries.values()], removed: [] },
    machines: { upserts: factsInOrder(), removed: [] },
    machineStatus: {
      upserts: [...machineStatus.entries.values()],
      removed: [],
    },
    inventories: { upserts: [...inventories.entries.values()], removed: [] },
    ...listsIn(LISTS),
  });

  /** What moved after `since`; undefined when the board keeps no record that far back. */
  const movedSince = (since: number): BoardChanges | undefined => {
    if (
      since > version ||
      since < sessions.floor ||
      since < machineFacts.floor ||
      since < machineStatus.floor ||
      since < inventories.floor
    ) {
      return undefined;
    }
    const changes: BoardChanges = {};
    const movedSessions = sessions.since(since);
    if (moved(movedSessions)) {
      changes.sessions = movedSessions;
    }
    const movedFacts = machineFacts.since(since);
    if (moved(movedFacts)) {
      changes.machines = movedFacts;
    }
    const movedStatus = machineStatus.since(since);
    if (moved(movedStatus)) {
      changes.machineStatus = movedStatus;
    }
    const movedInventories = inventories.since(since);
    if (moved(movedInventories)) {
      changes.inventories = movedInventories;
    }
    return {
      ...changes,
      ...listsIn(LISTS.filter((list) => (listsAt.get(list) ?? 0) > since)),
    };
  };

  /** The board as a socket's first frame carries it (board-shape.ts `firstFrame`). */
  const firstFrame: BoardShape["firstFrame"] = (since) => {
    settle();
    const movedNow = since === undefined ? undefined : movedSince(since);
    return {
      version,
      changes:
        since !== undefined && movedNow ? { since, ...movedNow } : whole(),
    };
  };

  /** Recent's stored list's sessions the board does not list, laid as the board's (board-shape.ts `storedRows`). */
  const storedRows: BoardShape["storedRows"] = (candidates) => {
    settle();
    const off = candidates.filter((id) => !members.has(id));
    const read = boardRowsByIds(off);
    return asBoard(off.flatMap((id) => read.get(id) ?? []));
  };

  return {
    firstFrame,
    listMoved,
    machine: (machineId) => {
      settle();
      const facts = machineFacts.entries.get(machineId);
      return facts && machineWhole(facts);
    },
    machines: () => {
      settle();
      return factsInOrder().flatMap((facts) => machineWhole(facts) ?? []);
    },
    machineMoved,
    machineFactsMoved: (machineId) => {
      factsOwed.add(machineId);
      schedule();
    },
    machineStatusMoved,
    rows: () => {
      settle();
      return [...sessions.entries.values()];
    },
    runningDelegates: (id) => delegateCounts.get(id) ?? 0,
    sessionsMoved,
    settle,
    start,
    stallsMoved: () => {
      stallsOwed = true;
      schedule();
    },
    storedRows,
    withSessionPresence,
  };
};

/**
 * The board (`make`), as one of the hub's services: built once, from its
 * layer, by `createServer` (hub-layer.ts), and started there once what it
 * lays its rows from is made.
 */
export class Board extends Context.Service<Board, BoardShape>()("Board") {}

export const BoardLayer = Layer.effect(Board)(
  Effect.gen(function* () {
    const sessions = yield* SessionRuntime;
    return make({
      damagedRecords: yield* DamagedRecords,
      db: yield* Db,
      heldSessions: sessions.heldSessions,
      laws: yield* Laws,
      lifetime: yield* HubLifetime,
      machinePresence: (yield* HandoverState).machinePresence,
      machines: yield* MachineRuntime,
      registry: yield* Registry,
    });
  })
);
