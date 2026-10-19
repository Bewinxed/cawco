/**
 * The empty surfaces' sheet (project redesign): the empty board, the empty
 * Decisions tab, the empty Routines block and Caw's panel on a fresh
 * thread, as they stand today, then under the Work Column Rule
 * (WorkColumnEmpty: the composer's 720px column, centred in a wide area,
 * every line on its start edge; one starter component, every card one
 * size). Desk at the pane's width on a 1440 screen (1180px), then a phone.
 */
import { decisionsWords } from "@cawco/core/words/decisions";
import { BOARD_STARTERS, DECISION_STARTERS } from "../tasks/preview/tidewater";
import CawPanelFixture from "./preview/CawPanelFixture.svelte";
import EmptyTodayFixture from "./preview/EmptyTodayFixture.svelte";
import PageRoom from "./preview/PageRoom.svelte";
import RoutinesBlockFixture from "./preview/RoutinesBlockFixture.svelte";
import WorkColumnEmpty from "./WorkColumnEmpty.svelte";

const DESK = { viewport: 1180 };
const PHONE = { viewport: "phone" };
const room = () => ({ Component: PageRoom, props: {} });
const phoneRoom = () => ({ Component: PageRoom, props: { phone: true } });
const BOARD_LINE =
  "Tell Caw what to do: the tasks Caw files move through Ready, Working, Review and Done. One waiting on you shows in Review.";

export default {
  title: "Project redesign/Empty surfaces",
  component: WorkColumnEmpty,
  args: { onpick: () => undefined },
};

/** Desk · Today, the empty board: the block as wide as four starters, hugging the pane's start edge. */
export const Today = {
  component: EmptyTodayFixture,
  args: { surface: "board" },
  decorators: [room],
  parameters: DESK,
};
/** Phone · Today, the empty board. */
export const TodayBoardPhone = {
  ...Today,
  decorators: [phoneRoom],
  parameters: PHONE,
};
/** Desk · Today, Decisions empty: a 36rem block on the pane's start edge. */
export const TodayDecisions = {
  component: EmptyTodayFixture,
  args: { surface: "decisions" },
  decorators: [room],
  parameters: DESK,
};
/** Phone · Today, Decisions empty. */
export const TodayDecisionsPhone = {
  ...TodayDecisions,
  decorators: [phoneRoom],
  parameters: PHONE,
};
/** Desk · Today, Routines empty: the clock and title again under the head, chips, and a session composer in the card. */
export const TodayRoutines = {
  component: RoutinesBlockFixture,
  args: { proposed: false },
  parameters: DESK,
};
/** Phone · Today, Routines empty. */
export const TodayRoutinesPhone = { ...TodayRoutines, parameters: PHONE };
/** Desk · Today, Caw's panel on a fresh thread: suggestion rows, each as wide as its words. */
export const TodayCaw = {
  component: CawPanelFixture,
  args: { proposed: false },
  parameters: { viewport: 380 },
};
/** Phone · Today, Caw's panel on a fresh thread. */
export const TodayCawPhone = {
  component: CawPanelFixture,
  args: { proposed: false, phone: true },
  parameters: PHONE,
};

/** Desk · Proposed, the empty board: the work column centred in the pane, four equal cards across. */
export const Board = {
  args: {
    title: "Nothing on the board yet",
    line: BOARD_LINE,
    starters: BOARD_STARTERS,
  },
  decorators: [room],
  parameters: DESK,
};
/** Phone · Proposed, the empty board: one column of cards, each the tallest's height. */
export const BoardPhone = {
  ...Board,
  decorators: [phoneRoom],
  parameters: PHONE,
};
/** Desk · Proposed, Decisions empty: the same column and the same cards. */
export const Decisions = {
  args: {
    title: decisionsWords.empty,
    line: decisionsWords.emptyCaw,
    starters: DECISION_STARTERS,
  },
  decorators: [room],
  parameters: DESK,
};
/** Phone · Proposed, Decisions empty. */
export const DecisionsPhone = {
  ...Decisions,
  decorators: [phoneRoom],
  parameters: PHONE,
};
/** Desk · Proposed, Routines empty: the head says Routines once; its purpose line and the cards on the card's own padding. */
export const Routines = {
  component: RoutinesBlockFixture,
  args: { proposed: true },
  parameters: DESK,
};
/** Phone · Proposed, Routines empty. */
export const RoutinesPhone = { ...Routines, parameters: PHONE };
/** Desk · Proposed, Caw's panel on a fresh thread: the starters as cards, every one the panel's width and one height. */
export const Caw = {
  component: CawPanelFixture,
  args: { proposed: true },
  parameters: { viewport: 380 },
};
/** Phone · Proposed, Caw's panel on a fresh thread. */
export const CawPhone = {
  component: CawPanelFixture,
  args: { proposed: true, phone: true },
  parameters: PHONE,
};
