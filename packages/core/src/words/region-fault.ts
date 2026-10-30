/**
 * What a part of the dashboard says when it stops on a render error
 * (RegionBoundary): a design proposal under review, drawn on its canvas
 * (apps/dashboard/src/lib/cawco/fault/preview). The error formula (DESIGN.md,
 * Voice): what happened and what is safe. The way to fix it is the button; the
 * why stands under Show details.
 */
export const regionFaultWords = {
  /** It names the showing, never the thing: "Routines stopped" would say they stopped running. */
  couldntShow: (what: string) => `Couldn't show ${what}`,
  /** Try again threw again at once on the same data. */
  stillCantShow: (what: string) => `Still can't show ${what}`,
  /** What a reload costs, where the person would fear for it (DESIGN.md, Update toast). */
  reloadKeeps: "Everything you had open comes back after a reload.",
  reloadPage: "Reload page",
};
