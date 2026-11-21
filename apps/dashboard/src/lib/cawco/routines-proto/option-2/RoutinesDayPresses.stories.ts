/**
 * My reading of the presses on Option 2's live story: each story mounts the
 * same fixture and makes one press the person will make, and its frame
 * shows the answer.
 */
import { HARBOR, NOW, ROUTINES, RUNS, SOURCES } from "./day";
import RoutinesDayLive from "./routines-day-live.svelte";

/** What the stage hands a play: the frame's buttons by name, and a hand to press them. */
interface Hand {
  canvas: { getByRole: (role: "button", by: { name: RegExp }) => HTMLElement };
  userEvent: {
    click: (target: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

/** Longer than the split takes to open beside the view. */
const SETTLE = 600;

/** Presses each named button in turn, letting the frame settle around each. */
function press(...names: RegExp[]) {
  return async (hand: Hand): Promise<void> => {
    await hand.userEvent.wait(SETTLE);
    for (const name of names) {
      const button = hand.canvas.getByRole("button", { name });
      await hand.userEvent.click(button);
      await hand.userEvent.wait(SETTLE);
    }
  };
}

export default {
  title: "Routines, option 2/Presses",
  component: RoutinesDayLive,
  args: {
    project: HARBOR,
    routines: ROUTINES,
    runs: RUNS,
    sources: SOURCES,
    now: NOW,
    live: true,
  },
  parameters: { viewport: 1440 },
};

/** The triage run open beside the list: its whole result, the delegate's report, and Open session. */
export const RunOpen = {
  from: "Live",
  play: press(/^Open the run of Triage new GitHub issues at 11:04/u),
};

/** Friday's failed retry open: why it failed, and the post X refused, waiting to be looked at. */
export const FailedRunOpen = {
  from: "Live",
  play: press(/^Open the run of Post the weekly changelog at 16:05/u),
};

/** A look open from its folded line: what it looks for and what the command said. */
export const LookOpen = {
  from: "Live",
  play: press(
    /^Show all 55 runs of Wait for release 2.4 on npm/u,
    /^Open the run of Wait for release 2.4 on npm at 13:30/u
  ),
};

/** A routine open beside the list, from its row in Next, with Edit and Change with Caw in its bar. */
export const RoutineOpen = {
  from: "Live",
  play: press(/^Open Wait for release 2.4 on npm$/u),
};

/** The agent-made sweep kept: it leaves Needs you for Next. */
export const SweepKept = {
  from: "Live",
  play: press(/^Keep$/u),
};

/** The project read while the hub is away: the last good reading, marked, with the needs-you count withheld. */
export const ReadEarlier = { args: { live: false } };
