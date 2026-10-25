import type { TranscriptPage } from "@cawco/core";
import type { ServerTail } from "#lib/cawco/client.svelte.js";
import { hubFailure, machineAway } from "#lib/cawco/hub-read.js";
import { transcriptUrl } from "#lib/cawco/links.js";
import { isThreadTab } from "#lib/cawco/thread-tabs.js";
import { FIRST_SCREEN_PAGE } from "#lib/config.js";
import type { PageServerLoad } from "./$types";

/** Whether the hub holds an ask parked under `viewId` (`/api/pending`). */
const askHeldFor = async (
  fetch: typeof globalThis.fetch,
  viewId: string
): Promise<boolean> => {
  const response = await fetch("/api/pending");
  if (!response.ok) {
    return false;
  }
  const pending = (await response.json()) as { instanceId?: string }[];
  return pending.some((envelope) => envelope.instanceId === viewId);
};

/**
 * The conversation's newest transcript page, a first screen of it
 * (`FIRST_SCREEN_PAGE`), as the hub built it. The pane paints it into the
 * server's HTML, at the transcript's tail, so a cold load shows the newest
 * rows before the bundle has run; the store takes it as its newest read
 * (`keepServedPage`), its stream resumed from the page's `seq`, and reads
 * the older pages as the reader nears the first rows. The page is the HTML's
 * one copy of the transcript: nothing reads it again.
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
  // The board or a thread's tab: neither has a transcript page to read (a
  // thread's messages are read by its pane).
  if (!viewId || isThreadTab(viewId) || isDataRequest) {
    return { tail: null };
  }
  const response = await fetch(
    transcriptUrl(viewId, { limit: FIRST_SCREEN_PAGE })
  );
  // No transcript, but an ask the hub holds under this id (a memory
  // proposal): the pane is that ask's card, which the socket brings; nothing
  // is painted for it here, least of all "no such session".
  if (response.status === 404 && (await askHeldFor(fetch, viewId))) {
    return { tail: null };
  }
  if (!response.ok) {
    // A 503 naming a machine is the hub saying that machine is not connected.
    const { away, reconnectingMs } = machineAway(response);
    return {
      tail: {
        ok: false,
        viewId,
        machineId: away,
        reconnectingMs,
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
