/**
 * The Routines screen after each press the person makes in it (Component
 * Story Format 3, live components): the reading behind its live story.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import Routines from "./Routines.svelte";

interface PlayContext {
  canvas: {
    getByRole: (role: string, options: { name: string }) => Element;
  };
  userEvent: { click: (el: Element) => Promise<void> };
}

/** Opens a routine by its expand button, then presses a button inside it. */
const openThen =
  (routine: string, button: string) =>
  async ({ canvas, userEvent }: PlayContext) => {
    await userEvent.click(
      canvas.getByRole("button", { name: `Open ${routine}` })
    );
    await userEvent.click(canvas.getByRole("button", { name: button }));
  };

export default {
  args: { stale: false },
  component: Routines,
  decorators: [hubAs("connected")],
  title: "Project/Routines, pressed",
};

/** Every routine at a glance, before anything is opened. */
export const AtAGlance = {};

/** The hub isn't live: the last reading stays, and changes wait. */
export const LastReading = { args: { stale: true } };

/** I opened the staging check that stopped. */
export const RoutineOpened = {
  from: "AtAGlance",
  play: async ({ canvas, userEvent }: PlayContext) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Staging health check" })
    );
  },
};

/** I opened last night's link sweep and read the session that ran it. */
export const SessionOpened = {
  from: "AtAGlance",
  play: openThen("Nightly broken-link sweep", "Open session"),
};

/** I opened an earlier run of the morning triage. */
export const EarlierRunOpened = {
  from: "AtAGlance",
  play: openThen("Morning PR triage", "Open the run from yesterday"),
};

/** I asked Caw to fix the staging check, and the words are ready to send. */
export const FixWithCaw = {
  from: "AtAGlance",
  play: async ({ canvas, userEvent }: PlayContext) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Fix Staging health check with Caw" })
    );
  },
};

/** I'm changing the morning triage by hand. */
export const Editing = {
  from: "AtAGlance",
  play: openThen("Morning PR triage", "Edit"),
};

/** I'm adding a new routine. */
export const NewRoutine = {
  from: "AtAGlance",
  play: async ({ canvas, userEvent }: PlayContext) => {
    await userEvent.click(canvas.getByRole("button", { name: "New routine" }));
  },
};
