/**
 * The top bar's trailing group (Component Story Format 3, live
 * components): Files, Jump, the machines and Caw's head on their glass, with
 * the counts and the tinted symbol gone (Apple HIG, Toolbars), drawn with
 * the recommended answer to each open choice: a machine problem as a badge,
 * no mark on Files, Jump's glyph at the group's 20px. Desk frames are the
 * trailing end of the 1440px bar on a conversation; phone frames are the
 * 390px screen. The meta's args are every story's; a story's own args are
 * what it changes.
 */
import BarGroup from "./BarGroup.svelte";
import { AT_REST, ONE_DOWN, SIGN_IN } from "./fixtures";
import SidebarMachines from "./SidebarMachines.svelte";

const DESK = 360;

export default {
  title: "Top bar/Trailing group",
  component: BarGroup,
  args: { form: "desk", machines: AT_REST },
  parameters: { viewport: DESK },
};

/** Desk, at rest: four symbols in the group's muted ink, no numbers. */
export const AtRest = {};

/** Desk: the Mac stopped answering, so the machines symbol wears the fail badge. */
export const OneDown = {
  args: { machines: ONE_DOWN },
  from: "AtRest",
  play: async ({ update }: { update: (next: object) => Promise<void> }) => {
    await update({ machines: ONE_DOWN });
  },
};

/** Desk: OpenCode on the Mac needs signing in, so the badge is the attention ink. */
export const NeedsSignIn = { args: { machines: SIGN_IN } };

/** Desk: new files landed, drawn with the dot (the alternative to no mark). */
export const NewFiles = { args: { files: "dot", fresh: true } };

/** Desk: the pointer on Files. */
export const HoverFiles = { args: { hover: "files" } };

/** Desk: the pointer on Jump. */
export const HoverJump = { args: { hover: "jump" } };

/** Desk: the pointer on the machines, one of them down. */
export const HoverMachines = {
  args: { hover: "machines", machines: ONE_DOWN },
};

/** Desk: the pointer on Caw. */
export const HoverCaw = { args: { hover: "caw" } };

/** Phone: Caw alone on his tab at the screen's trailing edge. */
export const PhoneCaw = {
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: the sidebar's machines with the Mac down, as they stand today. */
export const PhoneSidebarDown = {
  component: SidebarMachines,
  args: { machines: ONE_DOWN },
  parameters: { viewport: "phone" },
};
