/**
 * Caw's settings to use (Component Story Format 3, live components): the
 * project head's More opens them (caw-settings-frame), fed the fixtures.
 * Flip him by the switch, pick what his chat or a kind of trigger runs as;
 * the dials set what no press reaches: whether what he started still runs,
 * the hub away, a kind already set on its own. The meta's `beforeEach`
 * feeds the machines and the accounts through their stores' own writers.
 */
import CawSettingsFrame from "./caw-settings-frame.svelte";
import { askOff, PANEL_ARGS, seedStores } from "./caw-settings-play";

export default {
  title: "Caw/Caw settings",
  component: CawSettingsFrame,
  args: { ...PANEL_ARGS, projectId: "cockpit-live" },
  beforeEach: seedStores,
};

/** Caw's settings open from the project's More, him awake. */
export const Live = { args: { overridden: true } };

/** Turning him off from the hero's switch while what he started still runs: the confirm hangs from its glass. */
export const TurningOff = { from: "Live", play: askOff };
