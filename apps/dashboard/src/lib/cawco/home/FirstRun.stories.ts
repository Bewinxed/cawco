/**
 * First run on the fleet board (Component Story Format 3, live
 * components): the steps to a first project on the owner's own fleet
 * (obelisk, Claude Code), from a fresh hub to the first project. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import FirstRun from "./FirstRun.svelte";

const none = () => undefined;

export default {
  title: "Onboarding/First run",
  component: FirstRun,
  args: {
    steps: {
      machine: { state: "done", name: "obelisk" },
      harness: { state: "todo" },
      relay: "todo",
      project: false,
    },
    onaddmachine: none,
    onsignin: none,
    onrelay: none,
    onlater: none,
    onnewproject: none,
  },
  parameters: { viewport: 1212 },
};

/** obelisk has just joined: Caw arrives, step 1 ticks, sign-in is next. */
export const Arrived = { args: { arrived: true } };

/** A fresh hub with no machine: Caw asleep, Add machine is the one thing to do. */
export const Fresh = {
  args: {
    steps: {
      machine: { state: "todo" },
      harness: { state: "todo" },
      relay: "todo",
      project: false,
    },
  },
};

/** obelisk joined and went offline: step 1 names it and says how it ticks. */
export const Offline = {
  args: {
    steps: {
      machine: { state: "offline", name: "obelisk" },
      harness: { state: "todo" },
      relay: "todo",
      project: false,
    },
  },
};

/** The sign-in failed: the step says which harness on which machine, and why. */
export const SignInFailed = {
  args: {
    steps: {
      machine: { state: "done", name: "obelisk" },
      harness: {
        state: "failed",
        reason:
          "Claude Code on obelisk didn't finish signing in (the browser window closed). Sign in again; nothing else has changed.",
      },
      relay: "todo",
      project: false,
    },
  },
};

/** Signed in, the relay put off: New project is next. */
export const ProjectNext = {
  args: {
    steps: {
      machine: { state: "done", name: "obelisk" },
      harness: { state: "done", harness: "Claude Code" },
      relay: "later",
      project: false,
    },
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
    steps: {
      machine: { state: "done", name: "obelisk" },
      harness: { state: "done", harness: "Claude Code" },
      relay: "later",
      project: false,
    },
  },
  parameters: { viewport: 390 },
};
