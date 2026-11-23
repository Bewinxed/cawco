/**
 * THE RETURN'S RECAP (the owner, 2026-11-23, cockpit#8eabb628): as the
 * person comes back from being away (notifications.ts: the rollup of every
 * device's facts went from away to here), the hub draws, in each session
 * that talks with them, one line of what moved of that session's records
 * while they were away (core `RETURN_RECAP`, return-recap.ts `ReturnRecap`):
 *
 * - what of it waits on them now: its items in Needs you (artifacts/lane.ts)
 *   and its open asks (asks.ts);
 * - the tasks its plan names, or that work it started was an attempt at,
 *   whose stage moved (`task_moves`), from the stage they left first to the
 *   one they stand in;
 * - the work it started that landed (its work item's commit and headline).
 *
 * Built from the hub's own records, never a session's words, and no turn is
 * sent to anyone. A session gets one only when something of it happened in
 * the stretch: a wait raised, a task moved, work landed; what still waits
 * on them rides with it. Kept on the session's row (`session_lines` kind
 * `recap`), so a later read of its transcript draws it where it landed.
 */

import type { ArtifactNeed } from "@cawco/core/artifact-needs";
import { unparked } from "@cawco/core/artifact-needs";
import { askLink } from "@cawco/core/asks";
import { RETURN_RECAP } from "@cawco/core/harness";
import type { InstanceRow } from "@cawco/core/protocol";
import { sessionLink, taskLink } from "@cawco/core/references";
import type { ReturnRecap } from "@cawco/core/return-recap";
import type { HubLineMessage } from "./compaction";
import type { DbShape } from "./db";
import type { AwayStretch } from "./db/presence";
import { talksWithPerson } from "./roles";

export interface ReturnRecapDeps {
  db: Pick<
    DbShape,
    "asks" | "getInstancesByIds" | "noteRecapLine" | "returnRecap" | "taskIndex"
  >;
  /** Draws a line of the hub's in a session's transcript, live (transcripts.ts `line`). */
  line: (row: InstanceRow, message: HubLineMessage) => void;
  /** Needs you as it stands (artifacts/lane.ts `now`). */
  needs: () => readonly ArtifactNeed[];
}

/** A session's recap as it is gathered: what moved of it, and whether any of it happened in the stretch. */
interface Gathered {
  fresh: boolean;
  landed: ReturnRecap["landed"];
  moved: ReturnRecap["moved"];
  waiting: string[];
}

/**
 * The recap of a return as its row keeps the line (core `RETURN_RECAP`):
 * the same on the live stream and a later transcript read.
 */
export const recapLine = (
  row: { sessionId: string | null },
  line: { at: number; id: string; content: string }
): HubLineMessage => ({
  type: "system",
  subtype: RETURN_RECAP,
  uuid: line.id,
  session_id: row.sessionId ?? "",
  content: line.content,
  timestamp: new Date(line.at).toISOString(),
});

/** How many continuations a recap follows to the session that goes on now. */
const CONTINUED_MOST = 20;

export const createReturnRecap = (deps: ReturnRecapDeps) => {
  const { db } = deps;

  /** The session that goes on from `instanceId` now: itself, or the last it was continued into. */
  const goingOn = (instanceId: string): InstanceRow | undefined => {
    let [row] = db.getInstancesByIds([instanceId]);
    for (let hop = 0; row?.continuedInto && hop < CONTINUED_MOST; hop += 1) {
      [row] = db.getInstancesByIds([row.continuedInto]);
    }
    return row;
  };

  /** A task by its link, its title the label, as the project's board indexes it. */
  const taskNamed = (projectId: string, taskId: string): string => {
    const title = db
      .taskIndex(projectId)
      .find((one) => one.id === taskId)?.title;
    return taskLink(projectId, taskId, title ?? taskId);
  };

  /** Every session's recap for the stretch from `since` to `back`, gathered from the records. */
  const gather = (since: Date, back: Date): Map<string, Gathered> => {
    const gathered = new Map<string, Gathered>();
    const of = (instanceId: string): Gathered => {
      const known = gathered.get(instanceId);
      if (known) {
        return known;
      }
      const fresh: Gathered = {
        fresh: false,
        waiting: [],
        moved: [],
        landed: [],
      };
      gathered.set(instanceId, fresh);
      return fresh;
    };
    const from = since.getTime();
    for (const need of unparked(deps.needs())) {
      const one = of(need.instanceId);
      one.waiting.push(need.link);
      one.fresh ||= need.raisedAt >= from;
    }
    for (const ask of db.asks.open()) {
      const one = of(ask.instanceId);
      one.waiting.push(askLink(ask));
      one.fresh ||= ask.raisedAt >= from;
    }
    const moves = Map.groupBy(
      db.returnRecap.movesBetween(since, back),
      (move) => `${move.projectId}\t${move.taskId}`
    );
    for (const run of moves.values()) {
      const [first] = run;
      const last = run.at(-1);
      if (!(first && last) || first.from === last.to) {
        continue;
      }
      const moved = {
        task: taskNamed(first.projectId, first.taskId),
        from: first.from,
        to: last.to,
      };
      for (const instanceId of db.returnRecap.hearing(
        first.projectId,
        first.taskId
      )) {
        const one = of(instanceId);
        one.moved.push(moved);
        one.fresh = true;
      }
    }
    for (const item of db.returnRecap.landedBetween(since, back)) {
      const one = of(item.parentInstanceId);
      one.landed.push({
        work: sessionLink(item.instanceId, item.title),
        commit: item.landedSha,
        headline: item.headline,
      });
      one.fresh = true;
    }
    return gathered;
  };

  /**
   * The recaps of the stretch from `since` to `back`, by the session each is
   * drawn in: each that talks with the person and has something of the
   * stretch, one continued drawn where it goes on.
   */
  const recapsOf = (since: Date, back: Date): Map<string, ReturnRecap> => {
    const recaps = new Map<string, ReturnRecap>();
    for (const [instanceId, one] of gather(since, back)) {
      const row = one.fresh ? goingOn(instanceId) : undefined;
      if (!(row && talksWithPerson(row))) {
        continue;
      }
      const had = recaps.get(row.id);
      recaps.set(row.id, {
        since: since.getTime(),
        back: back.getTime(),
        waiting: [...new Set([...(had?.waiting ?? []), ...one.waiting])],
        moved: [...(had?.moved ?? []), ...one.moved],
        landed: [...(had?.landed ?? []), ...one.landed],
      });
    }
    return recaps;
  };

  /** Draws `recap` in session `instanceId`'s transcript, once: kept on its row, then live. */
  const draw = (instanceId: string, recap: ReturnRecap): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const line = {
      at: recap.back,
      id: `recap-${recap.back}`,
      content: JSON.stringify(recap),
    };
    if (db.noteRecapLine(row.id, line)) {
      deps.line(row, recapLine(row, line));
    }
  };

  return {
    /** The person came back (`stretch`, its `backAt` just set): each session's recap of it is drawn, once per return. */
    returned(stretch: AwayStretch): void {
      const { awaySince, backAt } = stretch;
      if (!(awaySince && backAt)) {
        return;
      }
      const recaps = recapsOf(awaySince, backAt);
      for (const [instanceId, recap] of recaps) {
        draw(instanceId, recap);
      }
      console.log(
        `[presence] the person is back after away since ${awaySince.toISOString()}: a recap drawn in ${recaps.size} session(s), from the records`
      );
    },
  };
};

export type ReturnRecaps = ReturnType<typeof createReturnRecap>;
