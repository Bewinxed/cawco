/**
 * The project's Settings view: the project page with Settings open, inside
 * the app's shell as it ships (its rail, the project's bar and its views
 * strip), fed one project's record (settings.fixtures.ts). The live story
 * is the person's: they read how the project runs and press what they
 * would press, answered by the fixture's mock hub.
 */

import SettingsLive from "./settings-live.svelte";
import { shellFrame } from "./shell-seed";

export default {
  ...shellFrame,
  title: "Project settings",
  component: SettingsLive,
  args: { situation: "At rest" },
};

/** Checking how Lantern web runs before handing it the week's work. */
export const CheckProjectSettings = {};
