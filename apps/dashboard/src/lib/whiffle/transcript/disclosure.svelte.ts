import { SvelteSet } from "svelte/reactivity";
import type { Message } from "../types";

/**
 * What the reader has opened in each session's transcript: a tool call's
 * body, a subagent's branch, a delegate's card — each by the id of the call
 * that made it (a branch and a card replace their spawning call's row, so
 * the ids never collide).
 *
 * Those rows are virtualised: taken down when they scroll away and built
 * again when they come back, and a pane that is left for another route is
 * built again whole. An open state kept in the row itself was closed by
 * every one of those. Kept here, the reader's disclosure outlives the
 * component that drew it — and a body that mounts already open does not
 * animate (`collapsible-content`), so coming back to it moves nothing.
 */
const sessions = new Map<string, SvelteSet<string>>();

function openIn(session: string): SvelteSet<string> {
  let open = sessions.get(session);
  if (!open) {
    open = new SvelteSet<string>();
    sessions.set(session, open);
  }
  return open;
}

/**
 * The open state of the disclosure a call made, as a getter/setter pair for
 * `bind:open={...}`.
 */
export function disclosure(call: Message) {
  return disclosureAt(call.instanceId, String(call.toolCallId ?? call.id));
}

/** The same, for a row that no single call made: a harness note, by its row key. */
export function disclosureAt(session: string, id: string) {
  const open = openIn(session);
  return {
    get: (): boolean => open.has(id),
    set: (next: boolean): void => {
      if (next) {
        open.add(id);
      } else {
        open.delete(id);
      }
    },
  };
}
