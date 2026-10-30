/**
 * What a part of the dashboard says when it stops on a render error
 * (RegionBoundary): a design proposal under review, drawn on its canvas
 * (apps/dashboard/src/lib/cawco/fault/preview). The error formula
 * (DESIGN.md, Voice): what happened, why, how to fix, what happens next,
 * and what is safe where the person would fear for it.
 */
export const regionFaultWords = {
  /** What happened: "Couldn't draw the preview". */
  couldntDraw: (what: string) => `Couldn't draw ${what}`,
  /** Why, and what happens next: the client's handleError sends it to the hub (hooks.client.ts). */
  why: "A bug in the dashboard stopped it; the error is in the hub's log.",
  /** The rebuild threw again at once on the same data: Try again can't help. */
  again:
    "It stopped again the same way. Reload the page; everything you had open comes back.",
  /** The line face's words, one sentence: "Couldn't draw the comments: a bug in the dashboard." */
  line: (what: string) => `Couldn't draw ${what}: a bug in the dashboard.`,
  /** The line face once the rebuild threw again. */
  lineAgain: (what: string) => `Couldn't draw ${what} again.`,
  reloadPage: "Reload page",
  reloading: "Reloading…",
  /** Starts a session with Caw, the error in its words, nothing sent. */
  askCaw: "Ask Caw to fix it",
};
