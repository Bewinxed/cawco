/**
 * PROPOSED: the project head without Spin off; New session in its place
 * opens the kit's New-session dialog on the project's checkout, where the
 * spin-off is the dialog's lifetime chip. New session is outlined, so Ask
 * Caw stays the head's one coral action (DESIGN.md: "coral marks the one
 * place you act").
 */
import { CAW_LEAD } from "../tasks/preview/caw-lead";
import { MACHINE, PROJECT_ROW } from "../tasks/preview/tidewater";
import ProjectHeadNewSession from "./ProjectHeadNewSession.svelte";
import PageRoom from "./preview/PageRoom.svelte";

export default {
  title: "Project head/New session",
  component: ProjectHeadNewSession,
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
  decorators: [() => ({ Component: PageRoom, props: { bare: true } })],
};

/** Desk · Spin off gone; New session outlined beside Ask Caw, the head's one coral action. */
export const Desk = { parameters: { viewport: 1180 } };
/** Phone · The head's ⋯ holds New session; Spin off is gone. */
export const Phone = { parameters: { viewport: "phone" } };
