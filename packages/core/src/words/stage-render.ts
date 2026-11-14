/**
 * What a daemon's render of a component canvas says an agent (agent
 * stage-render.ts, core stage.ts `StageRendered`), and a read of sections
 * a browser was drawing as it answered: where its sweep stood
 * when its limit came, each section it did not draw and the read that draws
 * it, and the refusal when the one state asked never drew. Each names the
 * read to make next, never the same read again.
 */
import type { FramesAlike, SectionUndrawn, SweepAt } from "../stage";

/** A read that draws one section alone: a state read of its first story. */
const readAlone = (first: string | null): string =>
  first
    ? `{ render: true, state: { story: "${first}" } } draws it alone`
    : "it has no stories to draw";

export const stageRenderWords = {
  /**
   * A story's frame refused because its `beforeEach` seeds a module no
   * import chain from the states file carries to its component (a helper
   * that imports the store, say): the story would draw the page's store,
   * not its own (stage-host host.ts `ownSet`).
   */
  seedUnreached: (component: string) =>
    `This story's seed cannot reach ${component}: its beforeEach imports a module that ${component} does not import, so the component reads the page's store, not this story's. Import the store the component reads in beforeEach itself (\`const store = await import("…")\`) and seed it there.`,
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
  undrawn: (one: SectionUndrawn, plansRead: boolean) =>
    `- ${one.file}: ${one.at ? `it was still ${stageRenderWords.step(one.at)}` : "not begun"}${plansRead ? `; ${readAlone(one.first)}` : ""}.`,
  /** Said once with the undrawn sections when the page's plan could not be read: their first stories are not known, which is not that they have none. */
  plansUnread:
    "The page's plan of each section's first story could not be read, so the first story of each section below is not named: read its states file for it, then draw it alone with a state read.",
  /** The sections a state read left to their last draw: it draws its own section alone. */
  notAsked: (others: readonly SectionUndrawn[]) =>
    `This state read drew its own section alone; the others stand as their last draw left them, each drawn alone by a state read of its first story: ${others.map((one) => `${one.file}${one.first ? ` (${one.first})` : ""}`).join(", ")}.`,
  /**
   * A state read naming `story` bare where states files `files` each export
   * it: the `file:Story` form `state.story` takes, one per file, ready to
   * send (hub routes.ts `STATE_ASK` accepts each).
   */
  storyInSeveral: (story: string, files: readonly string[]) =>
    `${story} is a story of ${files.length} states files on this canvas. Name the one to read with its file in state.story: ${files.map((file) => `{ story: "${file}:${story}" }`).join(" or ")}.`,
  /**
   * A state read whose own section did not draw within the limit: where it
   * stood, and what to do, as its section alone needs longer than a read has.
   */
  stateUndrawn: (state: string, seconds: number, at: SweepAt | null) =>
    `State ${state}'s section did not finish drawing within ${seconds} s${at ? `: it was still ${stageRenderWords.step(at)} in ${at.file}` : ", and its page never began it"}. That section alone needs longer than one read has: split its states file in two (each a section of the canvas, with its own moves), then read the state again.`,
  /** The sections a browser was drawing as a read answered, past the read's wait for them (hub component.ts `drawingUnseen`). */
  drawing: (files: readonly string[]) =>
    `A browser is drawing ${files.join(", ")} now and has not posted ${files.length === 1 ? "it" : "them"}: ${files.length === 1 ? "its" : "their"} frames read unseen until it does, within seconds. Read again.`,
  /** A move whose animations were still running when its wait for them ended (core `MoveRender.stillRunning`): what its report holds was read mid-motion. */
  moveUnsettled: (running: number) =>
    `${running} ${running === 1 ? "animation was" : "animations were"} still running when this move's wait for them ended: its read and its picture were taken mid-motion.`,
  /** Stories that differ in nothing but their width (core `RenderReport.widthOnly`): one state, drawn at each width by the canvas's own presets. */
  widthOnly: (stories: readonly string[]) =>
    `${stories.join(", ")} differ in nothing but their width: they are one state. Keep one story and let the canvas draw it at each width the person picks; a piece with one production width names it once, on the meta's parameters.viewport.`,
  /** A label holding a word of code (core `RenderReport.codeNamed`). */
  codeNamed: (story: string, word: string) =>
    `${story}'s label says ${word}, a word of code: write it as the sentence the person would say about the situation.`,
  /** Frames that draw the same picture (core `framesAlike`). */
  alike: (one: FramesAlike) =>
    `${one.stories.join(", ")} draw the same picture at ${one.width} px: keep the one that helps the person judge, or make what tells them apart show.`,
  /** A list cut where more stood past it: the notice that ends it, naming what the rest are ("deltas", "errors", "interactions it could not force"). */
  andMore: (more: number, what: string) => `and ${more} more ${what}`,
  /** A frame whose body held more elements than a reading walks (agent canvas measure.ts `ELEMENTS_READ`): its parts, its look and its states' deltas are of the first `read` only. */
  elementsRead: (read: number, of: number) => `${read} of ${of} elements read`,
  /** The page itself never loaded. */
  notLoaded: (seconds: number) =>
    `The canvas page did not load within ${seconds} s: its stage is up but did not serve it. Read the canvas without render to see its stage's state and errors.`,
};
