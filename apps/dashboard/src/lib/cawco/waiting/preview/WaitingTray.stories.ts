/**
 * What a session waits on the person for, on its tray row (Component Story
 * Format 3, live): the chip before the plan's ring says how many, and
 * pressed, its list rises over the row. The chip, the card, the list, the
 * ring and the composer are the product's; the screen round them is
 * SessionWaitingFixture. Rows as the hub answers them (fixtures.ts).
 */
import { ASKED, STATES } from "./fixtures";
import SessionWaitingFixture from "./SessionWaitingFixture.svelte";

export default {
  title: "Needs you/Tray",
  component: SessionWaitingFixture,
  args: { rows: STATES.all, opened: true, height: 900 },
};

/** On a desk: the list open, every kind waiting, the agent's question folded to its bar. */
export const Desk = {
  args: { asked: ASKED },
  parameters: { viewport: 1440 },
};

/** On a phone: the list open, every kind waiting, the question's bar beside the chip. */
export const Phone = {
  args: { asked: ASKED, height: 780 },
  parameters: { viewport: 390 },
};

/** Nothing waiting: no chip, the plan's ring alone at the row's end (desk). */
export const NoneDesk = {
  args: { rows: STATES.none, opened: false },
  parameters: { viewport: 1440 },
};

/** Nothing waiting (phone). */
export const NonePhone = {
  args: { rows: STATES.none, opened: false, height: 780 },
  parameters: { viewport: 390 },
};

/** One decision page's card waiting, the list shut: "1 needs you" (desk). */
export const OneShutDesk = {
  args: { rows: STATES.one, opened: false },
  parameters: { viewport: 1440 },
};

/** One decision page's card waiting, the list open (desk). */
export const OneDesk = {
  args: { rows: STATES.one },
  parameters: { viewport: 1440 },
};

/** One decision page's card waiting (phone). */
export const OnePhone = {
  args: { rows: STATES.one, height: 780 },
  parameters: { viewport: 390 },
};

/** Several kinds: the agent's question on its bar, two cards, a preview to judge, a pin (desk). */
export const SeveralDesk = {
  args: { rows: STATES.several, asked: ASKED },
  parameters: { viewport: 1440 },
};

/** Several kinds (phone). */
export const SeveralPhone = {
  args: { rows: STATES.several, asked: ASKED, height: 780 },
  parameters: { viewport: 390 },
};

/** A delegate's questions under this session, one from a delegate that ended, which reads the same (desk). */
export const DelegateDesk = {
  args: { rows: STATES.delegate },
  parameters: { viewport: 1440 },
};

/** A delegate's questions under this session (phone). */
export const DelegatePhone = {
  args: { rows: STATES.delegate, height: 780 },
  parameters: { viewport: 390 },
};

/** Caw's panel docked beside the project's page: his list open (desk). */
export const CawDesk = {
  args: { caw: true, rows: STATES.delegate },
  parameters: { viewport: 1440 },
};

/** Caw's panel as the phone's sheet: his list open. */
export const CawPhone = {
  args: { caw: true, rows: STATES.delegate, height: 780 },
  parameters: { viewport: 390 },
};

/** On the widest desk (2529): the list open, every kind waiting. */
export const Wide = {
  args: { asked: ASKED },
  parameters: { viewport: 2529 },
};

/** A card's row pressed (desk): its page opens beside the conversation at that card, the list still open over the composer. */
export const CardOpenedDesk = {
  args: { rows: STATES.several, asked: ASKED, landed: "card" },
  parameters: { viewport: 1440 },
};

/** A card's row pressed (phone): its page rises as a sheet over the conversation. */
export const CardOpenedPhone = {
  args: { rows: STATES.several, asked: ASKED, landed: "card", height: 780 },
  parameters: { viewport: 390 },
};

/** The question's row pressed (desk): the list put away, the composer grown into the question, answered there. */
export const AskGrownDesk = {
  args: { rows: STATES.several, asked: ASKED, landed: "ask", opened: false },
  parameters: { viewport: 1440 },
};

/** The question's row pressed (phone). */
export const AskGrownPhone = {
  args: {
    rows: STATES.several,
    asked: ASKED,
    landed: "ask",
    opened: false,
    height: 780,
  },
  parameters: { viewport: 390 },
};
