/**
 * PROPOSED: empty surfaces under the Work Column Rule (placement advisor
 * §1): the composer's column, centred in a wide area, every line on its
 * start edge; one starter component, every card one size. The empty board,
 * Decisions, Routines and Caw's panel on a fresh thread, on a desk and on
 * a phone.
 */
import { decisionsWords } from "@cawco/core/words/decisions";
import { BOARD_STARTERS, DECISION_STARTERS } from "../tasks/preview/tidewater";
import CawPanelFixture from "./preview/CawPanelFixture.svelte";
import PageRoom from "./preview/PageRoom.svelte";
import RoutinesBlockFixture from "./preview/RoutinesBlockFixture.svelte";
import WorkColumnEmpty from "./WorkColumnEmpty.svelte";

const room = () => ({ Component: PageRoom, props: {} });
const phoneRoom = () => ({ Component: PageRoom, props: { phone: true } });
const board = {
  title: "Nothing on the board yet",
  line: "Tell Caw what to do: the tasks Caw files move through Ready, Working, Review and Done. One waiting on you shows in Review.",
  starters: BOARD_STARTERS,
};
const decisions = {
  title: decisionsWords.empty,
  line: decisionsWords.emptyCaw,
  starters: DECISION_STARTERS,
};

export default {
  title: "Empty surfaces/Work column",
  component: WorkColumnEmpty,
  args: { onpick: () => undefined },
};

/** Desk · The empty board: the column centred in the page, four cards of one size across. */
export const Board = {
  args: board,
  decorators: [room],
  parameters: { viewport: 1180 },
};
/** Desk · Decisions empty: the same column, the same cards. */
export const Decisions = {
  args: decisions,
  decorators: [room],
  parameters: { viewport: 1180 },
};
/** Desk · Routines empty: the head says Routines once; its line and the cards on the card's own edge. */
export const Routines = {
  component: RoutinesBlockFixture,
  parameters: { viewport: 1180 },
};
/** Desk · Caw's panel on a fresh thread: the starters as cards, every one the panel's width and one height. */
export const Caw = {
  component: CawPanelFixture,
  parameters: { viewport: 380 },
};
/** Phone · The empty board: one column of cards, each the tallest's height. */
export const BoardPhone = {
  args: board,
  decorators: [phoneRoom],
  parameters: { viewport: "phone" },
};
/** Phone · Decisions empty. */
export const DecisionsPhone = {
  args: decisions,
  decorators: [phoneRoom],
  parameters: { viewport: "phone" },
};
/** Phone · Routines empty. */
export const RoutinesPhone = { ...Routines, parameters: { viewport: "phone" } };
/** Phone · Caw's panel on a fresh thread. */
export const CawPhone = {
  component: CawPanelFixture,
  args: { phone: true },
  parameters: { viewport: "phone" },
};
