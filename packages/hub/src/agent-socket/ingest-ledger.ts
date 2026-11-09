/** The ingest ledger's gate, what reads every admitted frame, and keep-alive pings. */

import { detach } from "@cawco/core/detach";
import { readProvenance, readSent } from "@cawco/core/stream";
import { isProjectConversation } from "../caw";
import type { HubContext } from "../hub-context";
import { keepAliveResult, keepAliveUsage } from "../keep-alive";
import type { FrameAnswer, FrameRun } from "./frame-run";
import { peekSendSignal } from "./wire-reads";

export type IngestLedgerContext = Pick<
  HubContext,
  | "db"
  | "keepAliveScheduler"
  | "memoryWatch"
  | "publishInstances"
  | "recordTurnUsage"
  | "routines"
  | "streams"
  | "takeSendSignal"
>;

export const ingestLedgerStagesOf = (ctx: IngestLedgerContext) => {
  const ingestLedger = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = agentFrame;
    // THE INGEST LEDGER (design §7): a line becomes a hub frame AT MOST
    // ONCE per (instanceId, epoch, srcSeq). A returning agent replays
    // the gap this hub named on its register ack, and an overshoot —
    // a cursor the hub had already passed, a re-sent line after a
    // socket drop — stops dead here rather than being sequenced twice.
    // Before every side effect below on purpose: a duplicate that got
    // this far would re-name the session, re-fire the rules and
    // re-deliver a delegate's report.
    if (
      kind === "frame" &&
      message.instanceId &&
      !ctx.streams.admitFrame(
        message.instanceId,
        readProvenance(message),
        readSent(message)
      )
    ) {
      return "stop";
    }
    return "continue";
  };

  const admittedFrameRead = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // What a memory note written now is tainted by (memory.ts): every
    // admitted frame, before any path below leaves early, so a
    // keep-alive's result ends its turn too.
    if (kind === "frame" && message.instanceId) {
      const admitted = body;
      ctx.memoryWatch.frame(
        message.instanceId,
        admitted.message,
        admitted.harness
      );
      // A routine run's session's words, for a failure that gives
      // no reason (routines.ts `said`): a project conversation's
      // from before its wake's read receipt too. None of a stream's
      // deltas carry them.
      if (admitted.message.type !== "stream_event") {
        const [framed] = ctx.db.getInstancesByIds([message.instanceId]);
        ctx.routines.said(
          message.instanceId,
          admitted.message,
          !!framed && isProjectConversation(framed, ctx.db.project)
        );
      }
    }
    return "continue";
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
  const keepAliveFrame = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // Pings share admission and send receipts, then leave before every
    // consumer that makes a turn into work, attention or activity.
    if (message.instanceId && (kind === "frame" || kind === "pulse")) {
      const [row] = ctx.db.getInstancesByIds([message.instanceId]);
      const frame = kind === "frame" ? body : undefined;
      const signal = frame ? peekSendSignal(frame) : undefined;
      const quiet = !!row?.keepAliveTurn || frame?.keepAlive === true;
      if (quiet && row) {
        if (signal) {
          ctx.takeSendSignal(row.id, signal);
          if (
            signal.kind !== "read" ||
            ctx.db.getInstancesByIds([row.id])[0]?.keepAliveTurn
          ) {
            return "stop";
          }
        } else if (frame) {
          frame.keepAlive = true;
          frame.message.keepAlive = true;
          const neutral = frame.message;
          if (neutral.type === "result") {
            if (!(
              neutral.uuid &&
              ctx.db.claimCompletedTurn(
                row.id,
                neutral.uuid,
                neutral.timestamp,
                neutral.recovered === true
              )
            )) {
              return "stop";
            }
            ctx.recordTurnUsage(row, neutral, true);
            // A ping is one request: its usage is the context.
            ctx.db.updateKeepAlive(
              row.id,
              keepAliveResult(
                row,
                neutral,
                true,
                neutral.cache ? keepAliveUsage(neutral).input : undefined
              )
            );
            const usage = keepAliveUsage(neutral);
            console.info(
              `[keepalive] ${row.id}: result ${neutral.uuid} input=${usage.input} read=${usage.read} write=${usage.write} at ${new Date().toISOString()}`
            );
            // A refreshed request establishes the next original deadline.
            detach(ctx.keepAliveScheduler.wake(), "keepalive wake");
            ctx.publishInstances(row.machineId);
          }
          ctx.streams.sequence(row.id, { ...frame, keepAlive: true });
          return "stop";
        } else {
          return "stop";
        }
      }
    }
    return "continue";
  };

  return { ingestLedger, admittedFrameRead, keepAliveFrame };
};
