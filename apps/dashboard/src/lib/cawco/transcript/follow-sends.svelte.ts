/**
 * A conversation pane's draft following the fleet store's sends. Its own
 * module, apart from `composer-draft.svelte.ts`: a comment's reply composer
 * holds a draft and no fleet, and loads `composer-draft` alone.
 */

import { untrack } from "svelte";
import {
  clearRestore,
  latestCommandFor,
  pendingRestore,
} from "../client.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";

/**
 * A pane's draft following its conversation's sends, set up with the pane:
 * once the hub takes a send, the message it carried needs no keeping; "Edit"
 * on a message that never sent puts its words back (the restore slot,
 * client.svelte.ts: the row offering Edit is two components away from the
 * draft, so the store is the channel and this is its far end). `sending`:
 * whether the conversation's last message is out of this tab but not yet
 * taken.
 */
export function followSends(
  draft: ComposerDraft,
  viewId: () => string
): { readonly sending: boolean } {
  $effect(() => {
    const stage = latestCommandFor(viewId(), "send")?.stage;
    if (stage === "accepted" || stage === "applied") {
      untrack(() => draft.settle());
    }
  });
  $effect(() => {
    const id = viewId();
    const slot = pendingRestore(id);
    if (!slot) {
      return;
    }
    untrack(() => {
      draft.restore(slot.text, slot.extras);
      clearRestore(id);
    });
  });
  const sending = $derived.by(() => {
    const send = latestCommandFor(viewId(), "send");
    return send?.stage === "submitted" && !send.waiting;
  });
  return {
    get sending() {
      return sending;
    },
  };
}
