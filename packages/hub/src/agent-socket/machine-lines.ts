/** Lines a machine says about a session, read before the ingest ledger. */

import {
  CUSTODY_HELD,
  LEAK_ENDED,
  LEAK_FOUND,
  type LeakFound,
} from "@cawco/core/harness";
import { FRAMES_LOST, STREAM_SO_FAR } from "@cawco/core/session-messages";
import { HOUR_MS } from "@cawco/core/time";
import { custodyLine } from "../history";
import type { HubContext } from "../hub-context";
import type { TranscriptPayload } from "../transcripts";
import { onSessionFrame } from "./frame-run";
import {
  custodyReason,
  machineLineKind,
  RESTORE_HORIZON_MS,
} from "./wire-reads";

export type MachineLinesContext = Pick<
  HubContext,
  | "db"
  | "endLeak"
  | "heldSessions"
  | "noteMachineLine"
  | "publishInstances"
  | "tellLeak"
  | "transcripts"
>;

export const machineLineStagesOf = (ctx: MachineLinesContext) => {
  const custodyHeld = onSessionFrame(({ message }, frame, instanceId) => {
    if (
      frame.message.type === "system" &&
      frame.message.subtype === CUSTODY_HELD
    ) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (
        !row ||
        row.machineId !== message.machineId ||
        (row.status !== "sleeping" && row.status !== "error") ||
        row.updatedAt.getTime() >= Date.now() - RESTORE_HORIZON_MS
      ) {
        return "stop";
      }
      const hours = ((Date.now() - row.updatedAt.getTime()) / HOUR_MS).toFixed(
        1
      );
      const note = custodyReason(hours);
      ctx.heldSessions.set(row.id, {
        machineId: row.machineId,
        since: row.updatedAt.getTime(),
        reason: note,
      });
      ctx.publishInstances(message.machineId);
      message.payload = {
        ...frame,
        message: custodyLine(row, note),
      };
      ctx.transcripts.ingest(row.id, message.payload as TranscriptPayload);
      return "stop";
    }
    return "continue";
  });

  const leakFound = onSessionFrame(({ message }, frame, instanceId) => {
    // Something the session started leaks (agent leak-watch.ts):
    // the session is told, once per leak, in the hub's own word.
    // Nothing is stopped.
    if (
      frame.message.type === "system" &&
      frame.message.subtype === LEAK_FOUND
    ) {
      ctx.tellLeak(
        message.machineId,
        instanceId,
        frame.message as {
          uuid?: unknown;
          content?: unknown;
          leak?: LeakFound;
        }
      );
      return "stop";
    }
    return "continue";
  });

  const leakEnded = onSessionFrame(({ message }, frame, instanceId) => {
    // A leak told before has ended: its notice says so.
    if (
      frame.message.type === "system" &&
      frame.message.subtype === LEAK_ENDED
    ) {
      ctx.endLeak(
        message.machineId,
        instanceId,
        frame.message as { uuid?: unknown }
      );
      return "stop";
    }
    return "continue";
  });

  const machineLineSaid = onSessionFrame(({ message }, frame, instanceId) => {
    // A line its machine said about the session (a limit its
    // keeper held it to, its process on an old Claude Code): kept
    // on its row and said in its transcript, before the ingest
    // ledger, which it has no ring line in.
    const machineSaid =
      frame.message.type === "system"
        ? machineLineKind(frame.message.subtype)
        : undefined;
    if (machineSaid) {
      ctx.noteMachineLine(
        message.machineId,
        instanceId,
        frame.harness,
        machineSaid,
        frame.message
      );
      return "stop";
    }
    return "continue";
  });

  const streamSoFar = onSessionFrame(({ message }, frame, instanceId) => {
    // The reply being written, re-sent whole by an agent that just
    // registered (STREAM_SO_FAR): it only repaints the running
    // reply. Not a line of the session's output, so the ingest
    // ledger never sees it (no provenance would retire the mark a
    // later reattach replays from), and nothing that makes a turn
    // into work, attention or activity reads it.
    if (
      frame.message.type === "system" &&
      frame.message.subtype === STREAM_SO_FAR
    ) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (row?.machineId === message.machineId) {
        ctx.transcripts.ingest(row.id, frame as TranscriptPayload);
      }
      return "stop";
    }
    return "continue";
  });

  const framesLost = onSessionFrame(({ message }, frame, instanceId) => {
    // Frames the agent could not keep while its link was down
    // (FRAMES_LOST): the transcript is read from its machine
    // again, so what was stored of them is drawn.
    if (
      frame.message.type === "system" &&
      frame.message.subtype === FRAMES_LOST
    ) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (row?.machineId === message.machineId) {
        console.warn(
          `[hub] ${row.id}: ${frame.message.content ?? "frames were lost while its machine's link was down"}; its transcript is read again`
        );
        ctx.transcripts.reread(row.id);
      }
      return "stop";
    }
    return "continue";
  });

  return {
    custodyHeld,
    leakFound,
    leakEnded,
    machineLineSaid,
    streamSoFar,
    framesLost,
  };
};
