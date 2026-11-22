/**
 * Outcomes' view (OutcomesView) in the project page as the live story
 * frames it, the states its bento and its hanging card reach: at rest, a
 * card open on a line, the hub away, and every outcome met.
 */

import { COCKPIT, COCKPIT_ALL_CLEAR } from "./outcomes.fixture";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/Option 1, its states",
  component: OutcomesLive,
  args: { record: COCKPIT, hub: "answers", live: true, open: null, again: 0 },
  parameters: { viewport: 1440 },
};

/** I opened why staging's health is not known: the question waits there with its evidence. */
export const StagingCardOpen = { args: { open: "staging-healthy" } };

/** I opened why pull requests are not all answered: the sweep's sentence, what checks it and the work on it. */
export const PullRequestsCardOpen = { args: { open: "pulls-answered" } };

/** The hub stopped answering at 14:02: the last reading stands and nothing can be answered. */
export const HubAway = { args: { live: false } };

/** Everything I asked for is true now, one quiet line each, still being checked. */
export const AllClear = { args: { record: COCKPIT_ALL_CLEAR } };

interface Play {
  canvas: {
    getByRole: (role: string, options: { name: RegExp }) => HTMLElement;
    getByTestId: (id: string) => HTMLElement;
  };
  update: (args: Record<string, unknown>) => Promise<void>;
  userEvent: {
    click: (element: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

const ANSWER = /^Answer the question$/u;
const OPEN_PULLS =
  /^Every open pull request has our answer: false\. Show why$/u;

/** Longer than a card takes to hang and a press to land. */
const SETTLED_MS = 500;
/** Longer than the mock hub takes to answer. */
const HUB_MS = 1600;

/** The card this frame's view hangs out of the page (`data-for`), and a control in it by its words. */
const inCard = (canvas: Play["canvas"], words: string): Element => {
  const view = canvas.getByTestId("outcomes").dataset.view ?? "";
  const card = document.querySelector(`[data-for="${view}"]`);
  const found = Array.from(card?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent?.includes(words)
  );
  if (!found) {
    throw new Error(`The open card has no "${words}".`);
  }
  return found;
};

/** Staging's question opened from its tile, Restart it picked and sent. */
const answerStaging = async ({ canvas, userEvent }: Play): Promise<void> => {
  await userEvent.wait(SETTLED_MS);
  await userEvent.click(canvas.getByRole("button", { name: ANSWER }));
  await userEvent.wait(SETTLED_MS);
  await userEvent.click(inCard(canvas, "Restart it"));
  await userEvent.click(inCard(canvas, "Send answer"));
  await userEvent.wait(HUB_MS);
};

/** Staging's question first, the outcomes that are not true next, the rest at the foot. */
export const Arrived = {};

/** I answered Restart it from Staging's tile: the hub took it, and the tile no longer waits on me. */
export const AnsweredFromTheTile = { from: "Arrived", play: answerStaging };

/** I answered, and the hub refused it: its sentence stands under the ask with my pick kept. */
export const AnswerRefused = {
  args: { hub: "refuses" },
  from: "Arrived",
  play: async (play: Play): Promise<void> => {
    await play.update({ hub: "refuses" });
    await answerStaging(play);
  },
};

/** With staging's card open, I opened the pull requests line: the card moved to it. */
export const CardMovedToPullRequests = {
  from: "StagingCardOpen",
  play: async ({ canvas, userEvent }: Play): Promise<void> => {
    await userEvent.wait(SETTLED_MS);
    await userEvent.click(canvas.getByRole("button", { name: OPEN_PULLS }));
    await userEvent.wait(SETTLED_MS);
  },
};
