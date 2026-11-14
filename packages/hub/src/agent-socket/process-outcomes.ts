/** What a session's process said of a send and of itself ending. */

import { relaunchOf } from "@cawco/core/relaunch";
import type { HubContext } from "../hub-context";
import { UNREAD } from "../sends";
import type { FrameAnswer, FrameRun } from "./frame-run";

export type ProcessOutcomesContext = Pick<
  HubContext,
  | "db"
  | "diedOnSignal"
  | "endPreviews"
  | "escalateRoutedAsks"
  | "finishStopDispatch"
  | "forgetPending"
  | "launchSettled"
  | "lifecycle"
  | "losePending"
  | "processEvent"
  | "processGeneration"
  | "publishInstances"
  | "releaseHeld"
  | "sessionAsleep"
  | "stopDispatches"
  | "takeBack"
  | "takeSendSignal"
  | "takeTaken"
  | "turnWaiters"
>;

export const processOutcomeStagesOf = (ctx: ProcessOutcomesContext) => {
  const rejectedSend = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // One send did not go: its record says so, and nothing else does.
    if (kind === "rejected" && message.instanceId) {
      const { uuid, error } = body;
      ctx.takeSendSignal(message.instanceId, {
        kind: "rejected",
        uuid,
        error,
      });
      return "stop";
    }
    return "continue";
  };

  const heldSend = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A send no process took, handed back whole by its machine: owed
    // again for the session's next process ({@link takeBack}).
    if (kind === "held_send" && message.instanceId) {
      const { send } = body;
      ctx.takeBack(message.machineId, message.instanceId, send);
      return "stop";
    }
    return "continue";
  };

  const takenSend = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A send handed over again that the session took already: read,
    // and no turn follows (sends.ts `takeTaken`).
    if (kind === "taken_send" && message.instanceId) {
      const { uuid } = body;
      ctx.takeTaken(message.instanceId, uuid);
      return "stop";
    }
    return "continue";
  };

  const stopped = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "stopped" && message.instanceId) {
      if (!ctx.lifecycle.confirm(message.machineId, message.instanceId, body)) {
        return "stop";
      }
      ctx.launchSettled(message.instanceId, "it was stopped");
      for (const [key, sent] of ctx.stopDispatches) {
        if (
          sent.instanceId === message.instanceId &&
          sent.machineId === message.machineId
        ) {
          ctx.finishStopDispatch(key, "runner-gone");
        }
      }
      ctx.turnWaiters
        .get(message.instanceId)
        ?.reject(
          new Error("the summariser session stopped before it answered")
        );
      ctx.releaseHeld(message.instanceId);
      ctx.endPreviews(message.instanceId);
      // Its live work took its final state as the end was confirmed
      // (lifecycle `confirmed`, tree-stops.ts), naming who stopped it
      // when the hub heard.
      // What it was sent and had not read did not go, unless it wrote
      // some of it down as it stopped.
      ctx.forgetPending(message.instanceId, UNREAD.stopped);
      ctx.escalateRoutedAsks(message.instanceId);
      ctx.publishInstances(message.machineId);
      return "stop";
    }
    return "continue";
  };

  const asleep = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "asleep" && message.instanceId) {
      const [process] = ctx.db.getInstancesByIds([message.instanceId]);
      if (
        process &&
        agentFrame.processGeneration === ctx.processGeneration(process)
      ) {
        const { died } = body;
        // Its process is gone: the credential it ran on grants
        // nothing from here, wherever that credential was printed
        // (a shell's env, a transcript). Its wake, a resume or a
        // restart after a signal, is a launch, which mints its
        // own (grantLaunch); a continuation is a session of its
        // own, with its own.
        ctx.db.revokeSessionIdentity(message.instanceId);
        ctx.launchSettled(
          message.instanceId,
          died ? "its process died" : "it went to sleep",
          ctx.processGeneration(process)
        );
        if (died) {
          ctx.diedOnSignal(message.machineId, message.instanceId, died);
        } else {
          ctx.sessionAsleep(message.machineId, message.instanceId);
        }
      }
      return "stop";
    }
    return "continue";
  };

  const recoveryUnavailable = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = agentFrame;
    if (kind === "recovery_unavailable" && message.instanceId) {
      const [process] = ctx.db.getInstancesByIds([message.instanceId]);
      if (
        !process ||
        agentFrame.processGeneration !== ctx.processGeneration(process)
      ) {
        return "stop";
      }
      ctx.lifecycle.unavailable(message.instanceId);
      ctx.db.settleUnavailableRecovery(message.instanceId);
      // A stored conversation stays resumable: what it was sent and
      // never read goes to the process that next runs it.
      ctx.losePending(
        message.instanceId,
        relaunchOf(process).kind !== "refused"
      );
      // Its held process is no longer this session's: what waited
      // for one goes to its next start.
      ctx.processEvent(message.instanceId);
      ctx.publishInstances(message.machineId);
      return "stop";
    }
    return "continue";
  };

  return {
    rejectedSend,
    heldSend,
    takenSend,
    stopped,
    asleep,
    recoveryUnavailable,
  };
};
