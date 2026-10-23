/**
 * The compact Comments panel (the owner's note on comment-card-sizing): a
 * narrow window used with a mouse, 820px, with Comments open. Each story is
 * the same pane at its real size: the page, and the compact panel beside it.
 */
import Fixture from "./CommentPanelCompactFixture.svelte";
import { OPEN_PIN, OTHER_PINS } from "./comment-panel-fixture";

export default {
  title: "Comments/Compact panel, a narrow window",
  component: Fixture,
  args: { pane: { w: 820, h: 900 }, open: null },
  parameters: { viewport: 820 },
};

/** Comments open in a narrow window: each row its pill, its place and its first words. */
export const CompactPanel = {};

/** A row pressed: its thread comes down out of the row, hung from it, over the page. */
export const ThreadOpen = {
  args: { open: OPEN_PIN.id },
  from: "CompactPanel",
  play: async ({ update }: { update: (next: object) => Promise<void> }) => {
    await update({ open: OPEN_PIN.id });
  },
};

/** Another row pressed while a thread hangs: the card glides to it, never folding. */
export const AnotherThread = {
  args: { open: OTHER_PINS[0].id },
  from: "ThreadOpen",
  play: async ({ update }: { update: (next: object) => Promise<void> }) => {
    await update({ open: OTHER_PINS[0].id });
  },
};

/** The thread put away: the card goes back up into its row. */
export const ThreadClosed = {
  args: { open: null },
  from: "ThreadOpen",
  play: async ({ update }: { update: (next: object) => Promise<void> }) => {
    await update({ open: null });
  },
};
