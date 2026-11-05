/**
 * Caw's pane, in "Places down the side" (Component Story Format 3, live
 * components): docked beside the page from 1024 up, a sheet from the
 * trailing edge at 900, a bottom drawer on a phone. His status and
 * sentence, harness and model, the events switch, Turn off, his newest
 * conversation, the project's starters and the composer. Working on
 * Cawco; idle on Cawco-Dev; fresh on a project just made; off; unreachable;
 * his last turn reading.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { JUST_MADE, LOADING } from "./fixtures";
import { LIVE } from "./model";
import ProjectScreen from "./ProjectScreen.svelte";
import { press } from "./play";

export default {
  title: "Rail of places/Caw",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "home", caw: true },
};

/** Docked beside Home: working on the routines card. */
export const CawDocked = { parameters: { viewport: 1440 } };

/** At 900: a sheet from the trailing edge over Home. */
export const CawSheetAt900 = { parameters: { viewport: 900 } };

/** On a phone: a bottom drawer up to 85% of the screen. */
export const CawDrawer = { parameters: { viewport: 390 } };

/** A fresh conversation on a project just made: the starters fill the composer. */
export const CawFresh = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** Off: nothing wakes him until Turn on. */
export const CawOff = {
  args: {
    project: {
      ...CAWCO_IN_SWING,
      caw: {
        ...CAWCO_IN_SWING.caw,
        status: "off",
        sentence: "Turned off at 09:12",
      },
    },
  },
  parameters: { viewport: 1440 },
};

/** Unreachable: his machine stopped answering. */
export const CawUnreachable = {
  args: {
    project: {
      ...CAWCO_IN_SWING,
      caw: {
        ...CAWCO_IN_SWING.caw,
        status: "unreachable",
        sentence: "Last heard at 10:40",
      },
    },
  },
  parameters: { viewport: 1440 },
};

/** His conversation is being read. */
export const CawReading = {
  args: { read: LOADING },
  parameters: { viewport: 1440 },
};

/** A starter pressed: it fills the composer and does not send. */
export const CawStarterFilled = {
  from: "CawDocked",
  parameters: { viewport: 1440 },
  play: press(/^Plan this week's five posts/u),
};
