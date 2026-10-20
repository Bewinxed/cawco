/**
 * A blocking state at the panel's centre, one option for the decision page: Caw over the words, every line and button centred.
 */
import PanelScreen from "./PanelScreen.svelte";
import type { PlayContext } from "./play";

export default {
  title: "When Caw can't/Caw over centred words",
  component: PanelScreen,
  args: { layout: "stack" },
};

/** Desk: the thread couldn't be read. */
export const CantRead = {
  args: { form: "desk", scene: "cant-read" },
  parameters: { viewport: 402 },
};

/** Desk: Caw can't start, no machine is online. */
export const CantStart = {
  args: { form: "desk", scene: "cant-start" },
  parameters: { viewport: 402 },
};

/** Desk: Show details opened on the hub's own words. */
export const Details = {
  args: { form: "desk", scene: "cant-read", open: true },
  parameters: { viewport: 402 },
  from: "CantRead",
  play: async ({ canvas, userEvent }: PlayContext) => {
    await userEvent.click(canvas.getByText("Show details"));
  },
};

/** Phone: the thread couldn't be read. */
export const PhoneCantRead = {
  args: { form: "phone", scene: "cant-read" },
  parameters: { viewport: "phone" },
};

/** Phone: Caw can't start, every machine listed under Show details. */
export const PhoneLong = {
  args: { form: "phone", scene: "cant-start", long: true, open: true },
  parameters: { viewport: "phone" },
};

/** Phone, a 360-wide screen: the thread couldn't be read, Show details open on the hub's own words. */
export const PhoneDetails = {
  args: { form: "phone", scene: "cant-read", open: true, peek: 560 },
  parameters: { viewport: 360 },
};
