/**
 * What a conversation is called, the one way — the tab, the group header
 * and the pane's bar all read this, so none of them names a different
 * session than the others, and none of them flashes through the id, the
 * folder and a mid-transcript message on the way to the real title.
 */
import { cawco } from "./client.svelte";
import type { HubRead } from "./hub-read";
import { resolveSessionTitle } from "./links";
import { workingSet } from "./working-set.svelte";
import { contextOf } from "./workspace/workspace.svelte";

export interface SessionName {
  label: string;
  /** Whether the fleet or the transcript has named it, rather than a stand-in. */
  named: boolean;
}

/**
 * `served` is what the layout server resolved for every open tab before the
 * first paint, so the very first render already carries the right name and a
 * reload morphs nothing. The transcript names a session only once it is fully
 * read: the fetch streams newest-first, so the first user message a half-read
 * transcript holds is one from the middle of the conversation. And the
 * transcript's name is only taken once the fleet has answered: the hub's own
 * title arrives with the socket snapshot, later than a short transcript
 * settles, and a name derived in that window is exactly the flash the served
 * name exists to prevent.
 */
export function sessionName(
  id: string,
  served: Record<string, HubRead<string>>,
  cwdFallback?: string
): SessionName {
  const row = cawco.instanceIndex.byId.get(id);
  const view = cawco.session(id);
  const ctx = contextOf(id);
  const title = row?.title;
  const settled =
    !!view && !view.loading && !view.hydrating && view.messages.length > 0;
  const firstMessage = settled
    ? view.messages.find((m) => m.type === "user" && m.content.trim())?.content
    : undefined;
  const named = !!title?.trim() || !!firstMessage?.trim();
  const answered = !!row && (!!title?.trim() || settled);
  const resolved = resolveSessionTitle({
    title,
    firstMessage,
    cwd: view?.cwd || row?.cwd || ctx?.cwd || cwdFallback,
    id,
  });
  return {
    // A conversation this browser has named before keeps that name, and the
    // server's answer comes after it — the name it resolved, or that the hub
    // refused the read — until the fleet and the transcript have both
    // answered; falling back to the folder for that moment is the flash the
    // remembered title removes.
    label: answered
      ? resolved
      : (workingSet.titleOf(id) ?? servedLabel(served[id]) ?? resolved),
    named,
  };
}

/** What the server's answer for a tab says: its name, or that the read failed. */
function servedLabel(read: HubRead<string> | undefined): string | undefined {
  if (!read) {
    return;
  }
  return read.ok ? read.value : `Name unreadable (${read.status})`;
}
