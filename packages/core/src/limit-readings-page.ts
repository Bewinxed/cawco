/**
 * A page's readings of the bounds still waiting on data (limit-readings.ts),
 * handed to the hub's path on the page's own origin
 * ({@link PREVIEW_READINGS_PATH}) every {@link READINGS_HANDED_EVERY_MS} and
 * as the page goes away; what the hub could not be reached for is held for
 * the next hand-off. Each bundle that records holds its own readings, so
 * each starts its own carrier: the preview overlay, the canvas's host page.
 */

import {
  handOnLimitReadings,
  READINGS_HANDED_EVERY_MS,
} from "./limit-readings";
import { PREVIEW_READINGS_PATH } from "./preview/routes";

const handOn = (): Promise<void> =>
  handOnLimitReadings((body) =>
    fetch(PREVIEW_READINGS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).then((answer) => answer.ok)
  );

/** Hands this bundle's readings on from now. */
export function carryPageReadings(): void {
  setInterval(handOn, READINGS_HANDED_EVERY_MS);
  addEventListener("pagehide", () => {
    handOn();
  });
}
