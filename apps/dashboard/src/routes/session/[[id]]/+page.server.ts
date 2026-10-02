import type { TranscriptPage } from "@cawco/core";
import { transcriptUrl } from "$lib/cawco/links";
import { runIdOf } from "$lib/cawco/workflow-runs";
import type { PageServerLoad } from "./$types";

/**
 * The conversation's newest transcript page, as the hub built it, which the
 * pane renders into the server's HTML so a reload shows the conversation
 * before the bundle has hydrated. The store's own read of the same page then
 * takes over the same rows.
 *
 * Awaited for a DOCUMENT request and skipped for a data request: on a cold
 * load it is what puts real transcript rows in the server's HTML; on anything
 * the client asks for afterwards the store already holds the conversation,
 * and awaiting a second copy of it only delays the answer.
 */
export const load: PageServerLoad = async ({
  params,
  fetch,
  untrack,
  isDataRequest,
}) => {
  const viewId = untrack(() => params.id);
  // The board, or a workflow run's tab: neither has a transcript to read.
  if (!viewId || runIdOf(viewId) || isDataRequest) {
    return { tail: null };
  }
  try {
    const response = await fetch(transcriptUrl(viewId));
    if (!response.ok) {
      return { tail: null };
    }
    return {
      tail: { viewId, page: (await response.json()) as TranscriptPage },
    };
  } catch {
    // An unreachable hub has no page to paint; the store's read says why.
    return { tail: null };
  }
};
