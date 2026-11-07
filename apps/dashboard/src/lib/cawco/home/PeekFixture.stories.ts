/**
 * The peek, Home's quick look at one session without opening it (Component
 * Story Format 3, live): what the session said runs the sheet under its
 * floating bar, and what it waits on, its plan and what it is doing float
 * as one glass tray at its foot. The pane is the product's; the session
 * stands in the client's store (peek-fixtures.ts). At 400 it is the desk's
 * sheet beside Home; at an iPad's width, the sheet risen across the screen.
 */
import PeekFixture from "./PeekFixture.svelte";

export default {
  title: "Peek",
  component: PeekFixture,
  args: { stepsOpen: false, height: 790 },
  parameters: { viewport: 400 },
};

/** Waiting on you to let it make a new deploy key. */
export const Asking = { args: { scene: "asking" } };

/** Working on the passkey button, seven steps into its plan. */
export const Working = { args: { scene: "working" } };

/** Asking you which origin the passkey should sign for. */
export const Question = { args: { scene: "question" } };

/** Waiting on you to connect GitHub. */
export const SignIn = { args: { scene: "signin" } };

/** Waiting on you for three things at once, the oldest first. */
export const Several = { args: { scene: "several" } };

/** Its long plan opened over what it said, on the step it is at. */
export const LongPlan = { args: { scene: "plan", stepsOpen: true } };

/** Working with no plan written. */
export const NoPlan = { args: { scene: "noplan" } };

/** Done, every step of its plan ticked. */
export const Ended = { args: { scene: "ended" } };

/** Stopped on an error: the deploy key doesn't match. */
export const Failed = { args: { scene: "failed" } };

/** Its machine can't be reached. */
export const Unreachable = { args: { scene: "unreachable" } };

/** Reading what it said. */
export const Reading = { args: { scene: "reading" } };

/** Started, with nothing said yet. */
export const NothingYet = { args: { scene: "empty" } };

/** What it said couldn't be read. */
export const Unread = { args: { scene: "unread" } };
