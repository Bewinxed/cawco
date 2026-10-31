/**
 * The Exchange, Thread: one asking session's messages in time order, the
 * asks with their options inside them, his picks and words as his own
 * messages, the agent's replies, revisions, settlements, defaults and its
 * ending. The flows are the owner's own: "After the audit" picked and sent
 * with his note, his words on the connectors question answered by a
 * revision, the advisor's settlement picked again.
 */
import Exchange from "./Exchange.svelte";
import type { Moment, Thread } from "./model.js";
import type { Play } from "./play.js";
import {
  AUDIT_NOTE,
  audit,
  CONNECTORS_WORDS,
  cawEnded,
  OPEN,
  STRIP,
} from "./records.js";

const ALL_FOUR = /All four now/u;
const ASKED_FOR = /Yes, work you asked for/u;
const SEND_TWO = /Send 2 picks/u;
const SEND_WORDS = /Send your words/u;
const DENY_CAWCO = /Deny them in CawCo's project/u;
const PICK_AGAIN_BOUNDARY = /Pick again on Should a project/u;
const FIELD = { name: "Your words to the agent" };

const withdrawn: Thread = {
  ...audit,
  standing: "quiet",
  open: 0,
  line: "Withdrew both asks",
  messages: [],
};

const AUDIT_PICKS = { restart: ["all"], "finished-push": ["asked"] };
const PICKED: Moment = { picks: AUDIT_PICKS, draft: AUDIT_NOTE };
const SENT: Moment = { ...PICKED, sent: true };
const RESUMED: Moment = {
  ...SENT,
  replied: true,
  reply:
    "Resumed with All four now and Yes, work you asked for. The four surfaces restart today, each from its first step on a fresh branch from main, none steered by the original design.",
};
const WORDS_SENT: Moment = { draft: CONNECTORS_WORDS, sent: true };
const REVISED: Moment = {
  ...WORDS_SENT,
  replied: true,
  reply:
    "Connectors are set per project in Settings, and the project's conversation reads them, so this one is yours to place. BudgetPixel comes off the list.",
  revision: {
    changed:
      "Question 2 now names five connectors: ElevenLabs, Microsoft 365, Gmail, Drive and Claude Docs. BudgetPixel is removed from every session.",
    kept: "Nothing you picked was changed. Question 2 is open again; 1, 3 and 4 wait as they were.",
  },
};
const ASKED_AGAIN: Moment = { pickAgain: "asked", pickAgainOn: "boundary" };
const COSTED: Moment = {
  ...ASKED_AGAIN,
  pickAgain: "answered",
  costAccount: {
    text: "Changing it puts this conversation inside a boundary on your own checkout, unlike every other session on that folder. Nothing has been built on the advisor's answer yet.",
    touches: [
      "Rests on it: the one-session-kind page's pick, Like any session: on my checkout",
      "Would undo: nothing; commit f781d438d already removed Caw's old boundary",
    ],
  },
};

export default {
  title: "The Exchange/Thread",
  component: Exchange,
  args: { threads: OPEN, strip: STRIP, view: "thread", open: "audit" },
};

/** "After the audit": two asked together, stopping four surfaces, nothing picked yet. */
export const Asked = { parameters: { viewport: 390 } };

/** The same ask at 680: the options side by side as peers. */
export const AskedTablet = { parameters: { viewport: 680 } };

/** At a desk, beside the list: the thread on its reading measure. */
export const AskedDesk = { parameters: { viewport: 1440 } };

/** In the owner's 1540 window. */
export const AskedWide = { parameters: { viewport: 1540 } };

/** He picks All four now and Yes, work you asked for, and writes his note: each pick holds where it stands. */
export const Picked = {
  from: "AskedDesk",
  args: { moment: PICKED },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByRole("radio", { name: ALL_FOUR }));
    await userEvent.click(canvas.getByRole("radio", { name: ASKED_FOR }));
    await userEvent.type(canvas.getByRole("textbox", FIELD), AUDIT_NOTE);
    await update({ moment: PICKED });
  }) satisfies Play,
};

/** Send 2 picks: his message lands at once with his note; the agent has not read it yet. */
export const Sent = {
  from: "Picked",
  args: { moment: SENT },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: SEND_TWO }));
  }) satisfies Play,
};

