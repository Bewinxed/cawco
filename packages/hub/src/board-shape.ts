/**
 * The board's shape (board.ts): what it answers its readers, the typed
 * events its keepers say what moved by, what it reads of the keepers the
 * hub's closure makes, and a session's row as it lays it. Apart from
 * board.ts, so the hub's context can name the board without a cycle.
 */
import type { BoardChanges, PreviewFrame } from "@cawco/core/frames";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type { TabMove } from "./artifact-session";
import type { BoardInstanceRow } from "./db/instances";
import { withKeepAliveFacts } from "./keep-alive";
import type { PreviewTarget } from "./preview";
import type { ViewChanges } from "./views/changes";

/** The small lists the board carries whole beside its keyed collections. */
export type BoardList =
  | "continuations"
  | "formerIds"
  | "handoffs"
  | "noticesDamaged"
  | "noticesSeen"
  | "previewSettings"
  | "previews";

/** Each list's value, as a frame carries it. */
export type BoardListValues = {
  [List in BoardList]: Exclude<BoardChanges[List], undefined>;
};

/**
 * What the board reads of the keepers the hub's closure makes (the sends,
 * the limit moves, the lists' keepers), and whom it tells what moved:
 * handed once, as it starts ({@link BoardShape.start}). The board reads
 * each as it lays an entry or publishes, never as it is handed, so a
 * keeper made after the board starts is named by a function that reads it
 * then.
 */
export interface BoardKeepers {
  /** Whom a publish tells what moved, in this order. */
  followers: {
    /** The views thread hears what moved of its own, before anything is laid (views/client.ts). */
    viewsHear: (changes: ViewChanges) => void;
    /** A work item follows its session's life: the sessions whose rows were written (work-items.ts `followSessions`). */
    followSessions: (ids: ReadonlySet<string>) => void;
    /** An input every tool list may read moved (delegation-mcp.ts `toolInputsChanged`). */
    toolInputsChanged: () => void;
    /** An input of these sessions' own tool lists moved (delegation-mcp.ts `toolsMoved`). */
    toolsMoved: (ids: readonly string[]) => void;
    /** A session's model, project or harness can move under a live rule (rules engine `forgetFacts`). */
    ruleFactsMoved: () => void;
    /** A session ending ends its artifacts' asks: the lane hears which sessions moved (artifacts/lane.ts). */
    laneSessionsMoved: (ids: Iterable<string>) => void;
    /** An artifact's tab hears what moved of what it shows (artifact-session.ts `moved`). */
    tabMoved: (move: TabMove) => void;
  };
  /** What the lists are read from, the database aside. */
  lists: {
    /** Each handoff by the session handed off (sends.ts `handoffs`). */
    handoffs: () => BoardListValues["handoffs"];
    /** The continuations under way (continuations.ts `continuationTable`). */
    continuations: () => BoardListValues["continuations"];
    /** The notices acknowledged, and whether their record is damaged (notices-seen.ts). */
    noticesSeen: {
      damaged: () => BoardListValues["noticesDamaged"];
      ids: () => BoardListValues["noticesSeen"];
    };
    /** The fleet's preview mode (preview-listeners.ts `settings`). */
    previewSettings: () => BoardListValues["previewSettings"];
    /** A preview's frame as the board carries it (artifact-pages.ts `shownFrame`). */
    shownFrame: (
      instanceId: string,
      target: PreviewTarget,
      open: boolean
    ) => PreviewFrame;
  };
  /** What a machine's status is laid from, the database and the hub's services aside. */
  machines: {
    /** Whether it answered its welcome (fleet-sync.ts `isReady`). */
    fleetReady: (machineId: string) => boolean;
    /** When the hub lost it, if it did (machine-contact.ts). */
    lostAt: (machineId: string) => number | null;
    /** The machine the hub runs on, once read. */
    ownMachineId: () => string | undefined;
  };
  /** What a session's row is laid from, the database and the hub's services aside. */
  rows: {
    /** Its sends queued until it takes one (sends.ts `sendsPending`). */
    queuedSends: (instanceId: string) => number;
    /** What its account line says of a move that didn't happen (limit-moves.ts). */
    moveRefusal: (row: {
      accountId?: string | null;
      id: string;
    }) => InstanceRow["moveRefused"];
    /** How it is stopped at its limit, if it is (at-limit.ts). */
    stall: (instanceId: string) => InstanceRow["stalled"];
    /** Every session stopped at its limit now (at-limit.ts). */
    stalledNow: () => string[];
  };
}

