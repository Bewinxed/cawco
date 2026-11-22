/**
 * A line, opened (LineCard): what hangs from the line he points at, on the
 * hanging card's own surface, at the card's width.
 */

import LineCard from "./LineCard.svelte";
import type { Line } from "./outcomes";
import { COCKPIT, STAGING_ASK } from "./outcomes.fixture";

const lineOf = (id: string): Line => {
  const line = COCKPIT.outcomes
    .flatMap((outcome) => outcome.lines)
    .find((each) => each.id === id);
  if (!line) {
    throw new Error(`The sample has no line ${id}.`);
  }
  return line;
};

const noop = () => undefined;

export default {
  title: "Outcomes/Option 1, a line opened",
  component: LineCard,
  args: {
    line: lineOf("staging-healthy"),
    ask: STAGING_ASK,
    answer: { kind: "idle" },
    choice: null,
    sheet: false,
    live: true,
    onclose: noop,
    onchoose: noop,
    onsend: noop,
    onopen: noop,
  },
  decorators: [],
  parameters: { viewport: 480 },
};

/** The staging check asks me to restart staging or wait for the deploy. */
export const StagingAsks = {};

/** I picked Restart it and sent it; the hub has not said yet. */
export const Sending = {
  args: { choice: "Restart it", answer: { kind: "sending" } },
};

/** The hub took my answer, and the staging check starts again. */
export const Answered = {
  args: { answer: { kind: "answered", choice: "Restart it" } },
};

/** The hub refused my answer; my pick is still there. */
export const Refused = {
  args: {
    choice: "Restart it",
    answer: {
      kind: "refused",
      sentence:
        "The hub could not write Nightly staging check's answer: another change to the project's folder is being saved (EBUSY).",
    },
  },
};

/** Pull requests are not all answered; a session is already on #412. */
export const PullRequests = {
  args: { line: lineOf("pulls-answered"), ask: null },
};

/** Nothing checks for removed settings in the docs; Caw suggests a weekly read. */
export const NothingChecks = {
  args: { line: lineOf("docs-settings"), ask: null },
};

/** The demo sign-in held on 12 Nov, and its check has ended since. */
export const NoLongerChecked = {
  args: { line: lineOf("staging-demo-account"), ask: null },
};
