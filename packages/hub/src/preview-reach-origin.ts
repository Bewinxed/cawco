/**
 * Whether `origin`'s ping is reached from here now, as a browser asks it
 * (core preview-reach.ts): the hub's `/api/preview-reach` for the dashboard,
 * the preview server's `PREVIEW_REACH_PATH` for a page it serves. The origin
 * must be one of this hub's previews, a port of its range or a name under
 * host mode's domain, and only its ping is asked. Reached is CawCo's own
 * answer, which carries `PREVIEW_PING_HEADER`; anything else that answered
 * (a proxy, a CDN's own page) is said with its status.
 */
import { readWithin } from "@cawco/core/bounded";
import { type HubReach, PREVIEW_PING_HEADER } from "@cawco/core/preview/reach";
import { PREVIEW_PING_PATH } from "@cawco/core/preview/routes";
import { causeOf } from "@cawco/preview/proxy";
import { PREVIEW_PORTS } from "./config";
import type { HostPattern } from "./preview-hosts";

/** How long the ping has to answer. Our call: under the pane's own 10 s for the whole probe. */
const PING_MS = 5000;

export const reachOrigin = async (
  origin: string,
  hostPattern: HostPattern | undefined
): Promise<HubReach> => {
  let at: URL;
  try {
    at = new URL(origin);
  } catch {
    return { reached: false, why: "not an origin" };
  }
  const port = Number(at.port);
  const ours =
    (at.protocol === "http:" || at.protocol === "https:") &&
    ((port >= PREVIEW_PORTS.first && port <= PREVIEW_PORTS.last) ||
      (!!hostPattern &&
        (at.hostname === hostPattern.domain ||
          at.hostname.endsWith(`.${hostPattern.domain}`))));
  if (!ours) {
    return { reached: false, why: "not one of this hub's preview origins" };
  }
  try {
    const read = await readWithin(PING_MS, (signal) =>
      fetch(`${at.origin}${PREVIEW_PING_PATH}`, {
        cache: "no-store",
        redirect: "manual",
        signal,
      })
    );
    if (read.kind !== "answered") {
      return { reached: false, why: `no answer within ${PING_MS / 1000} s` };
    }
    const answer = read.value;
    await answer.body?.cancel();
    return answer.headers.get(PREVIEW_PING_HEADER) === "1"
      ? { reached: true }
      : {
          reached: false,
          why: `something other than CawCo answered it ${answer.status}`,
        };
  } catch (thrown) {
    return { reached: false, why: causeOf(thrown) };
  }
};
