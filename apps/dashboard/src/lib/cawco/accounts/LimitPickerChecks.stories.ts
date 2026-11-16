/**
 * The limit picker clicked through, for checking the drawing
 * (artifact_read), not for the person: what they open is
 * LimitPicker.stories.ts `Live`. Each story starts from the card at rest
 * and plays the presses a person makes.
 */
import LimitPickerBench from "./limit-picker-bench.svelte";

export default {
  title: "Accounts/Limit picker clicked",
  component: LimitPickerBench,
  args: { reading: "fresh", check: "still", pending: false, again: 0 },
  parameters: { viewport: 1440 },
};

/** The card at rest. */
export const Rest = {};

/** The context still being read. */
export const ContextReading = { args: { context: "reading" } };

/** The context's read refused, in the harness's words. */
export const ContextRefused = { args: { context: "refused" } };

interface Play {
  canvas: {
    getByRole: (role: string, options: { name: RegExp }) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

const ACCOUNT = /Account:/u;
const BEWINXED = /bewinxed/u;
const MODEL = /Opus 5.5/u;
const FABLE = /Fable/u;
const MOVE_ANYWAY = /Move anyway/u;
const EFFORT = /Effort/u;
const PERMISSION = /Accept edits/u;
/** Longer than the provider takes to answer a check. */
const ANSWERED_MS = 1400;

/** Presses `chip`, then each option named in `picks`, waiting `after` once done. */
const presses =
  (chip: RegExp, picks: RegExp[], after = 400) =>
  async ({ canvas, userEvent }: Play): Promise<void> => {
    await userEvent.click(canvas.getByRole("button", { name: chip }));
    for (const pick of picks) {
      await userEvent.wait(300);
      await userEvent.click(canvas.getByRole("option", { name: pick }));
    }
    await userEvent.wait(after);
  };

/** The account list open. */
export const AccountsOpen = { from: "Rest", play: presses(ACCOUNT, []) };

/** bewinxed picked, still being checked. */
export const Checking = {
  from: "Rest",
  play: presses(ACCOUNT, [BEWINXED], 300),
};

/** The check answered: still at its limit, Move anyway on its row. */
export const Held = {
  from: "Rest",
  play: presses(ACCOUNT, [BEWINXED], ANSWERED_MS),
};

/** Move anyway pressed: the card says the move waits for the turn. */
export const MovedAnyway = {
  from: "Rest",
  play: async (play: Play) => {
    await presses(ACCOUNT, [BEWINXED], ANSWERED_MS)(play);
    await play.userEvent.click(
      play.canvas.getByRole("button", { name: MOVE_ANYWAY })
    );
    await play.userEvent.wait(500);
  },
};

/** The model list open, Fable at its limit on jude. */
export const ModelsOpen = { from: "Rest", play: presses(MODEL, []) };

/** Fable picked and held: Pick anyway on its row. */
export const FableHeld = {
  from: "Rest",
  play: presses(MODEL, [FABLE], ANSWERED_MS),
};

/** The effort picker open. */
export const EffortOpen = { from: "Rest", play: presses(EFFORT, []) };

/** The permission picker open. */
export const PermissionOpen = { from: "Rest", play: presses(PERMISSION, []) };
