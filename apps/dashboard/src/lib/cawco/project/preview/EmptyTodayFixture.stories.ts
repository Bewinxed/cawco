/**
 * The empty surfaces as they ship: the empty board, Decisions, Routines and
 * Caw's panel on a fresh thread, on a desk and on a phone.
 */
import CawPanelFixture from "./CawPanelFixture.svelte";
import EmptyTodayFixture from "./EmptyTodayFixture.svelte";
import PageRoom from "./PageRoom.svelte";
import RoutinesBlockFixture from "./RoutinesBlockFixture.svelte";

const room = () => ({ Component: PageRoom, props: {} });
const phoneRoom = () => ({ Component: PageRoom, props: { phone: true } });

export default {
  title: "Empty surfaces/Today",
  component: EmptyTodayFixture,
  args: { surface: "board" },
};

/** Desk · The empty board: as wide as four starters, against the page's start edge. */
export const Board = { decorators: [room], parameters: { viewport: 1180 } };
/** Desk · Decisions empty: a narrower block against the start edge. */
export const Decisions = {
  args: { surface: "decisions" },
  decorators: [room],
  parameters: { viewport: 1180 },
};
/** Desk · Routines empty: the clock and title again under the head, chips, and a composer in the card. */
export const Routines = {
  component: RoutinesBlockFixture,
  args: { proposed: false },
  parameters: { viewport: 1180 },
};
/** Desk · Caw's panel on a fresh thread: suggestions as wide as their words. */
export const Caw = {
  component: CawPanelFixture,
  args: { proposed: false },
  parameters: { viewport: 380 },
};
/** Phone · The empty board. */
export const BoardPhone = {
  decorators: [phoneRoom],
  parameters: { viewport: "phone" },
};
/** Phone · Decisions empty. */
export const DecisionsPhone = {
  args: { surface: "decisions" },
  decorators: [phoneRoom],
  parameters: { viewport: "phone" },
};
/** Phone · Routines empty. */
export const RoutinesPhone = { ...Routines, parameters: { viewport: "phone" } };
/** Phone · Caw's panel on a fresh thread. */
export const CawPhone = {
  component: CawPanelFixture,
  args: { proposed: false, phone: true },
  parameters: { viewport: "phone" },
};
