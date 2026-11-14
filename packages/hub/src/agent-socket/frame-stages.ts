/**
 * The order a machine's `frames` envelope is read in: one list, written
 * once here. A frame goes through it until a stage says stop (frame-run.ts).
 */

import {
  type AccountReadingsContext,
  accountReadingStagesOf,
} from "./account-readings";
import {
  type ControlRepliesContext,
  controlReplyStagesOf,
} from "./control-replies";
import type { FrameStage } from "./frame-run";
import {
  type IngestLedgerContext,
  ingestLedgerStagesOf,
} from "./ingest-ledger";
import { type MachineLinesContext, machineLineStagesOf } from "./machine-lines";
import {
  type MachineReportsContext,
  machineReportStagesOf,
} from "./machine-reports";
import {
  type ProcessOutcomesContext,
  processOutcomeStagesOf,
} from "./process-outcomes";
import { type SessionGateContext, sessionGateStagesOf } from "./session-gate";
import {
  type SessionSignalsContext,
  sessionSignalStagesOf,
} from "./session-signals";
import { type TurnFlowContext, turnFlowStagesOf } from "./turn-flow";

export type FrameStagesContext = MachineReportsContext &
  SessionGateContext &
  ProcessOutcomesContext &
  MachineLinesContext &
  IngestLedgerContext &
  SessionSignalsContext &
  AccountReadingsContext &
  TurnFlowContext &
  ControlRepliesContext;

export const frameStagesOf = (ctx: FrameStagesContext): FrameStage[] => {
  const stages0 = machineReportStagesOf(ctx);
  const stages1 = sessionGateStagesOf(ctx);
  const stages2 = processOutcomeStagesOf(ctx);
  const stages3 = machineLineStagesOf(ctx);
  const stages4 = ingestLedgerStagesOf(ctx);
  const stages5 = sessionSignalStagesOf(ctx);
  const stages6 = accountReadingStagesOf(ctx);
  const stages7 = turnFlowStagesOf(ctx);
  const stages8 = controlReplyStagesOf(ctx);
  return [
    stages0.commandQueue,
    stages0.stageChanged,
    stages0.stageCloneFiled,
    stages0.browsersHeard,
    stages0.fleetReported,
    stages0.catalogMoved,
    stages0.fleetConverging,
    stages0.browserHandedBack,
    stages0.passkeyAdvertHeard,
    stages0.streamRelayHeard,
    stages0.moveProgressed,
    stages0.accountBorrowed,
    stages0.controlResultNamed,
    stages1.scratchWorktreeFiled,
    stages1.sessionAddressed,
    stages1.sessionOwned,
    stages1.containersSaid,
    stages1.endedSessionDropped,
    stages1.stopFailed,
    stages1.internalNoted,
    stages2.rejectedSend,
    stages2.heldSend,
    stages2.takenSend,
    stages2.stopped,
    stages2.asleep,
    stages2.recoveryUnavailable,
    stages3.custodyHeld,
    stages3.leakFound,
    stages3.leakEnded,
    stages3.machineLineSaid,
    stages3.streamSoFar,
    stages3.framesLost,
    stages4.ingestLedger,
    stages4.admittedFrameRead,
    stages4.keepAliveFrame,
    stages5.sessionNamed,
    stages5.settingsFiled,
    stages5.sendSignalHeard,
    stages5.sessionDirRead,
    stages5.relaunchAsked,
    stages5.effortRead,
    stages6.accountRead,
    stages7.turnFrames,
    stages7.permissionAsked,
    stages7.permissionSettled,
    stages7.pulseHeard,
    stages7.namedFromTurn,
    stages7.summariserAnswered,
    stages7.providerRetrying,
    stages7.turnEnded,
    stages7.observers,
    stages7.spawnFailed,
    stages8.installAnswered,
    stages8.syncAnswered,
    stages8.controlAnswered,
    stages8.fanOut,
  ];
};
