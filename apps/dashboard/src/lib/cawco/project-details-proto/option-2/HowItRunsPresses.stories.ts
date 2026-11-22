/**
 * The work path's presses, read one story each: the live story's fixture
 * (how-it-runs-live.svelte) in the same shell and records, each story
 * making one press the person makes there and drawing the answer.
 */

import HowItRunsLive from "./how-it-runs-live.svelte";
import { shellFrame } from "./shell-seed";
import { howItRunsWords as words } from "./words";

export default {
  ...shellFrame,
  title: "How it runs, pressed",
  component: HowItRunsLive,
  args: { situation: "At rest" },
};

interface Play {
  canvas: {
    getByRole: (role: string, options: { name: string | RegExp }) => Element;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

/** Longer than a popover takes to open and a pick's pill to glide. */
const SETTLED_MS = 500;
/** Longer than the mock hub takes to answer (how-it-runs-live `ANSWER_MS`). */
const ANSWERED_MS = 1200;

const press =
  (role: string, name: string | RegExp, wait = SETTLED_MS) =>
  async ({ canvas, userEvent }: Play): Promise<void> => {
    await userEvent.wait(SETTLED_MS);
    await userEvent.click(canvas.getByRole(role, { name }));
    await userEvent.wait(wait);
  };

/** Lantern web as it stands, before anything is pressed. */
export const AtRest = {};

/** I pressed GitHub Issues: its setup opens under the tiles. */
export const GitHubPressed = {
  from: "AtRest",
  play: press("radio", new RegExp(words.tasks.homes.github.name, "u")),
};

/** I pressed Add folder: the row becomes the form to add one. */
export const AddingAFolder = {
  from: "AtRest",
  play: press("button", words.places.addPlace),
};

/** I opened the account picker: each account with the room it has left. */
export const AccountPickerOpen = {
  from: "AtRest",
  play: press("button", new RegExp(`^${words.account.heading}:`, "u")),
};

/** I asked for agents to go to another account at the limit, and the server took it. */
export const MovesAtLimit = {
  from: "AtRest",
  play: press(
    "radio",
    new RegExp(words.account.atLimitMove.name, "u"),
    ANSWERED_MS
  ),
};

/** I picked a separate branch for the code, and the server refused it: the pick went back, with why. */
export const LandingRefused = {
  from: "AtRest",
  args: { answer: "refuses it" },
  play: press(
    "radio",
    new RegExp(words.lands.options.branch.name, "u"),
    ANSWERED_MS
  ),
};
