/**
 * What a part of the dashboard says when it stops on a render error
 * (RegionBoundary and its faces in apps/dashboard/src/lib/cawco/fault). The
 * error formula (DESIGN.md, Voice): what happened and what is safe. The way
 * to fix it is the button; the why stands under Show details.
 */
export const regionFaultWords = {
  /** It names the showing, never the thing: "Routines stopped" would say they stopped running. */
  couldntShow: (what: string) => `Couldn't show ${what}`,
  /** Try again threw again at once on the same data. */
  stillCantShow: (what: string) => `Still can't show ${what}`,
  /** What a reload costs, where the person would fear for it (DESIGN.md, Update toast). */
  reloadKeeps: "Everything you had open comes back after a reload.",
  reloadPage: "Reload page",
  /** Show details' Copy, and what it copies, read out. */
  copy: "Copy",
  copyError: "Copy the error",
  /**
   * Each part that fails on its own: as a sentence names it (`what`), and
   * what is safe where the person would fear for it (`kept`).
   */
  parts: {
    sidebar: { what: "the sidebar" },
    tabs: { what: "these tabs" },
    page: { what: "this page" },
    workspace: {
      what: "your sessions",
      kept: "They keep running on their machines.",
    },
    conversation: {
      what: "this conversation",
      kept: "Its session keeps running on its machine.",
    },
    transcript: {
      what: "the conversation",
      kept: "Its session keeps running on its machine.",
    },
    composer: { what: "the composer", kept: "Your draft is kept." },
    preview: { what: "the preview", kept: "Its page and comments are safe." },
    task: { what: "this task", kept: "The task is safe." },
    comment: { what: "this comment" },
    decision: { what: "this decision" },
    view: { what: "this view" },
  },
} as const;

/** A part that fails on its own (RegionBoundary's `part`). */
export type FaultPart = keyof typeof regionFaultWords.parts;
