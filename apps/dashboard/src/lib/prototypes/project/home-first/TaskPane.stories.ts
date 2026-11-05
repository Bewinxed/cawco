/**
 * Where a task opens (Option 2): a pane over the right third of the list
 * the person was in, the list live beneath, at 900 and up; a bottom drawer
 * on a phone. Its insides are designed on their own, so it holds a stand-in
 * at its size. Opened from Home's Needs you here; from the board in Tasks' Task open.
 */
import { BUSY } from "./fixture";
import HomeScreen from "./HomeScreen.svelte";

const desk = { viewport: 1440 };
const mid = { viewport: 900 };
const phone = { viewport: 390 };

const TITLE = "Post: one board instead of a wall of agent terminals";

export default {
  title: "Home first/Task pane",
  component: HomeScreen,
  args: { briefing: BUSY, open: "task", openTask: TITLE },
};

/** Opened from Needs you: over Home's right third. */
export const OverHome = { name: "Over Home", parameters: desk };

/** At 900: still over the right third. */
export const OverHome900 = { name: "Over Home at 900", parameters: mid };

/** On a phone: a drawer over the dimmed briefing. */
export const OverHomePhone = {
  name: "Over Home on a phone",
  parameters: phone,
};
