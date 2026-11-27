/**
 * What a daemon's render of a design graph says an agent (agent
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
  /** A layout read whose state stood posed and whose page answered no guides: a stage served by a daemon older than the guides. */
  layoutUnread: (story: string) =>
    `State ${story} was drawn, but its page laid no alignment guides over it: the stage's page predates them. Update the daemon on the workspace's machine, then read again.`,
  /** A states file's weight, as a measurement: what its page loaded. */
  weight: (modules: number, bytes: number) =>
    `It loads ${modules} ${modules === 1 ? "module" : "modules"}, ${bytes} bytes.`,
  /**
   * A story's frame refused because its `beforeEach` seeds a module no
   * import chain from the states file carries to its component (a helper
   * that imports the store, say): the story would draw the page's store,
   * not its own (stage-host host.ts `ownSet`).
   */
  /** A story whose drawing threw on a page, as the stage tells its agent: the story by its export, then the browser's error. */
  storyThrew: (story: string, message: string) =>
    `Story ${story} threw as it drew: ${message}`,
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
  /** The head of a render answer's sections its sweep took and did not draw: its page went quiet, or its read was let go, first. */
  undrawnHead:
    "Sections this read stopped before drawing, its page gone quiet or the read let go (the report above has each as its last draw left it):",
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
    `${story} is a story of ${files.length} states files on this design graph. Name the one to read with its file in state.story: ${files.map((file) => `{ story: "${file}:${story}" }`).join(" or ")}.`,
  /**
   * A state read whose own section did not finish drawing before its page
   * went quiet or the read was let go: where it stood, and what to do.
   */
  stateUndrawn: (state: string, at: SweepAt | null) =>
    `State ${state}'s section did not finish drawing${at ? `: its page went quiet while it was still ${stageRenderWords.step(at)} in ${at.file}` : ": its page went quiet before it began it"}. Read the design graph without render to see its stage's errors, or split its states file in two (each a section of the design graph, with its own moves), then read the state again.`,
  /** A posed state whose fonts or animations were still going as its page went quiet (agent frame-picture.ts `poseState`). */
  unsettled: (state: string) =>
    `State ${state} did not settle: its fonts or animations are still going.`,
  /** The sections a browser was drawing as a read answered, past the read's wait for them (hub component.ts `drawingUnseen`). */
  /** States files the stage's own page has not read as they stand and is not reading: the read's reader did not reach them. */
  unopened: (files: readonly string[]) =>
    `Not read as ${files.length === 1 ? "it stands" : "they stand"}: ${files.join(", ")}. The daemon's page of this canvas has not read ${files.length === 1 ? "it" : "them"} since ${files.length === 1 ? "it" : "they"} changed; read again to have it read ${files.length === 1 ? "it" : "them"}.`,
  drawing: (files: readonly string[]) =>
    `The daemon's page of this canvas is reading ${files.join(", ")} now and has not posted ${files.length === 1 ? "it" : "them"}: ${files.length === 1 ? "its" : "their"} frames read unseen until it does, within seconds. Read again.`,
  /** A move whose animations were still running when its wait for them ended (core `MoveRender.stillRunning`): what its report holds was read mid-motion. */
  moveUnsettled: (running: number) =>
    `${running} ${running === 1 ? "animation was" : "animations were"} still running when this move's wait for them ended: its read and its picture were taken mid-motion.`,
  /** Stories that differ in nothing but their width (core `RenderReport.widthOnly`): one state, drawn at each width by the design graph's View. */
  widthOnly: (stories: readonly string[]) =>
    `${stories.join(", ")} differ in nothing but their width: they are one state. Keep one story and let the design graph draw it at each width the person picks; a piece with one production width names it once, on the meta's parameters.viewport.`,
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
  /** A read of the stage that waited while it showed life, until it went `quiet` seconds with no answer, no output and no CPU time spent (agent stage.ts `askStage`): what it was to do, and how long it waited in all. */
  stoppedMoving: (what: string, quiet: number, waited: number) =>
    `The stage did not ${what}: it went quiet for ${quiet} s, after ${Math.round(waited)} s of waiting. Its errors, if any, stand in the canvas's stage state; read the canvas again to retry.`,
  /** A sheet's host that went quiet for `quiet` seconds without answering its health (agent stage.ts `looked`): the crash it is started again for. */
  healthQuiet: (path: string, quiet: number) =>
    `it went quiet for ${quiet} s without answering ${path}`,
  /** A warm-up's canvas page whose stage ended before it answered (agent stage.ts `walkedAsEmbed`). */
  warmEnded: "its stage ended before its canvas page answered",
  /** A warm-up's canvas page that went quiet for `quiet` seconds without answering. */
  warmQuiet: (quiet: number) =>
    `its canvas page went quiet for ${quiet} s without answering`,
  /** A read of the stage whose process ended before it answered (agent stage.ts `askStage`): what it was to do. */
  endedAsked: (what: string) =>
    `The stage did not ${what}: it ended before it answered. Read the canvas again to start it.`,
  /**
   * A read of the stage whose request got no answer at all, its connection
   * refused or cut (agent stage.ts `askStage`): what it was to do, the
   * address it went to and the way there, and the connection's own error.
   */
  unanswered: (what: string, at: string, cause: string) =>
    `The stage did not ${what}: its request to ${at} got no answer (${cause}).`,
  /** {@link stageRenderWords.unanswered}'s address: the stage's port inside its boundary, reached through the daemon's bridge into that boundary's network. */
  bridged: (port: number, boundary: string) =>
    `port ${port} in ${boundary}'s boundary, through the daemon's bridge into its network`,
  /** {@link stageRenderWords.unanswered}'s address where boundaries share the host's network (macOS). */
  loopback: (port: number) => `port ${port} on this machine's loopback`,
  /** The daemon's kept page of a canvas closed under a read (its stage slept or started again, or its browser ended): the next read opens another. */
  readerGone:
    "The daemon's page reading this canvas closed while it read (its stage slept or started again, or its browser ended). Read again: the next read opens a new one.",
  /** The page itself never loaded: it went quiet first. */
  notLoaded:
    "The stage's page did not load: its stage is up but stopped serving it. Read the design graph without render to see its stage's state and errors.",
};
