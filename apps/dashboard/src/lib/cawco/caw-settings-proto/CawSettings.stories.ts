/**
 * Caw's settings to use (Component Story Format 3, live components): the
 * project head's More opens them, on a stand-in hub (caw-settings-live).
 * Flip him by the switch or by a scene, pick what his chat or a kind of
 * trigger runs as; the dials set what no press reaches: what the hub does
 * with a change, whether what he started still runs, the hub away, a kind
 * already set on its own. The meta's `beforeEach` feeds the machines and the
 * accounts through their stores' own writers.
 */
import CawSettingsLive from "./caw-settings-live.svelte";
import { PANEL_ARGS, seedStores } from "./caw-settings-play";

export default {
  title: "Caw/Caw settings",
  component: CawSettingsLive,
  args: { ...PANEL_ARGS, projectId: "cockpit-live" },
  beforeEach: seedStores,
};

/** Caw's settings open from the project's More, him awake. */
export const Live = { args: { overridden: true } };