/** The agent's line arrives: resumed with his picks, and the list row turns to Working in place. */
export const Resumed = {
  from: "Sent",
  args: { moment: RESUMED },
  parameters: { viewport: 1440 },
  play: (async ({ update }) => {
    await update({ moment: RESUMED });
  }) satisfies Play,
};

/** The send didn't reach the hub: his picks and note stay on his message, with Try again. */
export const SendFailed = {
  args: { moment: { ...SENT, failed: true } },
  parameters: { viewport: 390 },
};

/** "Small fleet calls": four asked together, the ElevenLabs question dim until the connectors one is picked. */
export const GroupInOrder = {
  args: { open: "fleet" },
  parameters: { viewport: 1440 },
};

/** The group on a phone, one question under the next in the agent's order. */
export const GroupInOrderPhone = {
  args: { open: "fleet" },
  parameters: { viewport: 390 },
};

/** He picks Deny them in CawCo's project: question 3 opens. */
export const NextOpens = {
  from: "GroupInOrder",
  args: { open: "fleet", moment: { picks: { connectors: ["cawco"] } } },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByRole("radio", { name: DENY_CAWCO }));
    await update({ moment: { picks: { connectors: ["cawco"] } } });
  }) satisfies Play,
};

/** No option fits: his words go with no pick, and the agent reads them first. */
export const WordsSent = {
  from: "GroupInOrder",
  args: { open: "fleet", moment: WORDS_SENT },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", FIELD), CONNECTORS_WORDS);
    await userEvent.click(canvas.getByRole("button", { name: SEND_WORDS }));
  }) satisfies Play,
};

/** The agent answers his words and revises the ask: what changed, and which picks stand. */
export const Revised = {
  from: "WordsSent",
  args: { open: "fleet", moment: REVISED },
  parameters: { viewport: 1440 },
  play: (async ({ update }) => {
    await update({ moment: REVISED });
  }) satisfies Play,
};

/** The revision on a phone. */
export const RevisedPhone = {
  args: { open: "fleet", moment: REVISED },
  parameters: { viewport: 390 },
};

/** A partly sent group: five picked, the advisor settled one, the Caw switch still open. */
export const Settled = {
  args: { open: "caw" },
  parameters: { viewport: 1440 },
};

/** The same thread on a phone. */
export const SettledPhone = {
  args: { open: "caw" },
  parameters: { viewport: 390 },
};

/** Pick again on the advisor's settlement: nothing changes until the agent says what it costs. */
export const PickAgain = {
  from: "Settled",
  args: { open: "caw", moment: ASKED_AGAIN },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: PICK_AGAIN_BOUNDARY })
    );
    await update({ moment: ASKED_AGAIN });
  }) satisfies Play,
};

/** The agent's account of the cost arrives under it: then Change it or Keep it. */
export const CostAccount = {
  from: "PickAgain",
  args: { open: "caw", moment: COSTED },
  parameters: { viewport: 1440 },
  play: (async ({ update }) => {
    await update({ moment: COSTED });
  }) satisfies Play,
};

/** A default the agent went ahead with, with its picture and Correct it. */
export const WentAhead = {
  args: { open: "notice" },
  parameters: { viewport: 1440 },
};

/** The same default on a phone. */
export const WentAheadPhone = {
  args: { open: "notice" },
  parameters: { viewport: 390 },
};

/** Correct it: the options open with the default held, and a different pick goes the way of a change. */
export const Correcting = {
  from: "WentAhead",
  args: { open: "notice", moment: { correcting: true } },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Correct it" }));
  }) satisfies Play,
};

/** The session ended with one never picked: the project's conversation takes the thread. */
export const Ended = {
  args: {
    threads: [cawEnded, ...OPEN.filter((t) => t.id !== "caw")],
    open: "caw",
  },
  parameters: { viewport: 1440 },
};

/** Its asks were all withdrawn: the thread says so, and nothing waits. */
export const Withdrawn = {
  args: { threads: [withdrawn], open: "audit" },
  parameters: { viewport: 390 },
};

/** Reading the thread: the head at once, skeleton messages under it. */
export const Loading = {
  args: { moment: { load: "loading" } },
  parameters: { viewport: 1440 },
};

/** The read failed: said under the head, with Try again. */
export const ReadFailed = {
  args: { moment: { load: "failed" } },
  parameters: { viewport: 390 },
};

/** Two earlier messages the hub couldn't fetch: a line stands in their place. */
export const NotFetched = {
  args: { open: "caw", moment: { missing: 2 } },
  parameters: { viewport: 1440 },
};
