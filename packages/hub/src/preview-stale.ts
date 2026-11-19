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
 *   (a port's pass is set on its host, a name's on the names' domain).
 *   The preview server sends these ({@link createStaleTabs}).
 * - an entry with a session's ticket on a port of none of its origins
 *   (an `artifact_browse` url loaded after the port moved): the ticket,
 *   unspent, to the entry where its first origin, the artifact's own,
 *   stands now. The hub sends these, as it answers every entry
 *   ({@link staleEntry}).
 *
 * A frame's load is no tab's: a frame's origin is told to it again
 * (server.ts `letGo`), and no dashboard is framed.
 */
import type { ArtifactKind } from "@cawco/core/artifact-kinds";
import { previewEnterUrl } from "@cawco/core/preview/routes";
import { causeOf, previewFailed } from "@cawco/preview/proxy";
import { type PassCheck, passOf, sessionTicketScope } from "./preview-access";
import { HOP } from "./preview-origin";
import { CANVAS_PATH, PAGE_PATH } from "./preview-paths";

/** Where origin `key` stands now as a browser that reached `at` reaches it, its port opened when it has none; or why it opens none. */
type StandsAt = (
  key: string,
  at: URL
) => Promise<{ origin: string } | { refused: string }>;

/**
 * An entry with a session's ticket on a port of none of its origins, sent
 * on to its first origin's entry; null for any other entry, which the lock
 * answers.
 */
export const staleEntry = async (
  url: URL,
  key: string | undefined,
  standsAt: StandsAt
): Promise<Response | null> => {
  const ticket = url.searchParams.get("ticket") ?? "";
  const scope = sessionTicketScope(ticket);
  const [own] = scope ?? [];
  if (!own || (key !== undefined && scope?.includes(key))) {
    return null;
  }
  const next = url.searchParams.get("next");
  const stands = await standsAt(own, url);
  if ("refused" in stands) {
    previewFailed(HOP, key ?? null, `a stale address stays: ${stands.refused}`);
    return null;
  }
  return Response.redirect(
    previewEnterUrl(stands.origin, ticket, next === null ? undefined : next),
    302
  );
};

/** What the stale tabs need of the server around them. */
export interface StaleTabsEnv {
  /** Every origin that may frame a preview now: the dashboards a tab is sent to. */
  dashboards: () => string[];
  /** An artifact's kind; undefined when there is none. */
  kindOf: (artifactId: string) => ArtifactKind | undefined;
  /** The origin that serves an artifact, by its key; undefined when there is none. */
  originOf: (artifactId: string) => string | undefined;
  /** Whether origin `key` serves an artifact by its id. */
  servedOn: (artifactId: string, key: string) => boolean;
  standsAt: StandsAt;
}

export function createStaleTabs({
  dashboards,
  kindOf,
  originOf,
  servedOn,
  standsAt,
}: StaleTabsEnv) {
  /** The page or canvas `url` names when origin `key` doesn't serve it: a stale address; undefined for any other. */
  const staleArtifact = (
    url: URL,
    key: string | undefined
  ): string | undefined => {
    const paged = url.pathname.match(PAGE_PATH);
    const drawn = paged ? null : url.pathname.match(CANVAS_PATH);
    const artifactId = (paged ?? drawn)?.[1];
    return artifactId &&
      kindOf(artifactId) === (paged ? "page" : "canvas") &&
      !(key !== undefined && servedOn(artifactId, key))
      ? artifactId
      : undefined;
  };

  /** A tab at a page's or a canvas's address on an origin that doesn't serve it, sent on by its pass. */
  const staleTab = async (
    request: Request,
    url: URL,
    lock: PassCheck,
    key: string | undefined
  ): Promise<Response | null> => {
    const artifactId = staleArtifact(url, key);
    if (!artifactId) {
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
    if (!(origin && passOf(request, lock, origin))) {
      return null;
    }
    const stands = await standsAt(origin, url);
    if ("refused" in stands) {
      // Its origin can't open now (its owner gone, every port in use): the
      // lock and this origin answer it as before.
      previewFailed(
        HOP,
        key ?? null,
        `a stale address stays: ${stands.refused}`
      );
      return null;
    }
    return Response.redirect(
      `${stands.origin}${url.pathname}${url.search}`,
      302
    );
  };

  return {
    /** Where a tab's stale address is sent on to; null for anything else, which the lock and the origin answer as before. */
    movedOn: async (
      request: Request,
      lock: PassCheck,
      key: string | undefined
    ): Promise<Response | null> => {
      if (request.headers.get("sec-fetch-dest") !== "document") {
        return null;
      }
      try {
        return await staleTab(request, new URL(request.url), lock, key);
      } catch (thrown) {
        previewFailed(
          HOP,
          key ?? null,
          `a stale address stays: ${causeOf(thrown)}`
        );
        return null;
      }
    },
  };
}
