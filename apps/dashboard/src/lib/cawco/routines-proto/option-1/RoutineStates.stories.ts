/**
 * My reading of Option 1: the states the live story reaches by a press,
 * each drawn on its own, and the presses themselves made on the live
 * fixture.
 */
import { hubAs } from "../../hub-stand-in";
import { standHarbor } from "./harbor-stand";
import Live from "./routines-live.svelte";

export default {
  title: "Routines/Option 1, every state",
  component: Live,
  args: { opened: null, run: null, stale: false },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
  beforeEach: standHarbor,
};

/** Harbor's routines with nothing open beside them. */
export const AtRest = {};

/** The reading is an old one: the counts of what needs me are held back. */
export const Stale = { args: { stale: true } };

/** Triage new GitHub issues opened beside the list, its Friday run's whole result on top. */
export const TriageOpen = { args: { opened: "rtn-triage" } };

/** Thursday's triage run, the one an opened issue started, read whole in place. */
export const EarlierRunOpen = {
  args: { opened: "rtn-triage", run: "run-t3" },
};

/** The npm release check opened: what it looks for, its latest look and what waits on it. */
export const LookOpen = { args: { opened: "rtn-npm" } };

/** The staging check that stopped, opened: why it needs me, and its three failed looks. */
export const StoppedOpen = { args: { opened: "rtn-staging" } };

interface Press {
  canvas: {
    getByRole: (role: string, options: { name: string }) => HTMLElement;
  };
  userEvent: { click: (element: HTMLElement) => Promise<void> };
}

/** I press Open on Triage new GitHub issues, and it stands beside the list. */
export const PressOpenRoutine = {
  from: "AtRest",
  play: async ({ canvas, userEvent }: Press) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Triage new GitHub issues" })
    );
  },
};

/** With triage open, I press Open on Thursday's run and read its result in place. */
export const PressOpenRun = {
  from: "TriageOpen",
  args: { opened: "rtn-triage" },
  play: async ({ canvas, userEvent }: Press) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open the run of Thu 14:12" })
    );
  },
};
