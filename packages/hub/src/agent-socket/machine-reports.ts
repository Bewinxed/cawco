/** A machine's own reports on its socket, none naming a session: each is taken in whole. */

import { detach } from "@cawco/core/detach";
import { stagePlaceRef } from "../caw";
import type { HubContext } from "../hub-context";
import type { FrameAnswer, FrameRun } from "./frame-run";
import { isFleetReport } from "./wire-reads";

export type MachineReportsContext = Pick<
  HubContext,
  | "answerBorrow"
  | "artifacts"
  | "browserStream"
  | "browsers"
  | "commandQueues"
  | "db"
  | "fleetSyncs"
  | "keepFleetReport"
  | "moves"
  | "passkeyRelay"
  | "pendingInstalls"
  | "ridingReported"
  | "stageHeard"
  | "storedRecent"
  | "streamRelay"
  | "welcomeConverge"
  | "workItems"
>;

export const machineReportStagesOf = (ctx: MachineReportsContext) => {
  // What a machine says on its socket, read in this order (agent-socket/frame-run.ts).
  const commandQueue = (run: FrameRun): FrameAnswer => {
    const { agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "command_queue") {
      const { runId, queue } = body;
      ctx.commandQueues.get(runId)?.(queue);
      return "stop";
    }
    return "continue";
  };

  const stageChanged = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A workspace's stage changed: each of its sheets keeps the state.
    if (kind === "stage") {
      const frame = body;
      ctx.artifacts.staged(message.machineId, frame);
      ctx.stageHeard(frame);
      return "stop";
    }
    return "continue";
  };

  const stageCloneFiled = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A place's stage clone is cut and in step: filed as a workspace.
    if (kind === "stage-clone") {
      const frame = body;
      const by = ctx.db
        .listInstances()
        .find(
          (one) =>
            one.machineId === message.machineId &&
            stagePlaceRef(one).id === frame.place &&
            !ctx.workItems.workspaceOf(one)
        );
      if (!by) {
        console.warn(
          `[workspaces] ${message.machineId}: a stage clone of place ${frame.place} that no session there names was not filed`
        );
        return "stop";
      }
      detach(
        ctx.workItems.fileStageClone(message.machineId, frame, by.id),
        `file the stage clone ${frame.id}`
      );
      return "stop";
    }
    return "continue";
  };

  const browsersHeard = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A machine's browsers, whole: kept by the hub's browser registry
    // (browsers.ts, Projects spec §5.11), which tells every
    // dashboard the fleet's browsers whole (`browser_list`).
    if (kind === "browsers") {
      ctx.browsers.heard(message.machineId, body);
      ctx.browserStream.heard(message.machineId, body);
      return "stop";
    }
    return "continue";
  };

  const fleetReported = (run: FrameRun): FrameAnswer => {
    const { message, ws, agentFrame } = run;
    const { kind, body } = agentFrame;
    // The machine's fleet report, sent unasked as a converge ends or
    // a reading moved with no fleet change: kept, and the fleet MCP
    // changes its last delta carried go to the sessions there.
    if (kind === "fleet_report") {
      const { report, generation, convergedGeneration } = body;
      ctx.welcomeConverge.reported(message.machineId, convergedGeneration);
      if (isFleetReport(report)) {
        ctx.keepFleetReport(
          message.machineId,
          ws,
          report,
          ctx.ridingReported(message.machineId, generation ?? null)
        );
      }
      return "stop";
    }
    return "continue";
  };

  const catalogMoved = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // Its stored transcripts moved (agent catalog-index.ts): Recent's
    // stored list reads its catalog again when they may move it.
    if (kind === "catalog_moved") {
      const { sessions } = body;
      if (Array.isArray(sessions)) {
        detach(
          ctx.storedRecent.heard(message.machineId, sessions),
          "read the machine's catalog"
        );
      }
      return "stop";
    }
    return "continue";
  };

  const fleetConverging = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // Its items as they converge (fleet-sync.ts): kept on its row.
    if (kind === "fleet_converge") {
      const { items, generation } = body;
      if (Array.isArray(items)) {
        ctx.fleetSyncs.converged(message.machineId, items);
        ctx.welcomeConverge.converging(message.machineId, generation, items);
      }
      return "stop";
    }
    return "continue";
  };

  const browserHandedBack = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // A take-over its machine ended itself: the ask's call answers.
    if (kind === "browser_handback") {
      ctx.browsers.heardHandback({
        ...body,
        machineId: message.machineId,
      });
      return "stop";
    }
    return "continue";
  };

  const streamRelayHeard = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    // The stream relay on its machine: the relay's record follows it.
    if (kind === "stream_relay") {
      ctx.streamRelay.heard({
        ...body,
        machineId: message.machineId,
      });
      return "stop";
    }
    return "continue";
  };

  const moveProgressed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "move_progress") {
      ctx.moves.progress(message.machineId, body);
      return "stop";
    }
    return "continue";
  };

  const accountBorrowed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind, body } = agentFrame;
    if (kind === "account_borrow") {
      ctx.answerBorrow(message.machineId, body).catch(console.error);
      return "stop";
    }
    return "continue";
  };

  const passkeyAdvertHeard = (run: FrameRun): FrameAnswer => {
    const { agentFrame } = run;
    const { kind, body } = agentFrame;
    // A BLE scanner captured a FIDO advert: the passkey relay routes it.
    if (kind === "passkey_advert") {
      const { key } = body;
      if (typeof key === "string") {
        ctx.passkeyRelay.captured(key);
      }
      return "stop";
    }
    return "continue";
  };

  const controlResultNamed = (run: FrameRun): FrameAnswer => {
    const { message, agentFrame } = run;
    const { kind } = agentFrame;
    if (kind === "control_result" && !message.requestId) {
      message.requestId = agentFrame.requestId;
    }
    run.hubReply =
      kind === "control_result" &&
      message.requestId !== undefined &&
      (ctx.pendingInstalls.has(message.requestId) ||
        ctx.fleetSyncs.has(message.requestId));
    return "continue";
  };

  return {
    commandQueue,
    stageChanged,
    stageCloneFiled,
    browsersHeard,
    fleetReported,
    catalogMoved,
    fleetConverging,
    browserHandedBack,
    passkeyAdvertHeard,
    streamRelayHeard,
    moveProgressed,
    accountBorrowed,
    controlResultNamed,
  };
};
