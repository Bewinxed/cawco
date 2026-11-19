import { hostModeDomain, previewEnterUrl } from "@cawco/core/preview/routes";
import { previewWords } from "@cawco/core/words/preview";
import { hub } from "#lib/platform/hub.js";
import { hubAsk, hubRefusal } from "#lib/platform/hub-read.js";

/**
 * The browser's way into a preview origin (hub preview-access.ts). A frame
 * loads its preview's address at once, with whatever pass the browser holds
 * (it stands 30 days): nothing is asked of the hub before it. Only a frame
 * the origin turns away (`cawco:locked`: no pass yet, or one that ran out or
 * was revoked) asks the hub for a ticket, its one answer, and makes one
 * navigation: the entry, which sets the pass and sends it on to the place it
 * was loading ({@link entryTo}).
 */

/**
 * Whether `origin` is an origin's own port: the dashboard's own host (core
 * `previewRoute` puts a port on the host the dashboard was reached at),
 * where host mode's names stand on names of their own.
 */
const byPort = (origin: string): boolean =>
  new URL(origin).hostname === location.hostname;

/** Why a frame of `origin` was turned away twice, in the dashboard's words. */
export const turnedAwayWords = (origin: string): string =>
  byPort(origin)
    ? previewWords.portPassTurnedAway(new URL(origin).hostname)
    : previewWords.passTurnedAway(
        hostModeDomain(origin),
        location.protocol === "https:"
      );

/** A ticket from the hub, or why it gave none. */
async function ticket(): Promise<{ ticket: string } | { refused: string }> {
  const answer = await hubAsk(hub.api["preview-ticket"].post()).catch(
    () => null
  );
  if (answer?.ok) {
    return { ticket: answer.value.ticket };
  }
  return {
    refused: answer
      ? hubRefusal(answer.refused).message
      : "The hub didn't give this browser a pass to its previews.",
  };
}

/**
 * Where a frame `origin` turned away goes next, so it lands at `place` (a
 * path on that origin) with the browser's pass: the entry, which spends a
 * ticket the hub gives now and sends the frame on to `place`. One
 * navigation of the frame; or the hub's words for why it gave no ticket.
 */
export async function entryTo(
  origin: string,
  place: string
): Promise<{ url: string } | { refused: string }> {
  const given = await ticket();
  return "refused" in given
    ? given
    : { url: previewEnterUrl(origin, given.ticket, place) };
}

/**
 * Enters `origin`'s previews beside any frame: what holds no frame to send
 * through the entry (a page's own doc socket the lock refused since its
 * pass ran out) has the browser fetch the entry, whose answer is opaque to
 * this page and whose pass is the browser's to keep. Null once it landed,
 * else why not.
 */
export async function enterBeside(origin: string): Promise<string | null> {
  const given = await ticket();
  if ("refused" in given) {
    return given.refused;
  }
  return fetch(previewEnterUrl(origin, given.ticket), {
    mode: "no-cors",
    credentials: "include",
    cache: "no-store",
  }).then(
    () => null,
    () => `${new URL(origin).host} didn't answer the entry`
  );
}
