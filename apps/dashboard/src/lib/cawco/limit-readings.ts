/**
 * The page's readings of the bounds still waiting on data (core
 * limit-readings.ts), handed to the hub every `READINGS_HANDED_EVERY_MS` and
 * as the page goes away, under `browser`: a browser is no machine of the
 * fleet (hub limit-readings.ts). What the hub could not be reached for is
 * held for the next hand-off. Started once, from the client hook.
 */

import {
  handOnLimitReadings,
  READINGS_HANDED_EVERY_MS,
} from "@cawco/core/limit-readings";
import { hub } from "#lib/platform/hub.js";
import { hubReached } from "#lib/platform/hub-read.js";

const handOn = (): Promise<void> =>
  handOnLimitReadings((body) =>
    hubReached(
      hub.api["limit-readings"]({ machine: "browser" }).post(body, {
        fetch: { keepalive: true },
      })
    ).then(
      () => true,
      () => false
    )
  );

let carrying = false;

/** Hands the page's readings on from now, once however often it is called. */
export function carryLimitReadings(): void {
  if (carrying) {
    return;
  }
  carrying = true;
  setInterval(handOn, READINGS_HANDED_EVERY_MS);
  addEventListener("pagehide", () => {
    handOn();
  });
}
