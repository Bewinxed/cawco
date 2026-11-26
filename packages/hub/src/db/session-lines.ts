/** A session's kept notes, by kind (limit, watch, context, machine), and where it moved from. */

import { recordLimitReading } from "@cawco/core/limit-readings";
import { and, eq, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import { instances, type MachineLineKind, sessionLines } from "./schema";
import type { SessionLineKind } from "./stored-types";

interface LimitNote {
  at: number;
  content: string;
  id: string;
}

/** A machine's line as its row keeps it, with which kind it is. */
export type MachineLine = LimitNote & { kind: MachineLineKind };

/** How many of a session's machine lines of each kind are kept. */
// @limit recording: hub.machine-lines-per-session until 2026-12-03
const LIMIT_NOTES_KEPT = 20;

/** A fleet-watch line kept for a session ({@link DbShape.noteWatchLine}). */
type WatchLine = LimitNote;

/** How many of a session's fleet-watch lines are kept. */
// @limit measured: peaked at 10 per session over 87 sessions (session_lines on the hub, to 2026-11-26); kept at twice that
const WATCH_LINES_KEPT = 20;

/** How many of a session's lines about its context are kept ({@link DbShape.noteContextLine}). */
// @limit measured: peaked at 13 per session over 33 sessions (session_lines on the hub, to 2026-11-26); kept at twice that
const CONTEXT_LINES_KEPT = 26;

/** How many of a session's lines about notices that ended undelivered are kept ({@link DbShape.noteUnsentLine}). */
// @limit recording: hub.unsent-lines-per-session until 2026-12-10
const UNSENT_LINES_KEPT = 20;

/** How many of a session's recaps of the person's returns are kept ({@link DbShape.noteRecapLine}). */
// @limit measured: peaked at 8 per session over 12 sessions (session_lines on the hub, to 2026-11-26); kept at twice that
const RECAP_LINES_KEPT = 16;

/** A session's move line ({@link DbShape.noteMovedHere}). */
interface MovedHere {
  at: number;
  moved: string;
  stayed?: string;
}

export interface SessionLinesDb {
  /** The session's lines about its context ({@link DbShape.noteContextLine}), oldest first. */
  readonly contextLinesOf: (id: string) => LimitNote[];
  /** The lines its machine said, kept on the session's row, each kind oldest first. */
  readonly machineLinesOf: (id: string) => MachineLine[];
  /** The move a session started from, as {@link noteMovedHere} kept it; null when none. */
  readonly movedHereOf: (id: string) => MovedHere | null;
  /**
   * Keeps a line about the session's context on its row (core
   * `CONTEXT_LINE`, its `content` the line as JSON), the last {@link
   * CONTEXT_LINES_KEPT}: one already kept under its id is what it says now,
   * where it stood. False when the hub keeps no row for the session.
   */
  readonly noteContextLine: (id: string, line: LimitNote) => boolean;
  /** Keeps a line its machine said on the session's row, the last {@link LIMIT_NOTES_KEPT} of its kind; false when one under its id is already kept. */
  readonly noteMachineLine: (
    id: string,
    kind: MachineLineKind,
    note: LimitNote
  ) => boolean;
  /** Records that a session started where its project was moved to for it: the move's ready line. */
  readonly noteMovedHere: (id: string, line: MovedHere) => void;
  /**
   * Keeps the recap of the person's return on the session's row (core
   * `RETURN_RECAP`, its `content` the recap as JSON), the last {@link
   * RECAP_LINES_KEPT}. False when one under its id is kept already, or the
   * hub keeps no row for the session.
   */
  readonly noteRecapLine: (id: string, line: LimitNote) => boolean;
  /**
   * Keeps the line for notices owed to the session that ended undelivered
   * (core `NOTICES_ENDED`) on its row, the last {@link UNSENT_LINES_KEPT}.
   * False when the hub keeps no row for the session.
   */
  readonly noteUnsentLine: (id: string, line: LimitNote) => boolean;
  /** Keeps a fleet-watch line on the session's row, the last {@link WATCH_LINES_KEPT}. */
  readonly noteWatchLine: (id: string, line: WatchLine) => void;
  /** The recaps of the person's returns kept on the session's row, oldest first. */
  readonly recapLinesOf: (id: string) => LimitNote[];
  /** The lines for notices that ended undelivered kept on the session's row, oldest first. */
  readonly unsentLinesOf: (id: string) => LimitNote[];
  /** The fleet-watch lines kept on the session's row, oldest first. */
  readonly watchLinesOf: (id: string) => WatchLine[];
}

export const sessionLinesDb = (core: DbCore): SessionLinesDb => {
  const { db } = core;

  /** A session's lines of one kind, in the order written. */
  const linesOf = (instanceId: string, kind: SessionLineKind) =>
    db
      .select()
      .from(sessionLines)
      .where(
        and(
          eq(sessionLines.instanceId, instanceId),
          eq(sessionLines.kind, kind)
        )
      )
      .orderBy(sql`rowid`)
      .all()
      .map((row) => ({ ...row, at: row.at.getTime() }));

  /**
   * Keeps a line of a session's, and the last `kept` of its kind, in one
   * transaction; false when one under its id is kept already, or the hub
   * keeps no row for the session.
   */
  const keepLine = (
    instanceId: string,
    kind: SessionLineKind,
    line: LimitNote,
    kept: number,
    /** One already kept under its id says this now, where it stood: true for a line said again as it goes. */
    again = false,
    /** Told how many lines of its kind the session holds with this one, before the cut. */
    held: (count: number) => void = () => undefined
  ): boolean =>
    db.transaction((tx) => {
      if (
        !tx
          .select({ id: instances.id })
          .from(instances)
          .where(eq(instances.id, instanceId))
          .get()
      ) {
        return false;
      }
      const added = tx
        .insert(sessionLines)
        .values({
          instanceId,
          kind,
          id: line.id,
          at: new Date(line.at),
          content: line.content,
        })
        .onConflictDoNothing()
        .returning({ id: sessionLines.id })
        .all();
      if (added.length === 0) {
        if (again) {
          tx.update(sessionLines)
            .set({ content: line.content })
            .where(
              and(
                eq(sessionLines.instanceId, instanceId),
                eq(sessionLines.kind, kind),
                eq(sessionLines.id, line.id)
              )
            )
            .run();
        }
        return again;
      }
      held(
        tx
          .select({ id: sessionLines.id })
          .from(sessionLines)
          .where(
            and(
              eq(sessionLines.instanceId, instanceId),
              eq(sessionLines.kind, kind)
            )
          )
          .all().length
      );
      tx.run(
        sql`DELETE FROM ${sessionLines} WHERE instance_id = ${instanceId} AND kind = ${kind} AND rowid NOT IN (SELECT rowid FROM ${sessionLines} WHERE instance_id = ${instanceId} AND kind = ${kind} ORDER BY rowid DESC LIMIT ${kept})`
      );
      return true;
    });

  return {
    noteMovedHere: (id, line) => {
      const values = {
        at: new Date(line.at),
        content: line.moved,
        stayed: line.stayed ?? null,
      };
      db.insert(sessionLines)
        .values({ instanceId: id, kind: "moved", id: "moved", ...values })
        .onConflictDoUpdate({
          target: [sessionLines.instanceId, sessionLines.kind, sessionLines.id],
          set: values,
        })
        .run();
    },
    movedHereOf: (id) => {
      const [row] = linesOf(id, "moved");
      return row
        ? {
            at: row.at,
            moved: row.content,
            ...(row.stayed === null ? {} : { stayed: row.stayed }),
          }
        : null;
    },
    noteWatchLine: (id, line) => {
      keepLine(id, "watch", line, WATCH_LINES_KEPT);
    },
    noteContextLine: (id, line) =>
      keepLine(id, "context", line, CONTEXT_LINES_KEPT, true),
    contextLinesOf: (id) =>
      linesOf(id, "context").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    watchLinesOf: (id) =>
      linesOf(id, "watch").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    noteUnsentLine: (id, line) =>
      keepLine(id, "unsent", line, UNSENT_LINES_KEPT, false, (count) =>
        recordLimitReading("hub.unsent-lines-per-session", count)
      ),
    noteRecapLine: (id, line) => keepLine(id, "recap", line, RECAP_LINES_KEPT),
    recapLinesOf: (id) =>
      linesOf(id, "recap").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    unsentLinesOf: (id) =>
      linesOf(id, "unsent").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    noteMachineLine: (id, kind, note) =>
      keepLine(id, kind, note, LIMIT_NOTES_KEPT, false, (count) =>
        recordLimitReading("hub.machine-lines-per-session", count)
      ),
    machineLinesOf: (id) =>
      (["limit", "outdated", "room"] as const).flatMap((kind) =>
        linesOf(id, kind).map(({ id: lineId, at, content }) => ({
          kind,
          id: lineId,
          at,
          content,
        }))
      ),
  };
};
