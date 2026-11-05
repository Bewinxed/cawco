/**
 * The Configure sheet, in "Places down the side" (Component Story Format
 * 3, live components), from More or the rail's foot: how the project runs
 * and where it lives, then Forget and Delete, each asking in the page and
 * naming what still runs. At 1440 (from the trailing edge) and 390 (a
 * bottom drawer).
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Configure",
  component: ProjectScreen,
  args: {
    project: CAWCO_IN_SWING,
    read: LIVE,
    place: "home",
    sheet: "configure",
  },
};

/** Cawco's settings over Home. */
export const Open = { parameters: { viewport: 1440 } };

/** On a phone, a bottom drawer. */
export const OpenPhone = { parameters: { viewport: 390 } };

/** Forget pressed: the question unfolds in place, naming the four sessions that stop first. */
export const ForgetAsked = {
  from: "Open",
  parameters: { viewport: 1440 },
  play: press("Forget project…"),
};

/** Delete pressed, on a phone. */
export const DeleteAskedPhone = {
  from: "OpenPhone",
  parameters: { viewport: 390 },
  play: press("Delete project…"),
};

/** More open on Home's bar: the project's rare acts, each opening this sheet. */
export const MoreOpen = {
  args: { sheet: null, more: true },
  parameters: { viewport: 1440 },
};
