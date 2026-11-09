/**
 * What a turn's end does, as one ordered list of named steps: the turn's end
 * reaches each in order, and the order here is the contract (a rule answers
 * before a hand-back is decided, its account's move is taken before the turn
 * is told over).
 */

import type { ArtifactNeed } from "@cawco/core/artifact-needs";
import type { Envelope, InstanceRow } from "@cawco/core/protocol";
import type { NeutralResultMessage } from "@cawco/core/session-messages";
import type { DbShape } from "../db";

export interface TurnEnd {
  /** The turn's end and what the steps learned as they ran. */
  artifactLeft: ArtifactNeed | undefined;
  cacheRow: ReturnType<DbShape["getInstancesByIds"]>[number] | undefined;
  cut: boolean;
  endedAt: Date;
  harness: string | undefined;
  instanceId: string;
  machineId: string;
  message: Envelope;
  neutral: NeutralResultMessage;
  onNoReply: boolean;
  parentId: string | null | undefined;
  row: InstanceRow | undefined;
  silent: boolean;
  text: string;
  turnId: string;
}

export type TurnEndStep = (turn: TurnEnd) => void;

/** Runs a turn's end through `steps` in their order. */
export const runTurnEnded = (
  steps: readonly TurnEndStep[],
  turn: TurnEnd
): void => {
  for (const step of steps) {
    step(turn);
  }
};
