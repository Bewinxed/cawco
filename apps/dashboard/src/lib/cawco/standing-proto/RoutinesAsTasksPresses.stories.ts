/**
 * The presses on the live Routines-as-tasks page, each played from where
 * the person starts (Component Story Format 3, live components): the frames
 * that prove each press is answered.
 */
import { hubAs } from "../hub-stand-in";
import RoutinesAsTasks from "./routines-as-tasks-live.svelte";

interface Play {
  canvas: {
    getByRole: (role: string, options: { name: string | RegExp }) => Element;
  };
  userEvent: {
    click: (el: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

/** Presses each control named, in order. */
const press =
  (...steps: [role: string, name: string | RegExp][]) =>
  async ({ canvas, userEvent }: Play) => {
    for (const [role, name] of steps) {
      await userEvent.wait(400);
      await userEvent.click(canvas.getByRole(role, { name }));
    }
  };

export default {
  title: "Project/Routines as repeating tasks, pressed",
  component: RoutinesAsTasks,
  args: { view: "routines", open: null, adding: false, repeat: "never" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** The docs check opened, on its Review. */
export const DocsOpened = { args: { open: "tsk-176" } };

/** The PR digest opened, on its Review. */
export const DigestOpened = { args: { open: "tsk-171" } };

/** The changelog fact opened. */
export const ChangelogOpened = { args: { open: "tsk-172" } };

/** The Routines tab, nothing open. */
export const RoutinesTab = {};

/** The docs check's runs: last night's failure, the sweep that found two links, the quiet nights folded. */
export const RunsTab = {
  args: { open: "tsk-176" },
  from: "DocsOpened",
  play: press(["tab", "Runs"]),
};

/** The quiet nights unfolded. */
export const QuietRunsOpened = {
  args: { open: "tsk-176" },
  from: "DocsOpened",
  play: press(["tab", "Runs"], ["button", /sweeps, all fine/u]),
};

/** The docs check's details: how it repeats, with Edit and Change with Caw. */
export const DetailsTab = {
  args: { open: "tsk-176" },
  from: "DocsOpened",
  play: press(["tab", "Details"]),
};

/** Editing how the PR digest repeats. */
export const EditingRepeat = {
  args: { open: "tsk-171" },
  from: "DigestOpened",
  play: press(["tab", "Details"], ["button", "Edit"]),
};

/** The staging check, stopped, opened from its row. */
export const StoppedOpened = {
  from: "RoutinesTab",
  play: press(["button", "Open Staging is healthy"]),
};

/** The release check opened while it runs. */
export const RunningOpened = { args: { open: "tsk-184" } };

/** The changelog fact, added on each merge, its details. */
export const OnEventDetails = {
  args: { open: "tsk-172" },
  from: "ChangelogOpened",
  play: press(["tab", "Details"]),
};

/** New task pressed on Routines: the board's form opens on a schedule. */
export const NewFromRoutines = {
  from: "RoutinesTab",
  play: press(["button", "New task"]),
};

/** New task's Repeat set to when something happens. */
export const NewOnAnEvent = {
  args: { view: "board", adding: true, repeat: "event" },
};

/** A one-off task opens as it always has. */
export const OneOffOpened = { args: { view: "board", open: "tsk-201" } };
