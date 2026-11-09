/** Which frames reach their session at all: the frames that gate on the session this machine holds. */

import { CONTAINERS_ENDED, CONTAINERS_UNTRACKED } from "@cawco/core/harness";
import { ScratchWorktreeSchema } from "@cawco/core/stored-shapes";
import type { HubContext } from "../hub-context";
import { received } from "../stored-json";
import type { FrameAnswer, FrameRun } from "./frame-run";

export type SessionGateContext = Pick<
  HubContext,
  | "db"
  | "lifecycle"
  | "processGeneration"
  | "projectStops"
  | "recordSessionAddress"
  | "reportedMachinePath"
  | "summarisers"
  | "tellContainers"
>;

export const sessionGateStagesOf = (ctx: SessionGateContext) => {
  const scratchWorktreeFiled = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "scratch_worktree" && message.instanceId) {
      const row = ctx.db.ownedInstance(message.instanceId, message.machineId);
      const frame = body;
      const dir =
        row &&
        frame.processGeneration === ctx.processGeneration(row) &&
        ctx.reportedMachinePath(message.machineId, frame.worktree.dir);
      if (row && dir) {
        ctx.db.recordScratchWorktree(
          row.id,
          received(
            ScratchWorktreeSchema,
            frame.worktree,
            "a machine's scratch worktree frame"
          ),
          dir
        );
      }
      return "stop";
    }
    return "continue";
  };

  const sessionAddressed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame, ws } = run;
    const { kind } = agentFrame;
    if (kind === "session_address" && message.instanceId) {
      ctx.recordSessionAddress(ws, message.machineId, {
        instanceId: message.instanceId,
        sessionId: agentFrame.sessionId ?? "",
        processGeneration: agentFrame.processGeneration,
      });
      return "stop";
    }
    return "continue";
  };

  const sessionOwned = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = agentFrame;
    run.ownedSession = message.instanceId
      ? ctx.db.ownedInstance(message.instanceId, message.machineId)
      : undefined;
    if (message.instanceId && !run.ownedSession && kind !== "control_result") {
      return "stop";
    }
    return "continue";
  };

  const containersSaid = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // What its machine said of its containers (agent
    // session-containers.ts): they stopped as it ended, its parent,
    // else it, is told; or what it starts at a runtime with no door
    // will not, and it is told. Read
    // before an ended session's frames are dropped: the agent says
    // it once their stop timeouts have run, after its stop was
    // confirmed (r180: the agent's line was there, the hub's never).
    if (kind === "frame" && message.instanceId) {
      const said = body.message;
      if (
        said.type === "system" &&
        (said.subtype === CONTAINERS_ENDED ||
          said.subtype === CONTAINERS_UNTRACKED)
      ) {
        ctx.tellContainers(
          message.machineId,
          message.instanceId,
          said as { uuid?: unknown; content?: unknown },
          said.subtype === CONTAINERS_ENDED ? "ended" : "untracked"
        );
        return "stop";
      }
    }
    return "continue";
  };

  const endedSessionDropped = (run: FrameRun): FrameAnswer => {
    const { agentFrame } = run;
    const { kind } = agentFrame;
    if (
      run.ownedSession?.endConfirmedAt &&
      (kind === "frame" ||
        kind === "pulse" ||
        kind === "permission_request" ||
        kind === "rejected")
    ) {
      return "stop";
    }
    return "continue";
  };

  const stopFailed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // Reconciliation keeps failed end delivery pending; it is not a session failure.
    if (
      kind === "error" &&
      agentFrame.errorVerb === "stop" &&
      message.instanceId
    ) {
      ctx.lifecycle.deliveryFailed(message.instanceId);
    }
    if (
      kind === "error" &&
      agentFrame.errorVerb === "stop" &&
      run.ownedSession?.endIntent &&
      agentFrame.processGeneration === ctx.processGeneration(run.ownedSession)
    ) {
      const reason = agentFrame.endReason;
      if (reason) {
        ctx.db.noteEndReason(run.ownedSession.id, reason);
      }
    }
    if (
      kind === "error" &&
      agentFrame.errorVerb === "stop" &&
      run.ownedSession?.endIntent
    ) {
      // A forget waiting on it says why; the stop stays owed, and a
      // later confirmation still reports it stopped.
      ctx.projectStops.failed(run.ownedSession.id, body.message);
      return "stop";
    }
    return "continue";
  };

  const internalNoted = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    // A continuation's summariser: an internal worker only its
    // continuation talks to (see `summarisers`).
    run.internal =
      message.instanceId !== undefined &&
      ctx.summarisers.has(message.instanceId);
    return "continue";
  };

  return {
    scratchWorktreeFiled,
    sessionAddressed,
    sessionOwned,
    containersSaid,
    endedSessionDropped,
    stopFailed,
    internalNoted,
  };
};
