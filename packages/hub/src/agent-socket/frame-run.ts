/**
 * The stage list a machine's `frames` envelope goes through, one frame at a
 * time, in the list's order. Each stage answers whether the frame goes on: a
 * stage that takes the frame in whole says stop and no later stage reads it.
 */

import type { AgentFrame } from "@cawco/core/agent-frame";
import type { FramePayload } from "@cawco/core/frames";
import type { Envelope } from "@cawco/core/protocol";
import type { DbShape } from "../db";
import type { AuthSocket } from "../hub-shapes";

export type FrameAnswer = "stop" | "continue";

/** One frame as the stages read it, and what earlier stages learned of it. */
export interface FrameRun {
  agentFrame: AgentFrame;
  /** Whether an install or a fleet sync is waiting on this control's reply. */
  hubReply: boolean;
  /** A continuation's summariser: an internal worker only its continuation talks to. */
  internal: boolean;
  message: Envelope;
  /** The session the frame names, when this machine holds it. */
  ownedSession: ReturnType<DbShape["ownedInstance"]>;
  ws: AuthSocket;
}

export type FrameStage = (run: FrameRun) => FrameAnswer;

/** A stage for a session's own output: a `frame` naming its session. */
export type SessionFrameStage = (
  run: FrameRun,
  frame: Extract<FramePayload, { kind: "frame" }>,
  instanceId: string
) => FrameAnswer;

/** `stage` over a session's own output; any other frame goes on past it. */
export const onSessionFrame =
  (stage: SessionFrameStage): FrameStage =>
  (run) => {
    const { message, agentFrame } = run;
    return agentFrame.kind === "frame" && message.instanceId
      ? stage(run, agentFrame.body, message.instanceId)
      : "continue";
  };

/** Runs `run` through `stages` in order, as far as they let it go. */
export const runFrameStages = (
  stages: readonly FrameStage[],
  run: FrameRun
): void => {
  for (const stage of stages) {
    if (stage(run) === "stop") {
      return;
    }
  }
};
