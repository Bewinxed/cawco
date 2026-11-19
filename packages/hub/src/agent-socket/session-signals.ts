/** What a session says of its conversation, its settings, its sends and its effort. */

import { EFFORT_READ, SESSION_DIR_READ, SPENT_READ } from "@cawco/core/harness";
import { EFFORT_NONE, isEffortLevel } from "@cawco/core/harness/kinds";
import { cutCommandsWords } from "../cut-turns";
import type { HubContext } from "../hub-context";
import { type FrameAnswer, type FrameRun, onSessionFrame } from "./frame-run";
import { peekSendSignal, RELAUNCH_SUBTYPES } from "./wire-reads";

export type SessionSignalsContext = Pick<
  HubContext,
  | "db"
  | "effortUnasked"
  | "interruptedTurns"
  | "landSessionDir"
  | "lifetime"
  | "noteSessionSettings"
  | "notesOnly"
  | "projectAtFolder"
  | "processGeneration"
  | "recordTurnUsage"
  | "relaunchAtRest"
  | "releaseHeld"
  | "reportedMachinePath"
  | "resumeCutTurn"
  | "takeSendSignal"
  | "turnInFlight"
  | "turnOver"
  | "turnUnderWay"
  | "turnsWritten"
  | "workItems"
>;

/**
 * The effort a session's `EFFORT_READ` names, as the harness named it, a
 * level this build does not know included (the row's read narrows it, db
 * instances.ts `sessionEfforts`); `none` when it names none.
 */
const effortNamed = (effort: unknown): string =>
  typeof effort === "string" ? effort : EFFORT_NONE;

