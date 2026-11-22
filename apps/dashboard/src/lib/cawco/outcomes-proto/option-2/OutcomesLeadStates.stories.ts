/**
 * The Outcomes lead tile's states, as the person reaches them by pressing
 * in its live story (OutcomesLead.stories.ts): each mounts the same page
 * where that press leaves it.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { COCKPIT_ARGS } from "./outcomes.fixture";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/Lead tile, pressed",
  component: OutcomesLive,
  args: COCKPIT_ARGS,
  decorators: [hubAs("connected")],
};

/** He sent Restart it and the hub took it: one line says so, and nothing waits on him. */
export const Answered = {
  args: {
    answered: { "staging-healthy": { kind: "answered", choice: "Restart it" } },
  },
};

/** He sent Restart it and the hub refused it: its sentence under the ask, his pick kept. */
export const Refused = {
  args: {
    answered: {
      "staging-healthy": {
        kind: "refused",
        choice: "Restart it",
        why: "The hub refused the answer: Nightly staging check changed while you read it. Your pick is kept; send it again. (409)",
      },
    },
  },
};

/** The pull requests outcome leads, its reason open beside the others. */
export const PullRequestsLead = { args: { opens: "pull-requests" } };

/** The docs outcome leads: nothing checks one of its lines, and Caw suggests a routine. */
export const DocsLead = { args: { opens: "docs" } };

/** With nothing open, every outcome reads whole in an even bento. */
export const NoLead = { args: { opens: "none" } };

/** The work under no outcome, opened as the lead. */
export const NotUnderAnOutcome = { args: { opens: "unplaced" } };

/** Caw's suggestion, opened as the lead. */
export const SuggestionOpened = { args: { opens: "suggestion" } };

/** The hub is not answering: the last reading stands, and nothing can be sent. */
export const NotLive = { args: { live: false } };

/** Caw's conversation is open beside the page, so Outcomes has the room of a column. */
export const BesideTheConversation = { args: { conversation: true } };

/** On a phone the staging line stands as its own page, with Back to Outcomes. */
export const LineOnAPhone = {
  args: { lineOpen: "staging-healthy" },
  parameters: { viewport: "phone" },
};
