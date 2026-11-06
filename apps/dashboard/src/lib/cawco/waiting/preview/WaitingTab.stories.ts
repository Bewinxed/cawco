/**
 * Where a session's list of what waits on the person lives, drawn on its
 * screen (Component Story Format 3, live): In the session's tab: the tab that wears the hand opens its card, the list under its name.
 * The list, its chip and its card are the real ones (waiting/); the screen
 * round them is SessionWaitingFixture. Rows as the hub answers them
 * (fixtures.ts): two decision cards, a canvas to judge, a pin that asks, a
 * permission ask, two of a delegate's, one answered and not taken up.
 */
import { STATES } from "./fixtures";
import SessionWaitingFixture from "./SessionWaitingFixture.svelte";

export default {
  title: "Waiting on you/Tab",
  component: SessionWaitingFixture,
  args: { place: "tab", rows: STATES.all, opened: true },
};

/** On a desk: the list open, every kind waiting. */
export const TabDesk = { parameters: { viewport: 1100 } };

/** On a phone: the list open, every kind waiting. */
export const TabPhone = {
  args: { height: 780 },
  parameters: { viewport: 390 },
};

/** Nothing waiting: no trigger, no list (desk). */
export const TabNoneDesk = {
  args: { rows: STATES.none, opened: false },
  parameters: { viewport: 1100 },
};

/** Nothing waiting (phone). */
export const TabNonePhone = {
  args: { rows: STATES.none, opened: false, height: 780 },
  parameters: { viewport: 390 },
};

/** One decision page's card waiting (desk). */
export const TabOneDesk = {
  args: { rows: STATES.one },
  parameters: { viewport: 1100 },
};

/** One decision page's card waiting (phone). */
export const TabOnePhone = {
  args: { rows: STATES.one, height: 780 },
  parameters: { viewport: 390 },
};

/** Several kinds: a permission ask, two cards, a canvas to judge, a pin (desk). */
export const TabSeveralDesk = {
  args: { rows: STATES.several },
  parameters: { viewport: 1100 },
};

/** Several kinds (phone). */
export const TabSeveralPhone = {
  args: { rows: STATES.several, height: 780 },
  parameters: { viewport: 390 },
};

/** One answered, not yet taken up by the agent (desk). */
export const TabAnsweredDesk = {
  args: { rows: STATES.answered },
  parameters: { viewport: 1100 },
};

/** One answered, not yet taken up (phone). */
export const TabAnsweredPhone = {
  args: { rows: STATES.answered, height: 780 },
  parameters: { viewport: 390 },
};

/** A delegate's questions under this session, one from a delegate that ended (desk). */
export const TabDelegateDesk = {
  args: { rows: STATES.delegate },
  parameters: { viewport: 1100 },
};

/** A delegate's questions under this session (phone). */
export const TabDelegatePhone = {
  args: { rows: STATES.delegate, height: 780 },
  parameters: { viewport: 390 },
};

/** On the widest desk (2529): the list open, every kind waiting. */
export const TabWide = { parameters: { viewport: 2529 } };
