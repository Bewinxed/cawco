/**
 * The board's shape (board.ts): what it answers its readers, the typed
 * events its keepers say what moved by, and a session's row as it lays it.
 * Apart from board.ts, which reads the hub's context, so the context can
 * name the board without a cycle.
 */
import type { BoardChanges } from "@cawco/core/frames";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type { BoardInstanceRow } from "./db/instances";
import { withKeepAliveFacts } from "./keep-alive";
import type { ClientSocket } from "./wire-socket";

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

/** What the board answers its readers and hears from its keepers. */
export interface BoardShape {
  /** A dashboard's first frames as its socket opens; `held`, the board it named (core `BOARD_HELD_PARAM`). */
  greetDashboard: (
    ws: ClientSocket,
    older: boolean,
    held: { hubRun: string; version: number } | undefined
  ) => void;
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
   */
  start: () => void;
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
