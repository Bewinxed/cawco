/**
 * What an orchestrator of the Cawco-Dev project waits on the person for,
 * shaped as the hub answers it (core session-questions.ts) and the
 * composer's parked asks (a question folded to its bar, a permission, a
 * sign-in, its own and a delegate's): the states the session's list
 * reaches.
 */
import type { SessionQuestion } from "@cawco/core/session-questions";
import { type WaitingAsk, type WaitingRow, waitingRows } from "../rows";

const card = (
  id: string,
  words: string,
  artifact: SessionQuestion["artifact"],
  more: Partial<SessionQuestion> = {}
): SessionQuestion => ({
  key: `card:${id}`,
  kind: "card",
  words,
  state: "open",
  answer: null,
  stop: { card: id },
  artifact,
  session: null,
  ...more,
});

const BARS: SessionQuestion["artifact"] = {
  id: "a-bars",
  kind: "page",
  title: "Title bars: Close and the sheet's head",
};
const RECORD: SessionQuestion["artifact"] = {
  id: "a-record",
  kind: "preview",
  title: "A member's record",
};
const RAIL: SessionQuestion["artifact"] = {
  id: "a-rail",
  kind: "page",
  title: "Comments rail and sheet",
};
const TRAY: SessionQuestion["artifact"] = {
  id: "a-tray",
  kind: "preview",
  title: "Delegate tray at 390",
};

/** One decision page's card. */
const ONE_PAGE: SessionQuestion[] = [
  card(
    "sheet-close",
    "Where does a sheet's Close stand: leading its bar, or trailing it?",
    BARS
  ),
];

/** A page, a canvas to judge, a pin that asks him. */
const SEVERAL: SessionQuestion[] = [
  ...ONE_PAGE,
  card(
    "plan-close",
    "Does the plan card keep its own Close beside the bar's?",
    BARS
  ),
  {
    key: "judge",
    kind: "judge",
    words:
      "Judge a member's Record at the foot of its settings: pin anything that reads wrong",
    state: "open",
    answer: null,
    stop: { top: true },
    artifact: RECORD,
    session: null,
  },
  {
    key: "pin:p7",
    kind: "pin",
    words:
      "Should the decided count link to the Decisions tab, or open the member's own record?",
    state: "open",
    answer: null,
    stop: { pin: 7 },
    artifact: RECORD,
    session: null,
  },
];

/** The agent's question, folded to its bar on the tray row. */
export const ASKED =
  "Ship tonight's nightly with the title bars, or wait for the two host checks?";

/** That question, as its row reads it. */
const ASK: WaitingAsk[] = [
  { kind: "question", requestId: "r-question", summary: ASKED, from: null },
];

/** A permission a delegate's turn is parked on, and two sign-ins: this session's own and a delegate's. */
const PARKED: WaitingAsk[] = [
  {
    kind: "permission",
    requestId: "r-push",
    summary: "Push 3 commits to bewinxed/cockpit on cawco/2d728bdf",
    from: {
      id: "s-land",
      title: "Land the title bars",
    },
  },
  {
    kind: "connect",
    requestId: "r-linear",
    summary: "Connect Linear",
    from: null,
  },
  {
    kind: "connect",
    requestId: "r-figma",
    summary: "Connect Figma",
    from: {
      id: "s-rail",
      title: "Design the Comments rail and sheet whole",
    },
  },
];

/** A delegate's question, under this session. */
const DELEGATE: SessionQuestion[] = [
  card(
    "rail-place",
    "Where do a pin's replies open on a phone: a sheet over the page, or the rail pulled up?",
    RAIL,
    {
      session: {
        id: "s-rail",
        title: "Design the Comments rail and sheet whole",
        ended: false,
      },
    }
  ),
  {
    key: "judge",
    kind: "judge",
    words: "Judge the delegate tray at 390: pin what crowds the row",
    state: "open",
    answer: null,
    stop: { top: true },
    artifact: TRAY,
    session: {
      id: "s-tray",
      title: "Tidy the delegate tray on a phone",
      ended: true,
    },
  },
];

/** The rows of each state, as the list draws them. */
export const STATES: Record<
  "none" | "one" | "several" | "delegate" | "all",
  WaitingRow[]
> = {
  none: [],
  one: waitingRows(ONE_PAGE, []),
  several: waitingRows(SEVERAL, [...ASK, ...PARKED]),
  delegate: waitingRows([...ONE_PAGE, ...DELEGATE], []),
  all: waitingRows([...SEVERAL, ...DELEGATE], [...ASK, ...PARKED]),
};
