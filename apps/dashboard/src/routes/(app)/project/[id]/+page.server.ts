import { error } from "@sveltejs/kit";
import {
  isRefusal,
  readProjectPage,
  refusalSentence,
} from "#lib/cawco/project/project-page-data.js";
import type { PageServerLoad } from "./$types";

/**
 * A project's tab, as the server paints it on a cold load or a shared link:
 * read whole (project-page-data.ts), so the server's HTML holds its board.
 * Awaited for a DOCUMENT request alone, as a conversation's first screen is
 * (`/session`'s load): on a navigation the browser makes, the workspace
 * already holds the tab and the tab reads itself. A refused read of the
 * projects or the machines is the page's error.
 */
export const load: PageServerLoad = async ({
  fetch,
  params,
  url,
  isDataRequest,
  untrack,
}) => {
  if (isDataRequest) {
    return { seed: null };
  }
  const id = untrack(() => params.id);
  const read = await readProjectPage(
    fetch,
    id,
    untrack(() => url.searchParams)
  );
  if (isRefusal(read)) {
    return error(
      read.failure.status,
      `${refusalSentence(read)} Reload the page to try again.`
    );
  }
  return { seed: { id, ...read } };
};
