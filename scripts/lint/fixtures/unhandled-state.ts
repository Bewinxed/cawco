/**
 * The one switch the switch check must report here: "landed" has no case.
 * scripts/lint/golar-lint.ts fails when the check's report lacks exactly this
 * finding, so a check that quietly reads nothing fails too. The `…` below
 * stands before the switch on purpose: it is one UTF-16 unit and three
 * UTF-8 bytes, so a report placed by the wrong unit lands elsewhere… and fails.
 */
type State = "queued" | "running" | "landed";

export const label = (state: State): string => {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    default:
      return "Done";
  }
};
