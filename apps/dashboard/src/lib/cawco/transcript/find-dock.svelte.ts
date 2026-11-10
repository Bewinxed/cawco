/**
 * The conversation's find on the composer's pill: while it stands open, its
 * field is on the pill's top and its places over it; closed, the caret goes
 * back to the message.
 */
import { untrack } from "svelte";
import type { ConversationFind } from "../find/conversation-find.svelte";

export interface FindDockParts {
  field: () => HTMLDivElement | null;
  /** The conversation's find; none where the composer writes to no conversation. */
  find: () => ConversationFind | undefined;
}

export class FindDock {
  readonly #parts: FindDockParts;
  /** Find stands open on this composer's conversation: its field is on the pill's top. */
  readonly finding = $derived.by(() => !!this.#parts.find()?.open);
  /** The find line's drawn height on the pill, and the places' over it: what the transcript's foot grows by while find stands. */
  findLineH = $state(0);
  findLayerH = $state(0);

  constructor(parts: FindDockParts) {
    this.#parts = parts;
    // Find closed: the caret goes back to the message, as it was left.
    let messageAsked = untrack(() => parts.find()?.messageAsked ?? 0);
    $effect(() => {
      const asked = parts.find()?.messageAsked ?? 0;
      if (asked !== messageAsked) {
        messageAsked = asked;
        untrack(() => parts.field()?.focus());
      }
    });
  }
}
