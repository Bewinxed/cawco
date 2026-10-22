/**
 * What Caw's head in the top bar says of what needs the operator
 * (NeedsCaw.svelte): its label, its tooltip and the line his panel shows
 * with nothing to count (CawPanel `quiet`). The probe kit's journeys find
 * the head by these same words (scripts/probe-kit/caw-head.ts), so a word
 * changed here is changed for both. The app's head (NeedsCaw.swift) spells
 * its own for now; these are not written into it (scripts/words-swift.ts).
 */
export const cawHeadWords = {
  /** Something waits on the operator: how many, his label. */
  needs: (count: number) => `Needs you, ${count}`,
  /** The same, his tooltip. */
  needsTip: (count: number) => `${count} need you`,
  /** Nothing waits, and the fleet is read over a live hub: the one empty answer. */
  caughtUp: "All caught up",
  /** The hub is live and its fleet not read yet: nothing to count from. */
  reading: "Reading the fleet",
  /** The hub is away, so nothing can be counted (why is the connection band's to say). */
  waiting: "Waiting for the hub",
  /** After what he says, while any notice stands: " · 2 notices". */
  notices: (count: number) =>
    ` · ${count} ${count === 1 ? "notice" : "notices"}`,
};
