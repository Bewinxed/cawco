/** A control's answer finding who waits on it, and the fan-out to dashboards. */

import { clientAsk } from "../ask-presentation";
import type { HubContext } from "../hub-context";
import { peekToolStatus } from "../machine-answers";
import { externalizeImages } from "../media";
import type { TranscriptPayload } from "../transcripts";
import type { FrameAnswer, FrameRun } from "./frame-run";

export type ControlRepliesContext = Pick<
  HubContext,
  | "db"
  | "fleetSyncs"
  | "lateAnswer"
  | "lifecycle"
  | "logUnroutedReply"
  | "pending"
  | "pendingInstalls"
  | "publishInstances"
  | "registry"
  | "rewinds"
  | "sendFrame"
  | "streams"
  | "toolReleases"
  | "transcripts"
  | "waiting"
  | "welcomeConverge"
>;

export const controlReplyStagesOf = (ctx: ControlRepliesContext) => {
  const installAnswered = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = agentFrame;
    // An install answering, whoever asked for it: the cell is the hub's
    // to keep, and the reply still goes wherever it was going.
    const install = message.requestId
      ? ctx.pendingInstalls.get(message.requestId)
      : undefined;
    if (install && kind === "control_result" && message.requestId) {
      ctx.pendingInstalls.delete(message.requestId);
      // The release it was sent to reach is settled for this
      // machine, landed or not: a copy left older says why on its
      // row, and is sent no other until a newer release.
      if (install.newest) {
        ctx.toolReleases.answered(
          message.machineId,
          install.toolId,
          install.newest
        );
      }
      const status = peekToolStatus(message.payload);
      if (status) {
        ctx.db.setAgentToolCell(message.machineId, status);
        ctx.publishInstances(message.machineId);
      }
    }
    return "continue";
  };

  const syncAnswered = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A transcript delete answering: once the machine says it is gone,
    // every row that named it goes with it, through the one
    // per-session delete, and every dashboard sees it leave.
    // A sync answering, whoever asked for it: the machine's own account
    // of what it now has is the hub's to keep, and the reply still goes
    // wherever it was going.
    // A refusal is kept too, in the machine's words, on its row.
    if (
      message.requestId &&
      kind === "control_result" &&
      ctx.fleetSyncs.has(message.requestId)
    ) {
      ctx.fleetSyncs.answered(message.requestId, body);
      ctx.welcomeConverge.answered(message.machineId, body);
    }
    return "continue";
  };

  const controlAnswered = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A control a route is waiting on: the reply is that request's
    // answer and nobody else's news.
    if (kind === "control_result" && message.requestId) {
      ctx.lifecycle.answered(message.requestId, body.ok);
      const answering = ctx.waiting.get(message.requestId);
      if (answering) {
        ctx.waiting.delete(message.requestId);
        answering(body);
        return "stop";
      }
      // One whose caller was told no answer came is nobody's: said
      // once and dropped as it came. Read on for dashboards, a late
      // transcript's pictures were stored one by one on the hub's
      // thread, and three such answers held it past its updater's
      // 3 s (nightly 5575, obelisk, 2026-10-24 22:53:59).
      if (ctx.lateAnswer(message)) {
        return "stop";
      }
    }
    return "continue";
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
  const fanOut = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // From here on the message is bound for dashboards, which get
    // images as references to fetch when shown, not as bytes.
    externalizeImages(message.payload);
    // A control's reply that settles a Ledger command turns into that
    // command's `applied`/`failed` ack. Read BEFORE the routing below
    // but allowed to preempt nothing: if a dashboard is also waiting on
    // this request id the old way, it still gets its reply.
    const settled =
      kind === "control_result" &&
      message.requestId !== undefined &&
      ctx.streams.settleCommand(message.requestId, body);
    // A rewind that never started: its transcript was never cut.
    const rewound =
      kind === "control_result" && message.requestId
        ? ctx.rewinds.get(message.requestId)
        : undefined;
    if (rewound && message.requestId) {
      ctx.rewinds.delete(message.requestId);
      if (kind === "control_result" && !body.ok) {
        ctx.transcripts.reread(rewound);
      }
    }
    // A control's reply belongs to the dashboard that asked; the rest is fan-out.
    const requester =
      message.requestId && kind === "control_result"
        ? ctx.registry.takeRequester(message.requestId)
        : undefined;
    if (requester) {
      ctx.sendFrame(requester, message);
    }
    // An acknowledged command's reply is that command's news and nobody
    // else's — the same rule as the line above, in the newer dialect.
    // Without it the reply would fall through to the fleet-wide
    // broadcast that an unrouted `control_result` gets today, and every
    // dashboard would draw an error for a command it never sent.
    else if (settled) {
      return "stop";
    } else if (kind === "control_result") {
      // A reply without a live requester is not fleet news. This
      // includes late answers after a socket closed or a read timed out.
      if (!run.hubReply) {
        ctx.logUnroutedReply(message);
      }
      return "stop";
    } else if (kind === "frame" && message.instanceId) {
      // Folded into the session's transcript here, for every frame and
      // whether or not anyone follows it: what it changed is sequenced
      // onto the session's stream, so the ring can answer a resume from
      // a socket that connects a minute from now. Everything else —
      // permission_request, instances, delegate_event, usage, pulse,
      // error, and any kind a future build adds — broadcasts, so an
      // unknown kind is never silently dropped.
      ctx.transcripts.ingest(
        message.instanceId,
        message.payload as TranscriptPayload
      );
    } else if (kind === "permission_request") {
      // A parked ask goes out as the ledger's copy with its secrets hidden;
      // the ledger keeps the call as it was asked. One that is not parked is
      // a fault in the stages before this one.
      const ask = message.requestId
        ? ctx.pending.get(message.requestId)
        : undefined;
      if (!ask) {
        throw new Error(
          `Permission request ${message.requestId ?? "(no id)"} reached the fan-out without being parked.`
        );
      }
      ctx.registry.broadcast(clientAsk(ask));
    } else {
      ctx.registry.broadcast(message);
    }
    return "continue";
  };

  return { installAnswered, syncAnswered, controlAnswered, fanOut };
};
