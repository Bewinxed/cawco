/**
 * The stories both options' states files share: the same chips, the same
 * states and the same scenes, so the two canvases differ only in the chip.
 */
import { type ChipSpec, everyState, KINDS, sample } from "./kinds";

const frame = (chips: ChipSpec[]) => ({ args: { scene: "list", chips } });

export const states = {
  every: frame(KINDS),
  session: frame(everyState(sample("session"))),
  pin: frame(everyState(sample("pin"))),
  decision: frame(everyState(sample("decision"))),
  artifact: frame(
    KINDS.filter((one) =>
      ["page", "canvas", "preview", "sheet", "site"].includes(one.kind)
    )
  ),
  task: frame(everyState(sample("task"))),
  todo: frame(everyState(sample("todo"))),
  plan: frame(everyState(sample("plan"))),
  step: frame(everyState(sample("step"))),
  routine: frame(everyState(sample("routine"))),
  workflow: frame([
    ...everyState(sample("workflow")),
    ...everyState(sample("run")),
  ]),
  project: frame(everyState(sample("project"))),
  machine: frame(everyState(sample("machine"))),
};

export const scenes = {
  single: {
    args: { scene: "single", chips: [{ ...sample("task"), state: "running" }] },
  },
  peekSession: {
    args: {
      scene: "peek",
      chips: [{ ...sample("session"), state: "working" }],
    },
  },
  peekTask: {
    args: { scene: "peek", chips: [{ ...sample("task"), state: "review" }] },
  },
  peekDecision: {
    args: { scene: "peek", chips: [{ ...sample("decision"), state: "sent" }] },
  },
};
