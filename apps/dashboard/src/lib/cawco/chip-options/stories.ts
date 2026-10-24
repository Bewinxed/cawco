/**
 * The stories both options' states files share: the same chips, the same
 * states and the same scenes, so the two canvases differ only in the chip.
 */
import { ARTIFACTS, type ChipSpec, everyState, KINDS, sample } from "./kinds";

const frame = (chips: ChipSpec[]) => ({ args: { scene: "list", chips } });

export const states = {
  every: frame(KINDS),
  session: frame(everyState(sample("session"))),
  pin: frame(everyState(sample("pin"))),
  decision: frame(everyState(sample("decision"))),
  artifact: frame(ARTIFACTS),
  task: frame(everyState(sample("task"))),
  todo: frame(everyState(sample("todo"))),
  plan: frame(everyState(sample("plan"))),
  step: frame(everyState(sample("step"))),
  routine: frame(everyState(sample("routine"))),
  project: frame(everyState(sample("project"))),
  machine: frame(everyState(sample("machine"))),
};

export const scenes = {
  single: {
    args: { scene: "single", chips: [{ ...sample("task"), state: "active" }] },
  },
  peekTask: {
    args: { scene: "peek", chips: [{ ...sample("task"), state: "you" }] },
  },
};
