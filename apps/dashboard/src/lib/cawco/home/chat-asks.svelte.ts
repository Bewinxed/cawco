/**
 * A conversation's row in Caw's panel opens that conversation with its
 * newest waiting ask up on its composer (tsk-521): the composer of a
 * conversation holds its own asks and picks and those of every delegate
 * under it, and nothing from any other conversation.
 *
 * The press names the conversation and the ask; the conversation's pane
 * takes the ask once it is on screen (SessionPane), so a pane already
 * showing it brings it up in place, and any other press opens it first.
 */

import { detach } from "@cawco/core/detach";
import { SvelteMap } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { rowHref } from "../links";
import type { NeedsAnswers } from "./needs-answer.svelte";

class ChatAsks {
  /** Each conversation on screen, by its session, and how many panes show it. */
  readonly #panes = new SvelteMap<string, number>();
  /** A row pressed: the conversation it opens and the key of the ask to bring up there, until its pane takes it. */
  pending = $state<{ key: string; view: string } | null>(null);

  /** A pane showing `view` came on screen. */
  shown(view: string): void {
    this.#panes.set(view, (this.#panes.get(view) ?? 0) + 1);
  }

  /** A pane showing `view` left the screen. */
  hidden(view: string): void {
    const left = (this.#panes.get(view) ?? 1) - 1;
    if (left > 0) {
      this.#panes.set(view, left);
    } else {
      this.#panes.delete(view);
    }
  }

  /** Conversation `view` opens with the ask `key` (a Needs you item's) up on its composer. */
  bring(view: string, key: string): void {
    this.pending = { view, key };
    if (!this.#panes.has(view)) {
      detach(goto(rowHref(view)), "open the conversation");
    }
  }

  /** The ask pressed for `view` to bring up; null when none waits for it. Taken once. */
  take(view: string): string | null {
    if (this.pending?.view !== view) {
      return null;
    }
    const { key } = this.pending;
    this.pending = null;
    return key;
  }
}

export const chatAsks = new ChatAsks();

/** Caw's panel's answers in the product: a conversation's row opens it with its newest ask up. */
export const liveAnswers: NeedsAnswers = {
  press: (conversation) => {
    const [newest] = conversation.items;
    if (newest) {
      chatAsks.bring(conversation.instanceId, newest.key);
    }
  },
};
