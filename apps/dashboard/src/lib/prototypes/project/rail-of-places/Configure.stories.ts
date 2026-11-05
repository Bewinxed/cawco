/**
 * The Configure sheet, in "Places down the side" (Component Story Format
 * 3, live components), from More or the rail's foot: how the project runs
 * and where it lives, then Forget and Delete, each asking in the page and
 * naming what still runs. At 1440 (from the trailing edge) and 390 (a
 * bottom drawer).
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { LIVE } from "./model";
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
export const ConfigureOpen = { parameters: { viewport: 1440 } };

/** On a phone, a bottom drawer. */
export const ConfigureOpenPhone = { parameters: { viewport: 390 } };

/** Forget asked in place: the question names the four sessions that stop first. */
export const ConfigureForgetAsked = {
  args: { ask: "forget" },
  parameters: { viewport: 1440 },
};

/** Delete asked, on a phone: what goes and that it cannot be undone. */
export const ConfigureDeleteAskedPhone = {
  args: { ask: "delete" },
  parameters: { viewport: 390 },
};

/** More open on Home's bar: the project's rare acts, each opening this sheet. */
export const ConfigureMoreOpen = {
  args: { sheet: null, more: true },
  parameters: { viewport: 1440 },
};
