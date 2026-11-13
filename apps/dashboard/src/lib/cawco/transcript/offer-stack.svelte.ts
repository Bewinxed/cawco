/**
 * The offers standing on the tray row: one conversation's row above the
 * composer, the offer standing on it and its delegate tray. A composer keeps
 * the row of every conversation it can be handed (`trayRows`) and draws the
 * one it writes to (`showing`): handed the next, it shows that one's,
 * already built and laid out, where building it in the switch put its offer,
 * its tray and their chips into the page inside the click.
 */
import { type Snippet, untrack } from "svelte";
import { frameSize } from "#lib/platform/frame-observer.js";
import { handOver } from "#lib/platform/motion/rows.svelte.js";

export interface TrayRow {
  /** The session whose delegates its tray shows; empty for none. */
  delegatesOf: string;
  /** The conversation's id: what `showing` names. */
  id: string;
  /** What stands on the tray row: an offer, never an ask. */
  prompts?: Snippet;
}

export interface OfferStackParts {
  /** Which of `trayRows` is drawn: the conversation being written to. */
  showing: () => string;
  trayRows: () => TrayRow[];
}

export class OfferStack {
  readonly #parts: OfferStackParts;
  /**
   * Each conversation's offer as it is laid out, by id, kept as it stands
   * whether shown or not: handed the next conversation, the stack is the
   * height its offer already has, and no offer moves in or out of the
   * column to say so.
   */
  readonly offerHeights: Record<string, number> = $state({});
  readonly stack = $derived.by(
    () => this.offerHeights[this.#parts.showing()] ?? 0
  );
  /** The rows with an offer to stand on the tray row, and those with a tray. */
  readonly offered = $derived.by(() =>
    this.#parts.trayRows().filter((row) => row.prompts)
  );
  readonly trayed = $derived.by(() =>
    this.#parts.trayRows().filter((row) => row.delegatesOf)
  );
  /** The box the offers stand in: a `reflow` container. */
  offers = $state<HTMLElement>();

  constructor(parts: OfferStackParts) {
    this.#parts = parts;
    /*
     * Handed another conversation, the offer drawn changes between two built
     * already: nothing arrived or left, so nothing to animate, and nothing for
     * the offers' reflow to read inside the switch (`handOver`). Before the
     * update writes it, so the change it hears is already its own.
     */
    $effect.pre(() => {
      const box = this.offers;
      if (box && parts.showing()) {
        untrack(() => handOver(box));
      }
    });
  }

  measureOffer = (id: string) =>
    frameSize(
      (node: HTMLElement) => node.clientHeight,
      (value) => {
        this.offerHeights[id] = value;
      }
    );
}
