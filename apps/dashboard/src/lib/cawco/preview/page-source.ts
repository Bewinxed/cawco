/**
 * Where a page is loaded from by its id, whichever artifact a panel shows:
 * `/__cawco/page/<id>/` on the origin that serves it (hub preview.ts
 * `originOf`): a project's page on its project's origin, for the project's
 * life and whether or not the session that wrote it stands; any other page
 * on its session's. The Decisions tab's live page (PageFrame) and Files'
 * unseen thumbnail drawer (files/page-thumbs) both load a page this way.
 */
import {
  decisionsWords,
  PREVIEW_PING_PATH,
  type PreviewAddress,
  type PreviewTicket,
  previewEnterUrl,
  previewRoute,
} from "@cawco/core";
import { hubRefusal } from "#lib/cawco/hub-read.js";

/** The origin that serves a page: its project's, or (a page outside any project) its session's. */
export type PageOrigin = { project: string } | { instance: string };

/** The hub's routes for that origin's address and tickets. */
const routesOf = (origin: PageOrigin): string =>
  "project" in origin
    ? `/api/projects/${encodeURIComponent(origin.project)}`
    : `/api/instances/${encodeURIComponent(origin.instance)}`;

/** The hub's sentence for a refused request, or the fallback words. */
const said = async (answer: Response | null, otherwise: string) =>
  answer ? (await hubRefusal(answer)).message : otherwise;

/**
 * Its address: straight on a port, or entered with a new pass by host
 * name (hub preview-access.ts). A lapsed pass enters again the same way.
 */
export async function enterPage(
  origin: PageOrigin,
  at: string,
  byHost: boolean,
  wanted: string
): Promise<{ src: string } | { problem: string }> {
  if (!byHost) {
    return { src: `${at}${wanted}` };
  }
  const answer = await fetch(`${routesOf(origin)}/preview-ticket`, {
    method: "POST",
  }).catch(() => null);
  if (!answer?.ok) {
    return {
      problem: await said(answer, "The hub didn't give this page a pass."),
    };
  }
  const { ticket } = (await answer.json()) as PreviewTicket;
  return { src: previewEnterUrl(at, ticket, wanted) };
}

/**
 * Where `origin`'s pages are served and the page at `wanted` there:
 * its origin (the only one its frame's messages are heard from), whether
 * it is entered by host name, and its address; or why it can't be.
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
  const entered = await enterPage(origin, route.origin, route.byHost, wanted);
  return "src" in entered
    ? { origin: route.origin, byHost: route.byHost, src: entered.src }
    : entered;
}
