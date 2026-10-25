/**
 * The plan view proposal's own words (apps/dashboard plan/proposal): what
 * its decision page's side-by-side drawing says before the drawings, so the
 * probe that reads it (decision-plan-steps) looks for the words rendered.
 */
export const planProposalWords = {
  /** The line over the three ways: how many, and each by its number and name. */
  waysCount: (names: readonly string[]) =>
    `Three ways, side by side: ${names.map((name, at) => `${at + 1} ${name}`).join(", ")}`,
};
