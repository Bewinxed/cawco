/**
 * First run on the fleet board (Component Story Format 3, live
 * components): the steps to a first project on the owner's own fleet
 * (obelisk, Claude Code), from a fresh hub to the first project, the
 * fleet's helpers and step lists asked in place on the way. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import type { FirstRunState } from "./FirstRun.svelte";
import FirstRun from "./FirstRun.svelte";

const none = () => undefined;

/** obelisk online, nothing else done yet: what each story changes it from. */
const FRESH: FirstRunState = {
  machine: { state: "done", name: "obelisk" },
  harness: { state: "todo" },
  ownTools: { helpers: null, stepLists: null },
  ownToolsFaults: { helpers: null, stepLists: null },
  relay: "todo",
  project: false,
};

/** Signed in with Claude Code on obelisk. */
const SIGNED_IN: FirstRunState = {
  ...FRESH,
  harness: { state: "done", harness: "Claude Code" },
};

/** Signed in, both switches chosen, the relay put off. */
const PROJECT_NEXT: FirstRunState = {
  ...SIGNED_IN,
  ownTools: { helpers: "delegates", stepLists: "cawco" },
  relay: "later",
};

export default {
  title: "Onboarding/First run",
  component: FirstRun,
  args: {
    steps: FRESH,
    onaddmachine: none,
    onsignin: none,
    onrelay: none,
    onlater: none,
    onnewproject: none,
    onchoose: none,
  },
  parameters: { viewport: 1212 },
};

/** obelisk has just joined: Caw arrives, step 1 ticks, sign-in is next. */
export const Arrived = { args: { arrived: true } };

/** A fresh hub with no machine: Caw asleep, Add machine is the one thing to do. */
export const Fresh = {
  args: {
    steps: { ...FRESH, machine: { state: "todo" } },
  },
};

/** obelisk joined and went offline: step 1 names it and says how it ticks. */
export const Offline = {
  args: {
    steps: { ...FRESH, machine: { state: "offline", name: "obelisk" } },
  },
};

/** The sign-in failed: the step says which harness on which machine, and why. */
export const SignInFailed = {
  args: {
    steps: {
      ...FRESH,
      harness: {
        state: "failed",
        reason:
          "Claude Code on obelisk didn't finish signing in (the browser window closed). Sign in again; nothing else has changed.",
      },
    },
  },
};

/** Signed in: the helpers' switch is asked in place, CawCo's delegates recommended. */
export const HelpersNext = {
  args: {
    steps: SIGNED_IN,
  },
};

/** The helpers' pick didn't save: the step says why, and asks again. */
export const HelpersNotSaved = {
  args: {
    steps: {
      ...SIGNED_IN,
      ownToolsFaults: {
        helpers:
          "The hub didn't answer (timed out after 10 s). Sessions keep the setting before it.",
        stepLists: null,
      },
    },
  },
};

/** Helpers chosen: the step lists' switch is next. */
export const StepListsNext = {
  args: {
    steps: {
      ...SIGNED_IN,
      ownTools: { helpers: "subagents", stepLists: null },
    },
  },
};

/** Signed in, both switches chosen, the relay put off: New project is next. */
export const ProjectNext = {
  args: {
    steps: PROJECT_NEXT,
  },
};

/** On a phone: obelisk just joined. */
export const ArrivedPhone = {
  args: { arrived: true },
  parameters: { viewport: 390 },
};

/** On a phone: New project is next. */
export const ProjectNextPhone = {
  args: {
    steps: PROJECT_NEXT,
  },
  parameters: { viewport: 390 },
};
