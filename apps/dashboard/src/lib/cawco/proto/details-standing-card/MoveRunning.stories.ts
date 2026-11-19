/**
 * Move, running (Component Story Format 3, live components): the Standing
 * card's face while a folder moves, its steps as a line, the step it is on
 * with its files and bytes, and what it waits on.
 */
import {
  RUN_COPYING,
  RUN_FAILED,
  RUN_HOLDING,
  RUN_STOPPING,
} from "./fixtures/records";
import {
  AT_REST,
  PHONE,
  SMALLER_DESK,
  type StoryPlay,
  seedStores,
} from "./fixtures/stories";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Move: running",
  component: StandingCardInShell,
  args: { ...AT_REST, face: "move-running" },
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Copying to nixbox: 31,004 of 48,210 files so far. */
export const Copying = {
  from: "WhereTo",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "move-running", run: RUN_COPYING });
  },
};

/** On a smaller desk the steps still read as one line. */
export const CopyingSmallerDesk = { ...SMALLER_DESK };

/** On a phone the steps wrap to two lines in the sheet. */
export const CopyingOnPhone = { ...PHONE };

/** Stopping sessions: Caw is mid-turn, and can be interrupted now. */
export const StoppingSessions = { args: { run: RUN_STOPPING } };

/** Holding at Copy while nixbox is away; nothing is removed meanwhile. */
export const HoldingForMachine = { args: { run: RUN_HOLDING } };

/** The check failed: a file changed during the copy, both folders' state, and Try this step again. */
export const CheckFailed = { args: { run: RUN_FAILED } };
