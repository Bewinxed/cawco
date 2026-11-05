/**
 * The project's places, in "Places down the side" (Component Story Format
 * 3, live components): under the desk line the rail is the places sheet
 * behind the bar's leading symbol, the same rows with the same live facts,
 * so the sheet is still the glance. Cawco; Cawco-Dev with nothing waiting;
 * a project just made; reading; the hub unreachable; one row unread. On a
 * desk the rail is drawn in every other screen's stories.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_QUIET, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Places",
  component: ProjectScreen,
  args: {
    project: CAWCO_IN_SWING,
    read: LIVE,
    place: "home",
    sheet: "places",
  },
};

/** Cawco's places on a phone: Home 12 need you, Tasks 2 stuck, Routines 1 failed, Caw working. */
export const InFullSwing = { parameters: { viewport: 390 } };

/** At 900, the same sheet over Home. */
export const InFullSwingAt900 = { parameters: { viewport: 900 } };

/** Nothing waits: no dot, the facts quiet. */
export const NothingWaits = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 390 },
};

/** Just made: every place named, each saying nothing yet. */
export const JustMade = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out: each fact a skeleton at its size. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 390 } };

/** The hub unreachable: Home's count withheld, every fact says since when. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 390 },
};

/** Routines could not be read: its row says so; the rest are current. */
export const RowUnread = {
  args: { read: { ...LIVE, unread: ["rail:routines"] } },
  parameters: { viewport: 390 },
};

/** The bar's places symbol pressed on Home: the sheet slides in from the leading edge. */
export const SheetOpened = {
  args: { sheet: null },
  from: "Closed",
  parameters: { viewport: 390 },
  play: press("Places"),
};

/** Home with the sheet shut, where the flow starts. */
export const Closed = { args: { sheet: null }, parameters: { viewport: 390 } };

/** Tasks pressed in the sheet: it closes on the board. */
export const ToTasks = {
  from: "InFullSwing",
  parameters: { viewport: 390 },
  play: press(/^Tasks/u),
};
