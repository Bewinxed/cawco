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

/** Turning him off from the hero's switch while what he started still runs: the confirm hangs from its glass. */
export const TurningOff = {
  args: { projectId: "cockpit-live-off", asked: "off" },
};

/** The confirm pressed: each stop lands in the card hung from the switch, then the card folds back as he is off. */
export const Stopped = {
  from: "TurningOff",
  play: async ({
    userEvent,
  }: {
    userEvent: {
      click: (element: Element) => Promise<void>;
      wait: (ms: number) => Promise<void>;
    };
  }) => {
    // The stand-in reads what runs and the card grows out of the switch first.
    await userEvent.wait(1500);
    const stop = document.querySelector("[data-stop-confirm]");
    if (stop instanceof HTMLElement) {
      stop.click();
    }
    await userEvent.wait(3000);
  },
};
