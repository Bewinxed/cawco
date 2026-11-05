/**
 * Home, in "Places down the side, and the rail is the glance" (Component
 * Story Format 3, live components): the project's rail with each place's
 * live fact, and Home's three groups (Stages, Needs you, Working now), on
 * Cawco, the hub's X and marketing project, in full swing on 5 November
 * 2026; on Cawco-Dev with nothing waiting; on a project made a minute ago;
 * while the first read is out, while the hub is unreachable, and with one
 * read failed. Each state at 1440 and 390, the stacked 900 where Home's two
 * groups stack. The meta's args are every story's; a story's own args are
 * what it changes.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_QUIET, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { type Play, press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Home",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "home" },
};

/** Twelve things wait on Cawco, longest first, each answered where it stands; two attempts are stuck. */
export const InFullSwing = { parameters: { viewport: 1440 } };

/** The same morning on a phone: the bar's places symbol, Ask Caw trailing, the stages as a strip. */
export const InFullSwingPhone = { parameters: { viewport: 390 } };

/** At 900 the rail is a sheet and Needs you stacks over Working now. */
export const InFullSwingAt900 = { parameters: { viewport: 900 } };

/** Cawco-Dev with its two Review tasks answered: nothing waits, one attempt works. */
export const NothingWaits = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 1440 },
};

/** Nothing waits, on a phone. */
export const NothingWaitsPhone = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 390 },
};

/** A project Caw made a minute ago: stages named without numbers, and the one act that starts work. */
export const JustMade = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** Just made, on a phone. */
export const JustMadePhone = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out: the rail's facts and Home's groups stand as skeletons at their size. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** Reading, on a phone. */
export const ReadingPhone = {
  args: { read: LOADING },
  parameters: { viewport: 390 },
};

/** The hub stopped answering at 10:42: rows kept and marked, no count claimed, answers held. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The hub unreachable, on a phone. */
export const HubUnreachablePhone = {
  args: { read: STALE },
  parameters: { viewport: 390 },
};

/** Needs you is current but Working now could not be read: its last rows kept from 10:31, marked. */
export const WorkingNowUnread = {
  args: { read: { ...LIVE, unread: ["home:working", "rail:sessions"], kept: "10:31" } },
  parameters: { viewport: 1440 },
};

/** Approve on Caw's proposed designer type: the row leaves, the next wait moves up. */
export const DesignerApproved = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press(/^Approve$/u),
};

/** Open on the first post in Your call: the task's pane slides over the page's trailing third, Home live beside it. */
export const PostOpened = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press(/^Open Post: one board/u),
};

/** Close on the task's pane: back to Home where it was. */
export const PostClosed = {
  from: "PostOpened",
  parameters: { viewport: 1440 },
  play: async (context: Play) => {
    await press(/^Open Post: one board/u)(context);
    await context.userEvent.wait(400);
    await press("Close task")(context);
  },
};

/** Ask Caw: his pane docks beside the page; Home stays as it was. */
export const CawDocked = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press("Ask Caw"),
};

/** On a phone, Open on a post: the task rises as a bottom drawer over Home. */
export const PostOpenedPhone = {
  from: "InFullSwingPhone",
  parameters: { viewport: 390 },
  play: press(/^Open Post: one board/u),
};
