/** Why a browser can't load a preview, in words. */

import type { PreviewUnreached } from "../preview/reach";
import { PREVIEW_PING_PATH } from "../preview/routes";

/**
 * What previews need to be reached from this browser, by the way it reaches
 * them, as one clause with no stop: a host-mode name, else the hub's ports
 * on this browser's host (and, `ports` mode, the switch to a pattern).
 */
export const previewsNeedWords = (
  route:
    | { byHost: true; host: string }
    | {
        byHost: false;
        hostname: string;
        ports: string | null;
        hostMode: boolean;
      }
): string => {
  if (route.byHost) {
    return `Previews need ${route.host} to reach the hub, or switch previews to ports`;
  }
  const ports = `Previews need ports ${route.ports ?? "of the hub's range"} reachable on ${route.hostname}`;
  return route.hostMode
    ? ports
    : `${ports}, or switch previews to a hostname pattern`;
};

/**
 * What failed, in sentences (DESIGN.md's error formula: what happened, why,
 * the fix), each cause its own; the caller says what happens next. `need`:
 * {@link previewsNeedWords}, said where the way previews are reached is the
 * fix.
 */
export const previewUnreachedWords = (
  host: string,
  failed: PreviewUnreached,
  need: string
): string => {
  switch (failed.cause) {
    case "offline":
      return `This browser is offline, so it can't reach ${host}. Connect this device to a network.`;
    case "unreadable":
      return `${host} answered without the Access-Control-Allow-Origin header the hub's own answer carries, so something in front of it, a proxy or a CDN rule, changed the answer. Let ${host}${PREVIEW_PING_PATH} through to the hub unchanged.`;
    case "down":
      return `${host} answered: ${failed.why}.`;
    case "status":
      return `${host} answered ${failed.status}, which isn't the hub's own answer, so something in front of it answered instead. ${need}.`;
    case "refused":
    case "failed":
    case "timeout":
      break;
  }
  let happened = `${host} didn't answer this browser.`;
  if (failed.cause === "refused") {
    happened = `This browser refused the request to ${host} at once, before any answer could come back.`;
  } else if (failed.cause === "timeout") {
    happened = `${host} didn't answer this browser within ${failed.seconds} s.`;
  }
  const { hub } = failed;
  if (hub?.reached) {
    return failed.cause === "refused"
      ? `${happened} The hub reaches ${host}, so a shield, a content blocker or an extension in this browser is blocking it. Allow ${host} in it.`
      : `${happened} The hub reaches ${host}, so something between this browser and it is blocking it: a shield, an extension, a VPN or a firewall. Allow ${host} there.`;
  }
  if (hub) {
    return `${happened} The hub can't reach it either (${hub.why}). ${need}.`;
  }
  return failed.cause === "refused"
    ? `${happened} A shield, a content blocker or an extension in this browser is most likely blocking it: the hub couldn't be asked whether it reaches ${host}. Allow ${host} in it.`
    : `${happened} The hub couldn't be asked whether it reaches ${host}. ${need}.`;
};
