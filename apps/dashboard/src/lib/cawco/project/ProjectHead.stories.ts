/**
 * The project head's sheet (project redesign): today's head (Caw's seat,
 * Ask Caw, Spin off, ⋯), then the proposed head (ProjectHeadNewSession):
 * Spin off gone from the head and from ⋯; New session in its place, opening
 * the kit's New-session dialog on the project's checkout, where the
 * spin-off is the dialog's lifetime chip. New session's look is the owner's
 * call the advisor left: outline beside Ask Caw's coral, or coral too.
 * Desk at the pane's width on a 1440 screen, then a phone.
 */
import { CAW_LEAD } from "../tasks/preview/caw-lead";
import { MACHINE, PROJECT_ROW } from "../tasks/preview/tidewater";
import ProjectHead from "./ProjectHead.svelte";
import ProjectHeadNewSession from "./ProjectHeadNewSession.svelte";
import PageRoom from "./preview/PageRoom.svelte";

const DESK = { viewport: 1180 };
const PHONE = { viewport: "phone" };
const room = () => ({ Component: PageRoom, props: { bare: true } });

export default {
  title: "Project redesign/Project head",
  component: ProjectHead,
  args: {
    project: PROJECT_ROW,
    machine: MACHINE,
    lead: CAW_LEAD,
    seated: true,
    onnewtask: () => undefined,
    onask: () => undefined,
    onfilter: () => undefined,
    onstages: null,
  },
  decorators: [room],
};

/** Desk · Today: Caw's seat, Ask Caw in coral, Spin off sized for "Spinning off…", ⋯. */
export const Today = { parameters: DESK };
/** Phone · Today: ⋯ alone on the name's row; Spin off inside it. */
export const TodayPhone = { parameters: PHONE };

/** Desk · Proposed, New session outlined: one coral action (Ask Caw); New session opens the kit's dialog. */
export const NewSession = {
  component: ProjectHeadNewSession,
  args: { look: "outline" },
  parameters: DESK,
};
/** Desk · Proposed, New session in coral beside Ask Caw: two coral actions in the head. */
export const NewSessionCoral = {
  component: ProjectHeadNewSession,
  args: { look: "coral" },
  parameters: DESK,
};
/** Phone · Proposed: ⋯ alone on the name's row; New session inside it, Spin off gone. */
export const NewSessionPhone = {
  component: ProjectHeadNewSession,
  args: { look: "outline" },
  parameters: PHONE,
};
