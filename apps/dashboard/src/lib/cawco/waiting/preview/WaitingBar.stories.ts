/**
 * Where a session's list of what waits on the person lives, drawn on its
 * screen (Component Story Format 3, live): In the bar's glass: a hand with its count, its list hanging from the glass.
 * The list, its chip and its card are the real ones (waiting/); the screen
 * round them is SessionWaitingFixture. Rows as the hub answers them
 * (fixtures.ts): two decision cards, a canvas to judge, a pin that asks, a
 * permission ask, two of a delegate's, one answered and not taken up.
 */
import { STATES } from "./fixtures";
import SessionWaitingFixture from "./SessionWaitingFixture.svelte";

export default {
  title: "Waiting on you/Bar",
  component: SessionWaitingFixture,
  args: { place: "bar", rows: STATES.all, opened: true },
};

/** On a desk: the list open, every kind waiting. */
export const BarDesk = { parameters: { viewport: 1100 } };

/** On a phone: the list open, every kind waiting. */
export const BarPhone = {
  args: { height: 780 },
  parameters: { viewport: 390 },
};

/** Nothing waiting: no trigger, no list (desk). */
export const BarNoneDesk = {
  args: { rows: STATES.none, opened: false },
  parameters: { viewport: 1100 },
};

/** Nothing waiting (phone). */
export const BarNonePhone = {
  args: { rows: STATES.none, opened: false, height: 780 },
  parameters: { viewport: 390 },
};

/** One decision page's card waiting (desk). */
export const BarOneDesk = {
  args: { rows: STATES.one },
  parameters: { viewport: 1100 },
};

/** One decision page's card waiting (phone). */
export const BarOnePhone = {
  args: { rows: STATES.one, height: 780 },
  parameters: { viewport: 390 },
};

/** Several kinds: a permission ask, two cards, a canvas to judge, a pin (desk). */
export const BarSeveralDesk = {
  args: { rows: STATES.several },
  parameters: { viewport: 1100 },
};

/** Several kinds (phone). */
export const BarSeveralPhone = {
  args: { rows: STATES.several, height: 780 },
  parameters: { viewport: 390 },
};

/** One answered, not yet taken up by the agent (desk). */
export const BarAnsweredDesk = {
  args: { rows: STATES.answered },
  parameters: { viewport: 1100 },
};

/** One answered, not yet taken up (phone). */
export const BarAnsweredPhone = {
  args: { rows: STATES.answered, height: 780 },
  parameters: { viewport: 390 },
};

/** A delegate's questions under this session, one from a delegate that ended (desk). */
export const BarDelegateDesk = {
  args: { rows: STATES.delegate },
  parameters: { viewport: 1100 },
};

/** A delegate's questions under this session (phone). */
export const BarDelegatePhone = {
  args: { rows: STATES.delegate, height: 780 },
  parameters: { viewport: 390 },
};

/** On the widest desk (2529): the list open, every kind waiting. */
export const BarWide = { parameters: { viewport: 2529 } };
