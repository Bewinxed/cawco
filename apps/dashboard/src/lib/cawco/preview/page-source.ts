/**
 * Where a page is loaded from by its id, whichever artifact a panel shows:
 * `/__cawco/page/<id>/` on the origin that serves it (hub preview.ts
 * `originOf`): a project's page on its project's origin, for the project's
 * life and whether or not the session that wrote it stands; any other page
 * on its session's. The Decisions tab's live page (PageFrame) and Files'
 * unseen thumbnail drawer (files/page-thumbs) both load a page this way,
 * at its own address on either route, once the browser entered its previews
 * (preview/pass.ts): every preview origin turns a browser without a pass
 * away.
 */

import {
  PREVIEW_PING_PATH,
  type PreviewAddress,
  previewRoute,
} from "@cawco/core/preview/routes";
import { decisionsWords } from "@cawco/core/words/decisions";
import { previewWords } from "@cawco/core/words/preview";
import { hub } from "#lib/platform/hub.js";
import { type HubAsked, hubAsk, hubRefusal } from "#lib/platform/hub-read.js";
import { enterPreviews } from "./pass";

/** The origin that serves a page: its project's, or (a page outside any project) its session's. */
export type PageOrigin = { project: string } | { instance: string };

/**
 * Where `origin`'s pages are served and the page at `wanted` there, with
 * the browser's pass to it: its origin (the only one its frame's messages
 * are heard from), whether it is entered by host name, and its address; or
 * why it can't be.
 */
export async function pageSource(
  origin: PageOrigin,
  wanted: string
): Promise<
  { origin: string; byHost: boolean; src: string } | { problem: string }
> {
  const asked = await originAddress(origin);
  if ("problem" in asked) {
    return asked;
  }
  const route = previewRoute(asked.address, location);
  if (!route) {
    return { problem: decisionsWords.noAddress };
  }
  const reached = await fetch(`${route.origin}${PREVIEW_PING_PATH}`, {
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  })
    .then((ping) => ping.ok)
    .catch(() => false);
  if (!reached) {
    return { problem: decisionsWords.unreached(new URL(route.origin).host) };
  }
  const refused = await enterPreviews(route.origin);
  if (refused) {
    return { problem: refused };
  }
  return {
    origin: route.origin,
    byHost: route.byHost,
    src: `${route.origin}${wanted}`,
  };
}

/**
 * Where the hub serves what `route` names (a `preview-address` route), its
 * listener started when it has none; or why it can't, in the hub's own
 * words: every preview port in use is said as the hub says it (hub
 * preview-ports.ts `preview-ports-taken`), wherever a frame of it stands.
 */
async function addressAt(
  call: Promise<HubAsked<PreviewAddress>>
): Promise<{ address: PreviewAddress } | { problem: string }> {
  const asked = await call.catch(() => null);
  if (!asked) {
    return { problem: previewWords.notOpenedLine };
  }
  return asked.ok
    ? { address: asked.value }
    : { problem: hubRefusal(asked.refused).message };
}

/** Where `origin` (a project's, a session's) is served now, its listener started when it has none; or the hub's refusal. */
export const originAddress = (
  origin: PageOrigin
): Promise<{ address: PreviewAddress } | { problem: string }> =>
  "project" in origin
    ? addressAt(
        hubAsk(
          hub.api.projects({ id: origin.project })["preview-address"].post()
        )
      )
    : addressAt(
        hubAsk(
          hub.api.instances({ id: origin.instance })["preview-address"].post()
        )
      );

/**
 * Where artifact `id` is served now (hub preview-routes.ts
 * `/api/artifacts/:artifact/preview-address`), its origin opened when it
 * has none; or the hub's refusal. A pane whose frame names no origin asks
 * it (PreviewPane): the panel, an artifact's tab, a task's review.
 */
export const artifactAddress = (
  id: string
): Promise<{ address: PreviewAddress } | { problem: string }> =>
  addressAt(
    hubAsk(hub.api.artifacts({ artifact: id })["preview-address"].post())
  );
