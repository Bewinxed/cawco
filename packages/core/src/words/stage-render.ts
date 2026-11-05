/**
 * What a daemon's render of a component canvas says an agent (agent
 * stage-render.ts, core stage.ts `StageRendered`): where its sweep stood
 * when its limit came, each section it did not draw and the read that draws
 * it, and the refusal when the one state asked never drew. Each names the
 * read to make next, never the same read again.
 */
import type { SectionUndrawn, SweepAt } from "../stage";

/** A read that draws one section alone: a state read of its first story. */
const readAlone = (first: string | null): string =>
  first
    ? `{ render: true, state: { story: "${first}" } } draws it alone`
    : "it has no stories to draw";

export const stageRenderWords = {
  /** Where a sweep stood in a section, as the clause after "it was still". */
  step: (at: SweepAt): string => {
    switch (at.step) {
      case "load":
        return "loading its states file";
      case "draw":
        return "reading its stories in the rig";
      case "probe":
        return "reading its stories' hover, focus and pressed states";
      case "move":
        return `playing ${at.story ?? "a story"}'s move`;
      case "post":
        return "posting its report";
      default:
        return at.step satisfies never;
    }
  },
  /** The head of a render answer's sections its sweep took and did not draw, `seconds` its limit. */
  undrawnHead: (seconds: number) =>
    `Sections this read ran out of its ${seconds} s before drawing (the report above has each as its last draw left it):`,
  /** One section the sweep took and did not draw, and the read that draws it. */
  undrawn: (one: SectionUndrawn) =>
    `- ${one.file}: ${one.at ? `it was still ${stageRenderWords.step(one.at)}` : "not begun"}; ${readAlone(one.first)}.`,
  /** The sections a state read left to their last draw: it draws its own section alone. */
  notAsked: (others: readonly SectionUndrawn[]) =>
    `This state read drew its own section alone; the others stand as their last draw left them, each drawn alone by a state read of its first story: ${others.map((one) => `${one.file}${one.first ? ` (${one.first})` : ""}`).join(", ")}.`,
  /**
   * A state read whose own section did not draw within the limit: where it
   * stood, and what to do, as its section alone needs longer than a read has.
   */
  stateUndrawn: (state: string, seconds: number, at: SweepAt | null) =>
    `State ${state}'s section did not finish drawing within ${seconds} s${at ? `: it was still ${stageRenderWords.step(at)} in ${at.file}` : ", and its page never began it"}. That section alone needs longer than one read has: split its states file in two (each a section of the canvas, with its own moves), then read the state again.`,
  /** The page itself never loaded. */
  notLoaded: (seconds: number) =>
    `The canvas page did not load within ${seconds} s: its stage is up but did not serve it. Read the canvas without render to see its stage's state and errors.`,
};
