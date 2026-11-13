/**
 * Whether this page's hub reaches a preview origin, asked through Eden
 * (`GET /api/preview-reach`), for core's probe (`probePreview`, its
 * `hubReach`): null when the hub can't be asked, as core's `askHubReach`
 * reads one, which a page on a preview origin asks instead.
 */
import { readWithin } from "@cawco/core/bounded";
import { type HubReach, PROBE_ANSWER_MS } from "@cawco/core/preview/reach";
import { hub } from "#lib/platform/hub.js";
import { hubAsk } from "#lib/platform/hub-read.js";

export async function hubReach(origin: string): Promise<HubReach | null> {
  // The probe's own deadline, its signal in the request's fetch init (Eden
  // Treaty docs, Parameters: "Fetch parameters").
  const read = await readWithin(PROBE_ANSWER_MS, (signal) =>
    hubAsk(
      hub.api["preview-reach"].get({
        query: { origin },
        fetch: { cache: "no-store", signal },
      })
    )
  ).catch(() => null);
  if (!(read?.kind === "answered" && read.value.ok)) {
    return null;
  }
  const reach = read.value.value;
  return reach.reached ? { reached: true } : { reached: false, why: reach.why };
}
