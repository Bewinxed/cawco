/**
 * A browser at an address that went stale, its origin's port moved on
 * (preview-ports.ts `reclaimOne`) to another origin or to none, sent on to
 * where it stands now, as every outside link goes:
 *
 * - a tab (`Sec-Fetch-Dest: document`) at a page's or a canvas's
 *   address on an origin that doesn't serve it: the person's pass to the
 *   artifact's own tab on the dashboard (`/artifact/<id>`), on the
 *   dashboard origin this browser reached the same host by; a session's
 *   pass that opens the artifact's origin (`artifact_browse`) to that
 *   origin where it stands now, the same path, its pass carried there
 *   (a port's pass is set on its host, a name's on the names' domain);
 * - an entry with a session's ticket on a port of none of its origins
 *   (an `artifact_browse` url loaded after the port moved): the ticket,
 *   unspent, to the entry where its first origin, the artifact's own,
 *   stands now.
 *
 * A frame's load is no tab's: a frame's origin is told to it again
 * (server.ts `letGo`), and no dashboard is framed.
 */
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import {
  PREVIEW_ENTER_PATH,
  previewEnterUrl,
} from "@cawco/core/preview/routes";
import { causeOf, previewFailed } from "@cawco/preview/proxy";
import { type PassLock, passOf, sessionTicketScope } from "./preview-access";
import { HOP } from "./preview-listeners";
import { CANVAS_PATH, PAGE_PATH } from "./preview-paths";
import type { AnyProblem } from "./refusal";

/** What the stale addresses need of the hub around them. */
export interface StaleAddressesEnv {
  /** Every origin that may frame a preview now: the dashboards a tab is sent to. */
  dashboards: () => string[];
  /** An artifact's kind; undefined when there is none. */
  kindOf: (artifactId: string) => ArtifactKind | undefined;
  /** The origin that serves an artifact, by its key; undefined when there is none. */
  originOf: (artifactId: string) => string | undefined;
  /** Whether origin `key` serves an artifact by its id. */
  servedOn: (artifactId: string, key: string) => boolean;
  /** Where origin `key` stands now as a browser that reached `at` reaches it, its listener opened when it has none; or why it opens none. */
  standsAt: (key: string, at: URL, lock: PassLock) => string | AnyProblem;
}

export function createStaleAddresses({
  dashboards,
  kindOf,
  originOf,
  servedOn,
  standsAt,
}: StaleAddressesEnv) {
  /** An entry with a session's ticket on a port of none of its origins, sent on to its first origin's entry. */
  const staleEntry = (url: URL, lock: PassLock, key: string | undefined) => {
    const ticket = url.searchParams.get("ticket") ?? "";
    const scope = sessionTicketScope(ticket);
    const [own] = scope ?? [];
    if (!own || (key !== undefined && scope?.includes(key))) {
      return null;
    }
    const next = url.searchParams.get("next");
    const stands = standsAt(own, url, lock);
    if (typeof stands !== "string") {
      return stands;
    }
    return Response.redirect(
      previewEnterUrl(stands, ticket, next === null ? undefined : next),
      302
    );
  };

  /** `url`'s path and query where origin `key` stands now, or its problem. */
  const redirectTo = (key: string, url: URL, lock: PassLock) => {
    const stands = standsAt(key, url, lock);
    return typeof stands === "string"
      ? Response.redirect(`${stands}${url.pathname}${url.search}`, 302)
      : stands;
  };

  /** A tab at a page's or a canvas's address on an origin that doesn't serve it, sent on by its pass. */
  const staleTab = (
    request: Request,
    url: URL,
    lock: PassLock,
    key: string | undefined
  ) => {
    const paged = url.pathname.match(PAGE_PATH);
    const drawn = paged ? null : url.pathname.match(CANVAS_PATH);
    const artifactId = (paged ?? drawn)?.[1];
    if (
      !artifactId ||
      kindOf(artifactId) !== (paged ? "page" : "canvas") ||
      (key !== undefined && servedOn(artifactId, key))
    ) {
      return null;
    }
    if (passOf(request, lock, undefined)) {
      const parents = dashboards();
      const dashboard =
        parents.find((one) => new URL(one).hostname === url.hostname) ??
        parents[0];
      return dashboard
        ? Response.redirect(
            `${dashboard}/artifact/${encodeURIComponent(artifactId)}`,
            302
          )
        : null;
    }
    const origin = originOf(artifactId);
    return origin && passOf(request, lock, origin)
      ? redirectTo(origin, url, lock)
      : null;
  };

  /** Where {@link movedOn} sends a stale address, or its origin's problem; null, said, when that throws. */
  const staleSent = (
    request: Request,
    lock: PassLock,
    key: string | undefined
  ): Response | null | AnyProblem => {
    const url = new URL(request.url);
    try {
      if (url.pathname === PREVIEW_ENTER_PATH) {
        return staleEntry(url, lock, key);
      }
      return request.headers.get("sec-fetch-dest") === "document"
        ? staleTab(request, url, lock, key)
        : null;
    } catch (thrown) {
      previewFailed(
        HOP,
        key ?? null,
        `a stale address stays: ${causeOf(thrown)}`
      );
      return null;
    }
  };

  return {
    /** Where a request's stale address is sent on to; null for anything else, which the lock and the origin answer as before. */
    movedOn: (
      request: Request,
      lock: PassLock,
      key: string | undefined
    ): Response | null => {
      const sent = staleSent(request, lock, key);
      if (sent === null || sent instanceof Response) {
        return sent;
      }
      // Its origin can't open now (its owner gone, every port in use): the
      // lock and this origin answer it as before.
      previewFailed(
        HOP,
        key ?? null,
        `a stale address stays: ${sent.response.detail}`
      );
      return null;
    },
  };
}
