/**
 * The Configure sheet (Option 2), under More in every place's bar: how the
 * project runs, changed with Caw; places and wiring; the spend cap; forget
 * or delete, asked in the page with what still runs named.
 */
import { BUSY } from "./fixture";
import HomeScreen from "./HomeScreen.svelte";
import { moveTo } from "./play";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Configure",
  component: HomeScreen,
  args: { briefing: BUSY, open: "configure", asking: false },
};

/** The sheet, from the trailing edge over Home. */
export const Configure = { parameters: desk };

/** On a phone, as a drawer. */
export const ConfigurePhone = {
  name: "Configure on a phone",
  parameters: phone,
};

/** Forget project… pressed: the question in the page, naming the three that stop first. */
export const Forgetting = {
  args: { asking: true },
  parameters: desk,
  from: "Configure",
  play: moveTo({ asking: true }),
};

/** Forgetting, on a phone. */
export const ForgettingPhone = {
  name: "Forgetting on a phone",
  args: { asking: true },
  parameters: phone,
};