/** What the board answers its readers and hears from its keepers. */
export interface BoardShape {
  /**
   * The board as a socket's first frame carries it: what moved since
   * `since`, when the board still records that far back, else whole. Takes
   * what is owed first.
   */
  firstFrame: (since: number | undefined) => {
    changes: BoardChanges & { since?: number };
    version: number;
  };
  /** Each list named moved (its keeper's word): it is read whole again. */
  listMoved: (list: BoardList) => void;
  /** One machine whole, as `GET /api/agents/:machineId` answers it; undefined when the hub knows none. */
  machine: (machineId: string) => AgentRow | undefined;
  /** Something of the machine's facts the database does not hold moved: whether the hub runs on it. */
  machineFactsMoved: (machineId: string) => void;
  /**
   * The machine's socket came or went: its status, and every session on
   * it (whose status is the machine's presence), are laid again.
   */
  machineMoved: (machineId: string) => void;
  /** Something of the machine's live status moved (its custody, its update, its contact, its welcome). */
  machineStatusMoved: (machineId: string) => void;
  /** Every machine whole, in the order they joined, as `GET /api/agents` answers them. */
  machines: () => AgentRow[];
  /** The board's rows, as every reader is handed them. */
  rows: () => BoardRow[];
  /** How many delegates of session `id` run, as the board last read them: no read of its own. */
  runningDelegates: (id: string) => number;
  /** What a session's row is laid from moved, the database aside (held, a queued send, a refused move, damage). */
  sessionsMoved: (ids: Iterable<string>) => void;
  /** The board takes what the database logged now, rather than on the turn after the write. */
  settle: () => void;
  /** Which sessions are stopped at their limit, or how, moved: each such row, before and after, is laid again. */
  stallsMoved: () => void;
  /**
   * The board read whole, once, as the hub starts, after everything it lays
   * its rows from is made: until then it lays nothing and hears no write.
   * From then on it hears what moved of the hub's services it reads (a
   * machine's presence, custody, update and contract, a session held, a
   * preview). `keepers`: what it reads of the keepers outside its services,
   * and whom it tells what moved.
   */
  start: (keepers: BoardKeepers) => void;
  /**
   * The sessions among `candidates` (views/stored.ts: the ones wrapping a
   * stored transcript in Recent, and the sessions they nest under, whose
   * chain tops at a person's own) that the board does not list, laid as the
   * board lays its rows: Recent's stored list draws them.
   */
  storedRows: (candidates: string[]) => BoardRow[];
  /** `rows` with the presence overlay ({@link withSessionPresence}). */
  withSessionPresence: <
    Row extends { id: string; machineId: string; status: string },
  >(
    rows: Row[]
  ) => Row[];
}

/**
 * A session's row as the board lays it: what the database holds, its
 * keep-alive's facts in place of their columns, and what the hub lays over
 * it. Core `InstanceRow` on the wire.
 */
export const laidRow = (
  row: Omit<BoardInstanceRow, "workLive"> &
    Pick<InstanceRow, "damaged" | "held">,
  overlays: Pick<
    InstanceRow,
    "moveRefused" | "owedMove" | "queuedSends" | "runningDelegates" | "stalled"
  >
) => ({ ...withKeepAliveFacts(row), ...overlays });

/** A session's row as the board lays it ({@link laidRow}). */
export type BoardRow = ReturnType<typeof laidRow>;
