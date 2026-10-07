import type { TranscriptPage } from "@cawco/core";
import type { ServerTail } from "#lib/cawco/client.svelte.js";
import { hubFailure } from "#lib/cawco/hub-read.js";
import { transcriptUrl } from "#lib/cawco/links.js";
import { isThreadTab } from "#lib/cawco/thread-tabs.js";
import { runIdOf } from "#lib/cawco/workflow-runs.js";
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
 *
 * A read the hub refused is carried to the pane rather than dropped: the pane
 * paints that failure — the machine offline, the session not found, the read
 * failed — until its own read of the transcript answers.
 */
export const load: PageServerLoad = async ({
  params,
  fetch,
  untrack,
  isDataRequest,
}): Promise<{ tail: ServerTail | null }> => {
  const viewId = untrack(() => params.id);
  // The board, a workflow run's tab or a thread's: none has a transcript
  // page to read (a thread's messages are read by its pane).
  if (!viewId || runIdOf(viewId) || isThreadTab(viewId) || isDataRequest) {
    return { tail: null };
  }
  const response = await fetch(transcriptUrl(viewId));
  if (!response.ok) {
    return {
      tail: {
        ok: false,
        viewId,
        // A 503 naming a machine is the hub saying that machine is not connected.
        machineId:
          response.status === 503
            ? response.headers.get("x-cawco-machine")
            : null,
        ...(await hubFailure(response)),
      },
    };
  }
  return {
    tail: {
      ok: true,
      viewId,
      page: (await response.json()) as TranscriptPage,
    },
  };
};
