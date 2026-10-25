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
  decisionsWords,
  PREVIEW_PING_PATH,
  type PreviewAddress,
  previewRoute,
} from "@cawco/core";
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { enterPreviews } from "./pass";

/** The origin that serves a page: its project's, or (a page outside any project) its session's. */
export type PageOrigin = { project: string } | { instance: string };

/** The hub's routes for that origin's address. */
const routesOf = (origin: PageOrigin): string =>
  "project" in origin
    ? `/api/projects/${encodeURIComponent(origin.project)}`
    : `/api/instances/${encodeURIComponent(origin.instance)}`;

/** The hub's sentence for a refused request, or the fallback words. */
const said = async (answer: Response | null, otherwise: string) =>
  answer ? (await hubRefusal(answer)).message : otherwise;

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
  const answer = await fetch(`${routesOf(origin)}/preview-address`, {
    method: "POST",
  }).catch(() => null);
  if (!answer?.ok) {
    return {
      problem: await said(
        answer,
        "The hub didn't say where this page is served."
      ),
    };
  }
  const route = previewRoute((await answer.json()) as PreviewAddress, location);
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
