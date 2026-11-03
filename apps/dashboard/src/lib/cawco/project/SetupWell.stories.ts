/**
 * Caw at work on a project's setup in his panel (Component Story Format 3,
 * live components): his setup element at each beat of the personal PR
 * team's first two minutes, read off his calls as setup-progress.ts reads
 * them (setup.fixtures.ts). Drawn at his panel's width.
 */

import SetupWell from "./SetupWell.svelte";
import { PR_NAME, SETUP_CALLS } from "./setup.fixtures";
import { setupProgressOf } from "./setup-progress";

const beat = (
  calls: keyof typeof SETUP_CALLS,
  named: boolean,
  open: { blocks: boolean }[] = []
) =>
  setupProgressOf({
    messages: SETUP_CALLS[calls],
    name: named ? PR_NAME : "New project",
    named,
    open,
    page: false,
  });

export default {
  title: "Onboarding/Caw at work",
  component: SetupWell,
  args: { progress: beat("sent", false), status: "working" },
  parameters: { viewport: 380 },
};

/** Just sent: he reads what they wrote. */
export const Reading = {};

/** He has read it and is naming it. */
export const Naming = { args: { progress: beat("read", false) } };

/** Named, drafting the stages and who does the work. */
export const Drafting = { args: { progress: beat("named", true) } };

/** A question of his holds the draft up: he waits on it, needs you. */
export const Waiting = {
  args: {
    progress: beat("named", true, [{ blocks: true }]),
    status: "needs-you",
  },
};

/** Questions open that don't hold him: he drafts the rest meanwhile. */
export const Asking = {
  args: {
    progress: beat("named", true, [{ blocks: false }, { blocks: false }]),
  },
};

/** At a wide panel (Preview widened it, or a tablet's row). */
export const Wide = {
  args: { progress: beat("named", true) },
  parameters: { viewport: 720 },
};
