/**
 * Option 3's states, for reading: each situation the Outcomes view meets
 * that a press or the hub reaches, one story each, mounting the live
 * fixture with the args that set it.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { COCKPIT_ARGS } from "./outcomes.args";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/One line each, states",
  component: OutcomesLive,
  args: COCKPIT_ARGS,
  decorators: [hubAs("connected")],
};

/** His answer is on its way to the hub. */
export const Sending = {
  args: {
    answered: {
      "staging-restart": { kind: "sending", choice: "Restart staging" },
    },
  },
};

/** He chose to restart staging, and nothing on the view needs him now. */
export const Answered = {
  args: {
    answered: {
      "staging-restart": { kind: "answered", choice: "Restart staging" },
    },
  },
};

/** The hub refused his answer, and both answers are back. */
export const Refused = {
  args: {
    answered: {
      "staging-restart": {
        kind: "refused",
        choice: "Restart staging",
        why: "Your answer was not taken: Nightly staging check changed while you were reading. Nothing was restarted. Choose again. (409)",
      },
    },
  },
};

/** The hub is unreachable, so he reads the last reading and cannot answer yet. */
export const Unreachable = { args: { live: false } };

/** Staging opened at its health line, with the run's evidence beside the answers. */
export const StagingOpen = {
  args: { opens: { kind: "outcome", id: "staging", line: "staging-healthy" } },
};

/** The docs outcome opened at the line nothing checks, with Caw's routine for it. */
export const DocsOpen = {
  args: { opens: { kind: "outcome", id: "docs", line: "docs-settings" } },
};

/** Main stays green opened, every line reached and none open. */
export const ReachedOpen = {
  args: { opens: { kind: "outcome", id: "main-green", line: null } },
};

/** Caw's suggested outcome opened, with the lines he would agree to. */
export const SuggestionOpen = { args: { opens: { kind: "suggestion" } } };

/** Caw's conversation stands open beside the page. */
export const BesideConversation = { args: { conversation: true } };