export const sessionSignalStagesOf = (ctx: SessionSignalsContext) => {
  const sessionNamed = onSessionFrame(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stage of the agent socket: its branches are this frame kind's handling in its fixed sequence.
    ({ message, agentFrame }, frame, instanceId) => {
      // The conversation the session is writing, whenever it names one —
      // read before anything below can consume the frame, since a
      // `held` naming it is also a send signal.
      const neutral = frame.message;
      if (neutral.type === "result") {
        if (!neutral.uuid) {
          console.error(
            `[hub] completion ${instanceId} has no harness result identity`
          );
          ctx.turnInFlight.over(instanceId);
          return "stop";
        }
        if (
          !ctx.db.claimCompletedTurn(
            instanceId,
            neutral.uuid,
            neutral.timestamp,
            neutral.recovered === true
          )
        ) {
          ctx.turnInFlight.over(instanceId);
          return "stop";
        }
        const [claimed] = ctx.db.getInstancesByIds([instanceId]);
        if (claimed) {
          ctx.recordTurnUsage(claimed, neutral, false);
        }
        if (neutral.serverStopped === true) {
          // Cut, not ended: the server it ran in stopped. Handed
          // back once this result is taken in like any other.
          const cutId = instanceId;
          const stoppedAt = new Date();
          const cutWords = cutCommandsWords(neutral.cut);
          ctx.lifetime.after("cut turn resumed", 0, () =>
            ctx.resumeCutTurn(cutId, stoppedAt, cutWords)
          );
        } else {
          ctx.turnOver(instanceId);
        }
      }
      const named = agentFrame.sessionKey();
      if (named) {
        ctx.db.noteInstanceSession(
          instanceId,
          named.sessionId,
          named.cwd
            ? ctx.reportedMachinePath(message.machineId, named.cwd)
            : undefined,
          named.tooling,
          named.commands,
          ctx.projectAtFolder
        );
        if (named.init) {
          // The session naming its own conversation is the daemon's word
          // that a process exists — first-hand, and the earliest such word
          // there is. Promoting on it means a fresh spawn reads `running`
          // in a second rather than waiting up to a beat for the heartbeat
          // to say the same thing. The row is left alone if it is already
          // there; `markInstanceLive` only touches the states a live
          // process can be wrongly filed under.
          ctx.db.markInstanceLive(instanceId);
          const [live] = ctx.db.getInstancesByIds([instanceId]);
          if (live) {
            ctx.workItems.started(live);
          }
          ctx.releaseHeld(instanceId);
          // A launch's own word: what it has open is written anew,
          // and a turn a restart cut goes back to it now it is up.
          ctx.turnsWritten.delete(instanceId);
          ctx.interruptedTurns.delete(instanceId);
          ctx.resumeCutTurn(instanceId);
        }
      }
      return "continue";
    }
  );

  const settingsFiled = (run: FrameRun): FrameAnswer => {
    const { message } = run;
    const { kind } = message.payload;
    // Applied settings are filed before a control reply is consumed
    // by REST or turned into a dashboard acknowledgement.
    if ((kind === "frame" || kind === "control_result") && message.instanceId) {
      ctx.noteSessionSettings(message.instanceId, message.payload);
    }
    return "continue";
  };

  const sendSignalHeard = onSessionFrame((_run, frame, instanceId) => {
    // The harness's word on its sends becomes their records, and goes
    // no further: every screen hears it as the records' `send` frames.
    // Everything else the session says is read for what its turn
    // makes of the sends it read (rule b).
    const signal = peekSendSignal(frame);
    if (signal) {
      // Its harness taking up a send is its turn starting, but
      // for CawCo's quiet notes alone, which it stores at rest
      // and reads with its next turn (sends.ts `notesOnly`).
      if (signal.kind === "read" && !ctx.notesOnly(signal.read)) {
        ctx.turnUnderWay(instanceId);
      }
      ctx.takeSendSignal(instanceId, signal);
      return "stop";
    }
    return "continue";
  });

  const sessionDirRead = onSessionFrame(({ agentFrame }, frame, instanceId) => {
    // A launch's word that its session's data is in place: the
    // row names that dir's account from now on. Only the row's
    // own launch says it; a process since replaced does not.
    if (
      frame.message.type === "system" &&
      frame.message.subtype === SESSION_DIR_READ
    ) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (row && agentFrame.processGeneration === ctx.processGeneration(row)) {
        ctx.landSessionDir(row, frame.message.account_id ?? null);
      }
      return "stop";
    }
    return "continue";
  });

  const relaunchAsked = onSessionFrame(({ message }, frame, instanceId) => {
    // A session whose boundary hook fails open, whose Claude Code
    // process ran a manual /compact, or whose process names
    // another MCP gateway port, at a turn boundary: relaunched on
    // its conversation when idle.
    const relaunchFor =
      frame.message.type === "system"
        ? RELAUNCH_SUBTYPES.get(frame.message.subtype)
        : undefined;
    if (relaunchFor) {
      const { machineId } = message;
      const why = relaunchFor;
      ctx
        .relaunchAtRest(machineId, instanceId, why)
        .catch((error: unknown) =>
          console.error(
            `[hub] ${why}: relaunching ${instanceId} failed: ${String(error)}`
          )
        );
      return "stop";
    }
    return "continue";
  });

  const effortRead = onSessionFrame((_run, frame, instanceId) => {
    // The session's effort as its agent read it back: what its
    // chip shows, and no screen's line. Never the effort its
    // launches ask for: a launch that ran at its CLI's default
    // or a clamp would otherwise hand that level to every later
    // launch (`chosenEffort`, {@link bounded}).
    if (
      frame.message.type === "system" &&
      frame.message.subtype === EFFORT_READ
    ) {
      const { effort } = frame.message;
      const level = isEffortLevel(effort) ? effort : EFFORT_NONE;
      // An effort picked while its machine was away is held for the
      // process until it takes it (setting-picks.ts): its reading until
      // then is what it ran at before the pick, never shown over it.
      const held = ctx.db.heldPicks.get(instanceId)?.effort !== undefined;
      if (!held) {
        ctx.db.noteInstanceEffort(instanceId, effortNamed(effort));
      }
      // Launched with no effort of its own: this is what its
      // model runs at by default on its account.
      if (ctx.effortUnasked.delete(instanceId)) {
        const [row] = ctx.db.getInstancesByIds([instanceId]);
        const accountId = row?.accountId;
        if (accountId && row?.model) {
          ctx.db.accounts.putDefaultEffort(accountId, row.model, level);
        }
      }
      return "stop";
    }
    return "continue";
  });

  const spentRead = onSessionFrame((_run, frame, instanceId) => {
    // What the session spent outside any turn (pi's prompt cache kept warm
    // between runs): recorded as a turn's spend is, under the harness's own
    // id for it, which a replayed frame repeats and the record ignores. No
    // screen's line.
    const neutral = frame.message;
    if (neutral.type !== "system" || neutral.subtype !== SPENT_READ) {
      return "continue";
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (row && neutral.uuid && neutral.spent) {
      ctx.recordTurnUsage(
        row,
        {
          type: "result",
          subtype: "success",
          is_error: false,
          uuid: neutral.uuid,
          ...(neutral.timestamp ? { timestamp: neutral.timestamp } : {}),
          turnUsage: neutral.spent,
        },
        false
      );
    }
    return "stop";
  });

  return {
    spentRead,
    sessionNamed,
    settingsFiled,
    sendSignalHeard,
    sessionDirRead,
    relaunchAsked,
    effortRead,
  };
};
