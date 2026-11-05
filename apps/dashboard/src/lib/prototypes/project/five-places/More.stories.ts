/**
 * The two sheets under the bar's More (Component Story Format 3, live
 * components): Spend, and Configure with Forget and Delete asked in it, on
 * the hub's own records (records.ts). The meta's args are every story's; a
 * story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { SWING } from "./records";
import { at, DESK, PHONE, press } from "./story-kit";

export default {
  title: "Five places/More",
  component: FivePlaces,
  args: { records: SWING, place: "tasks" },
};

/** Spend: today and this month against the cap, and what reaching it stops. */
export const Spend = at(DESK, { sheet: "spend" });

/** Configure: how it runs, places and wiring, who decides, events, account; Forget and Delete at its foot. */
export const Configure = at(DESK, { sheet: "configure" });

/** Forget pressed: asked in the sheet, naming the sessions that stop first. */
export const ForgetAsked = {
  ...at(DESK, { sheet: "configure", asking: "forget" }),
  from: "Configure",
  play: press("button", /^Forget project…$/u),
};

/** Delete pressed: asked in the sheet, what is removed and that it cannot be undone. */
export const DeleteAsked = at(DESK, { sheet: "configure", asking: "delete" });

/** A phone: Spend. */
export const SpendPhone = at(PHONE, { sheet: "spend" });

/** A phone: Configure with Delete asked. */
export const DeleteAskedPhone = at(PHONE, {
  sheet: "configure",
  asking: "delete",
});
