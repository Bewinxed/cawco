/**
 * Whether this machine's refusals name `usability_feedback`: the fleet's
 * policy item says whether usability feedback is on (core fleet.ts
 * `MachineFleetConfig.usabilityFeedback`), set as each fleet delta is
 * applied (fleet-converger.ts). Off until the hub says otherwise.
 */
import { usabilityFeedbackWords } from "@cawco/core/words/usability-feedback";

let on = false;

/** The fleet's policy said whether usability feedback is on. */
export const feedbackHeard = (heard: boolean): void => {
  on = heard;
};

/** A refusal as an agent reads it: ending with the line naming usability_feedback while feedback is on. */
export const withFeedbackLine = (refusal: string): string =>
  on ? `${refusal} ${usabilityFeedbackWords.refusalLine}` : refusal;
