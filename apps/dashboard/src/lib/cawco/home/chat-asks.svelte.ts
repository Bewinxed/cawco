/**
 * What waits on him is answered in the conversation he is in (tsk-521, his
 * pick "Folded on the bar"): every ask from another session waits folded on
 * that conversation's composer, and Caw's panel is the short list of what
 * waits. A press on a row brings its ask up there; in no conversation, it
 * opens the one he last wrote in and brings it up there.
 *
 * "His conversation" is the session pane he is on that he touched last
 * (SessionPane `here`): each pane on screen claims itself as it comes on
 * and as he presses or types in it, and lets go as it leaves.
 */

import { detach } from "@cawco/core/detach";
import { SvelteMap } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { rowHref } from "../links";
import { boardStore } from "../stores/board.svelte";
import type { NeedsAnswers } from "./needs-answer.svelte";

/** When `at` was, ms epoch; 0 for never. */
const epoch = (at: string | number | Date | null | undefined): number =>
  at === null || at === undefined ? 0 : new Date(at).getTime() || 0;

class ChatAsks {
  /** Each pane on screen, by the session it shows, and when he last touched it. */
  readonly #panes = new SvelteMap<string, number>();
  #tick = 0;
  /** A row pressed in the panel, by its key, waiting for his conversation to bring it up. */
  pending = $state<string | null>(null);

  /** His conversation: the pane on screen he touched last; null on a page with none. */
  get here(): string | null {
    let best: string | null = null;
    let at = -1;
    for (const [view, touched] of this.#panes) {
      if (touched > at) {
        best = view;
        at = touched;
      }
    }
    return best;
  }

  /** Pane `view` is on screen, or he pressed or typed in it: it is his conversation now. */
  claim(view: string): void {
    this.#tick += 1;
    this.#panes.set(view, this.#tick);
  }

  /** Pane `view` left the screen. */
  release(view: string): void {
    this.#panes.delete(view);
  }

  /** The row `key` pressed: its ask comes up in his conversation, the one he last wrote in when he is in none. */
  bring(key: string): void {
    this.pending = key;
    if (this.here !== null) {
      return;
    }
    const [last] = boardStore.instances
      .filter((row) => epoch(row.wroteAt) > 0)
      .sort((a, b) => epoch(b.wroteAt) - epoch(a.wroteAt));
    if (last) {
      detach(goto(rowHref(last.id)), "open his last conversation");
    }
  }

  /** The row pressed, for pane `view` to bring up when it is his conversation; null otherwise. Taken once. */
  take(view: string): string | null {
    if (this.here !== view || this.pending === null) {
      return null;
    }
    const key = this.pending;
    this.pending = null;
    return key;
  }
}

export const chatAsks = new ChatAsks();

/** Caw's panel's answers in the product: a row's press brings its ask up in his conversation. */
export const liveAnswers: NeedsAnswers = {
  press: (key) => chatAsks.bring(key),
};
