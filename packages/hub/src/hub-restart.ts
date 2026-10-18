/**
 * The hub's word to every dashboard that it is about to restart for an
 * update, and by when it answers again. The hub's own machine says it is
 * installing before its update helper restarts the hub (agent
 * binary-update.ts `#replace`: the fence, then `#tellHub`, then the
 * helper), so the hub hears the restart coming on that state and tells
 * every dashboard at once, and each that connects while it stands. A
 * dashboard then reads the socket closing as the update, not as a hub
 * that went away, until the deadline. The deadline is the update's trial
 * (UPDATE_TRIAL_MS): by then the new build answers, or the helper has
 * rolled back to the one before and that one does.
 *
 * Taken back (`restart: null`) when the same machine says anything but
 * installing while this hub still runs: the install ended without
 * restarting it. A machine's connection ending says nothing either way,
 * since the update restarts its agent too.
 */
import type { HubRestartFrame } from "@cawco/core";
import {
  type BinaryUpdateState,
  UPDATE_TRIAL_MS,
} from "@cawco/core/binary-updates";

export interface HubRestarts {
  /** What a dashboard connecting now is owed: the announcement while one stands, else null. */
  frame: () => HubRestartFrame | null;
  /** A machine's update state as the hub takes it. */
  note: (state: BinaryUpdateState) => void;
}

export function hubRestarts(
  broadcast: (frame: HubRestartFrame) => void
): HubRestarts {
  let announced: { until: number; version: string | null } | null = null;
  const frame = (): HubRestartFrame => ({
    kind: "hub.restart",
    restart: announced
      ? {
          reason: "update",
          version: announced.version,
          withinMs: Math.max(0, announced.until - Date.now()),
        }
      : null,
  });
  return {
    frame: () => (announced ? frame() : null),
    note: (state) => {
      if (!state.hostsHub) {
        return;
      }
      const installing = state.phase === "installing";
      if (installing && !announced) {
        announced = {
          until: Date.now() + UPDATE_TRIAL_MS,
          version: state.availableVersion ?? null,
        };
        console.info(
          `[hub] restarting for the update to ${announced.version ?? "a new build"}: dashboards told it is back within ${UPDATE_TRIAL_MS / 1000}s`
        );
        broadcast(frame());
      } else if (!installing && announced) {
        announced = null;
        console.info(
          "[hub] the update ended without a restart: dashboards told"
        );
        broadcast(frame());
      }
    },
  };
}
