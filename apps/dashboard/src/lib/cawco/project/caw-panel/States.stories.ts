/**
 * What Caw's panel does in each state (advisor report §2, the per-state
 * table), settled: one frame per state at desk and phone.
 */
import PanelScreen from "./PanelScreen.svelte";

export default {
  title: "Caw's panel/Each state",
  component: PanelScreen,
  args: {},
};

/** Desk: the thread at rest, opened at its latest. */
export const DeskIdle = {
  args: { form: "desk", scene: "idle" },
  parameters: { viewport: 388 },
};

/** Phone: the thread at rest, opened at its latest. */
export const PhoneIdle = {
  args: { form: "phone", scene: "idle" },
  parameters: { viewport: "phone" },
};

/** Desk: his words at the tail, what he's doing under them, Stop in the box. */
export const DeskWorking = {
  args: { form: "desk", scene: "working" },
  parameters: { viewport: 388 },
};

/** Phone: his words at the tail, what he's doing under them, Stop in the box. */
export const PhoneWorking = {
  args: { form: "phone", scene: "working" },
  parameters: { viewport: "phone" },
};

/** Desk: his question grown into the message box. */
export const DeskNeedsYou = {
  args: { form: "desk", scene: "needs-you" },
  parameters: { viewport: 388 },
};

/** Phone: his question grown into the message box. */
export const PhoneNeedsYou = {
  args: { form: "phone", scene: "needs-you" },
  parameters: { viewport: "phone" },
};

/** Desk: no machine is online: the block at the centre, the box kept. */
export const DeskNoMachine = {
  args: { form: "desk", scene: "no-machine" },
  parameters: { viewport: 388 },
};

/** Phone: no machine is online: the block at the centre, the box kept. */
export const PhoneNoMachine = {
  args: { form: "phone", scene: "no-machine" },
  parameters: { viewport: "phone" },
};

/** Desk: the budget is reached: the block at the centre, the box kept. */
export const DeskBudget = {
  args: { form: "desk", scene: "budget" },
  parameters: { viewport: 388 },
};

/** Phone: the budget is reached: the block at the centre, the box kept. */
export const PhoneBudget = {
  args: { form: "phone", scene: "budget" },
  parameters: { viewport: "phone" },
};

/** Desk: he's off: the Off chip, his seat asleep. */
export const DeskOff = {
  args: { form: "desk", scene: "off" },
  parameters: { viewport: 388 },
};

/** Phone: he's off: the Off chip, his seat asleep. */
export const PhoneOff = {
  args: { form: "phone", scene: "off" },
  parameters: { viewport: "phone" },
};

/** Desk: the thread couldn't be read: the block, no box. */
export const DeskCantRead = {
  args: { form: "desk", scene: "cant-read" },
  parameters: { viewport: 388 },
};

/** Phone: the thread couldn't be read: the block, no box. */
export const PhoneCantRead = {
  args: { form: "phone", scene: "cant-read" },
  parameters: { viewport: "phone" },
};

/** Desk: your message didn't wake him: the row under it. */
export const DeskNotWoken = {
  args: { form: "desk", scene: "not-woken" },
  parameters: { viewport: 388 },
};

/** Phone: your message didn't wake him: the row under it. */
export const PhoneNotWoken = {
  args: { form: "phone", scene: "not-woken" },
  parameters: { viewport: "phone" },
};

/** Desk: a new thread: what's next, and things to ask him. */
export const DeskEmpty = {
  args: { form: "desk", scene: "empty" },
  parameters: { viewport: 388 },
};

/** Phone: a new thread: what's next, and things to ask him. */
export const PhoneEmpty = {
  args: { form: "phone", scene: "empty" },
  parameters: { viewport: "phone" },
};

/** Phone, a 360-wide screen: the thread couldn't be read, Show details open on a long error. */
export const PhoneDetails = {
  args: { form: "phone", scene: "cant-read", open: true, long: true },
  parameters: { viewport: 360 },
};

/** Desk: no machine is online, Show details open on each machine. */
export const DeskMachines = {
  args: { form: "desk", scene: "no-machine", open: true },
  parameters: { viewport: 388 },
};
