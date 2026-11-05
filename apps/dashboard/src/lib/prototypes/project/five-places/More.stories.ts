/**
 * The two sheets under the bar's More (Component Story Format 3, live
 * components): Spend, and Configure with Forget and Delete asked in it, on
 * the hub's own records (records.ts). The meta's args are every story's; a
 * story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { SWING } from "./records";
import { press } from "./story-kit";

export default {
  title: "Five places/More",
  component: FivePlaces,
  args: { records: SWING, place: "tasks" },
};

/** Spend: today and this month against the cap, and what reaching it stops. */
export const Spend = {
  args: { place: "tasks", height: 920, sheet: "spend" },
  parameters: { viewport: 1440 },
};

/** Configure: how it runs, places and wiring, who decides, events, account; Forget and Delete at its foot. */
export const Configure = {
  args: { place: "tasks", height: 920, sheet: "configure" },
  parameters: { viewport: 1440 },
};

/** Forget pressed: asked in the sheet, naming the sessions that stop first. */
export const ForgetAsked = {
  args: { place: "tasks", height: 920, sheet: "configure", asking: "forget" },
  parameters: { viewport: 1440 },
  from: "Configure",
  play: press("button", /^Forget project…$/u),
};

/** Delete pressed: asked in the sheet, what is removed and that it cannot be undone. */
export const DeleteAsked = {
  args: { place: "tasks", height: 920, sheet: "configure", asking: "delete" },
  parameters: { viewport: 1440 },
};

/** A phone: Spend. */
export const SpendPhone = {
  args: { place: "tasks", height: 844, sheet: "spend" },
  parameters: { viewport: 390 },
};

/** A phone: Configure with Delete asked. */
export const DeleteAskedPhone = {
  args: { place: "tasks", height: 844, sheet: "configure", asking: "delete" },
  parameters: { viewport: 390 },
};
