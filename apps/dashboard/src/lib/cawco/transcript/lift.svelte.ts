/**
 * A queued message lifted out of the transcript into the composer, to be
 * edited before the session reads it, and given back.
 *
 * Its words travel. Both ends are measured once, and two copies of the
 * words, one set as the bubble sets them and one as the field does, fly
 * from one box to the other and crossfade (FLIP, transform and opacity
 * only, so the compositor moves them and nothing on the page is laid out
 * again), over --dur-lift on the drawer curve. Each copy shows only what its
 * end shows: the bubble as far as the transcript lets it be seen, the field
 * as far as it is scrolled. Meanwhile the bubble folds to its tag
 * (`liftedIds`) and the composer grows the row that says what is happening.
 *
 * A replace sends the edited words in the message's place (`replaceQueued`)
 * and the words go back into the bubble at once; how it went comes later
 * (`watchReplace`). Taken back in time, the queued send gives way to its
 * replacement, which the words fly into as it lands. Read by the session
 * first, or refused, the message stays as it was and the edit comes back
 * into the field, kept to send as a new message, with why.
 */
import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { cawco, commandRecord } from "../client.svelte";
import { CURVE, dur, motionOk } from "../motion/curves.svelte";
import { departBox } from "../motion/share.svelte";
import type { Message } from "../types";
import type { ComposerDraft } from "./composer-draft.svelte";

/**
 * The bubbles whose words are on their way back: unfolded, and their words
 * hidden until the flight lands in them, so the screen never shows two.
 */
export const landing = new SvelteSet<string>();

/**
 * Words a replace sent for a queued message, shown in its bubble from the
 * moment they fly back until the hub has answered.
 */
export const replacing = new SvelteMap<string, string>();

/**
 * A row asking for its queued message to be lifted (its Edit, or a tap on
 * a touch screen). The composer writing to that conversation takes it.
 */
export const liftAsk = $state<{ message: Message | null }>({ message: null });

export function askLift(message: Message): void {
  liftAsk.message = message;
}

/**
 * The conversations a composer is writing to right now, counted: only there
 * can a queued message be lifted (a peek or a preview of a conversation has
 * no composer to lift it into).
 */
const writing = new SvelteMap<string, number>();

/** A composer writes to `instanceId` until the returned function is called. */
export function writesTo(instanceId: string): () => void {
  // Counted without being read by whoever registers: the count is the
  // registry's own business, never a dependency of the effect calling this.
  untrack(() => writing.set(instanceId, (writing.get(instanceId) ?? 0) + 1));
  return () =>
    untrack(() => {
      const left = (writing.get(instanceId) ?? 1) - 1;
      if (left > 0) {
        writing.set(instanceId, left);
      } else {
        writing.delete(instanceId);
      }
    });
}

/** Whether a composer is writing to `instanceId`, to lift its queued message into. */
export const liftsInto = (instanceId: string): boolean =>
  writing.has(instanceId);

/** How far through a flight the leaving copy has faded out, and the arriving one in. */
export const LEFT_BY = 0.55;
const IN_BY = 0.45;

/** One end of a flight: a box on the screen and how far its words are scrolled in it. */
export interface WordsBox {
  height: number;
  left: number;
  /** How far the words stand above the box's top: scrolled, or cut by a scroller. */
  scroll: number;
  top: number;
  width: number;
}

/** The words of a queued message's bubble on screen, if it is drawn. */
export function bubbleWords(id: string): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>(
    `[data-message="${CSS.escape(id)}"] [data-lift-words]`
  )) {
    if (node.getClientRects().length > 0) {
      return node;
    }
  }
  return null;
}

/**
 * Where a bubble's words are seen: their box, cut to the transcript that
 * scrolls them. `rise` lifts it by how far the bubble will grow upward as
 * it opens on a transcript held at its foot. Null when none of it shows.
 */
export function bubbleBox(words: HTMLElement, rise = 0): WordsBox | null {
  const box = words.getBoundingClientRect();
  const view = words.closest('[role="log"]')?.getBoundingClientRect();
  const top = box.top - rise;
  const seenTop = Math.max(top, view?.top ?? top);
  const seenBottom = Math.min(
    top + box.height,
    view?.bottom ?? Number.POSITIVE_INFINITY
  );
  if (seenBottom - seenTop < 1) {
    return null;
  }
  return {
    left: box.left,
    top: seenTop,
    width: box.width,
    height: seenBottom - seenTop,
    scroll: seenTop - top,
  };
}

/**
 * Where the field shows its words: its box inside its padding, at the
 * height it has (or will have: `height`), scrolled as it is (or to its end).
 */
export function fieldBox(
  field: HTMLTextAreaElement,
  rest?: { height: number; whole: number }
): WordsBox {
  const box = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const padTop = Number.parseFloat(style.paddingTop);
  const pads = padTop + Number.parseFloat(style.paddingBottom);
  const height = rest?.height ?? field.clientHeight;
  return {
    left: box.left,
    // The field grows upward: its foot stays where it is.
    top: box.bottom - height + padTop,
    width: field.clientWidth,
    height: height - pads,
    scroll: rest ? Math.max(0, rest.whole - height) : field.scrollTop,
  };
}

/** A copy of the words standing in `box`, cut to it, over the whole page. */
function copyAt(words: Node, box: WordsBox): HTMLElement {
  const copy = document.createElement("div");
  copy.className = "lift-copy";
  copy.setAttribute("aria-hidden", "true");
  copy.style.left = `${box.left}px`;
  copy.style.top = `${box.top}px`;
  copy.style.width = `${box.width}px`;
  copy.style.height = `${box.height}px`;
  const inner = document.createElement("div");
  inner.style.marginTop = `${-box.scroll}px`;
  inner.append(words);
  copy.append(inner);
  document.body.append(copy);
  return copy;
}

/** The bubble's words as the bubble sets them, without its controls. */
export function asBubble(words: HTMLElement): Node {
  const clone = words.cloneNode(true) as HTMLElement;
  // The bubble hides its own words while they fly; the copy is them.
  clone.style.visibility = "visible";
  for (const control of clone.querySelectorAll(".turn-actions, .reason")) {
    control.remove();
  }
  // The well lets its words run to its edge; out of it they would stop at
  // the prose measure and wrap elsewhere.
  for (const prose of clone.querySelectorAll<HTMLElement>(".msg")) {
    prose.style.maxInlineSize = "none";
  }
  return clone;
}

/**
 * The words as the field sets them: its face, size, leading and wrap. Not
 * its colour, which is clear while words land in it: the copy's own ink.
 */
export function asField(field: HTMLTextAreaElement, text: string): Node {
  const style = getComputedStyle(field);
  const words = document.createElement("div");
  words.style.font = style.font;
  words.style.letterSpacing = style.letterSpacing;
  words.style.whiteSpace = "pre-wrap";
  words.style.overflowWrap = "break-word";
  words.textContent = text;
  return words;
}

/**
 * A flight from one end to the other, made in two steps: `start` puts the
 * leaving copy over its end at once, so the source can hide in the same
 * frame; `fly` sends both on their way once the far end is known. Each copy
 * maps onto the other's box, scaled by the widths so the words keep their
 * shape. With reduced motion nothing is made and nothing flies.
 */
export function startFlight(words: Node, box: WordsBox) {
  if (!motionOk.current) {
    return { fly: () => Promise.resolve(), cancel: () => undefined };
  }
  const from = copyAt(words, box);
  const cancel = () => from.remove();
  const fly = (arriving: Node, to: WordsBox): Promise<void> => {
    const into = copyAt(arriving, to);
    const k = to.width / box.width;
    const dx = to.left - box.left;
    const dy = to.top - box.top;
    const timing = {
      duration: dur("--dur-lift"),
      easing: CURVE.drawer,
      fill: "both",
    } as const;
    for (const copy of [from, into]) {
      copy.style.transformOrigin = "0 0";
      copy.style.willChange = "transform, opacity";
    }
    from.animate(
      [
        { transform: "none", opacity: 1 },
        { opacity: 0, offset: LEFT_BY },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0 },
      ],
      timing
    );
    const landed = into.animate(
      [
        {
          transform: `translate(${-dx}px, ${-dy}px) scale(${1 / k})`,
          opacity: 0,
        },
        { opacity: 1, offset: IN_BY },
        { transform: "none", opacity: 1 },
      ],
      timing
    ).finished;
    const gone = () => {
      from.remove();
      into.remove();
    };
    // Cancelled (a newer flight, the page leaving) lands the same: gone.
    return landed.then(gone, gone);
  };
  return { fly, cancel };
}

/**
 * What the composer says when an edit could not take its message's place:
 * the agent read the message first, or the hub refused the withdraw.
 */
export const readFirst = (agent: string): string =>
  `${agent} had already read your queued message, so it went as it was.`;
/** A reason's own closing full stop, which the sentence around it supplies. */
const CLOSING_STOP = /[.\s]+$/;
export const notEdited = (reason?: string): string => {
  const why = reason?.trim().replace(CLOSING_STOP, "");
  return `Couldn't edit your queued message${why ? `: ${why}` : ""}.`;
};
const BACK = "Your edit is back in the composer.";

/**
 * Follows a replace to its outcome. Withdrawn in time, the queued send
 * gives way to its replacement, and the words fly into the replacement's
 * row as it lands, out of the bubble leaving, which keeps saying them until
 * it has gone. Otherwise the bubble shows its own words again, and the edit
 * comes back into `draft`, with why.
 */
export function watchReplace(
  draft: ComposerDraft,
  {
    id,
    instanceId,
    withdraw,
    replacement,
    words,
    agent,
  }: {
    agent: string;
    id: string;
    instanceId: string;
    withdraw: string;
    replacement: string;
    words: string;
  }
): void {
  let departed = false;
  let stop = (): void => undefined;
  stop = $effect.root(() => {
    $effect(() => {
      const record = commandRecord(withdraw);
      if (record && record.stage !== "applied" && record.stage !== "failed") {
        return;
      }
      const withdrawn =
        record?.stage === "applied" && record.outcome === "withdrawn";
      if (withdrawn && !departed) {
        departed = true;
        untrack(() => {
          const from = bubbleWords(id);
          if (from) {
            departBox(`sent:${replacement}`, from, false);
          }
        });
      }
      if (
        withdrawn &&
        cawco.session(instanceId)?.messages.some((m) => m.id === id)
      ) {
        return;
      }
      untrack(() => {
        if (!withdrawn) {
          draft.keepEdit(words);
          // The record says the session started on the message, or the
          // withdraw failed; a record the ledger no longer holds says neither.
          draft.notice = `${
            record?.stage === "applied"
              ? readFirst(agent)
              : notEdited(record?.reason)
          } ${BACK}`;
        }
        replacing.delete(id);
        queueMicrotask(stop);
      });
    });
  });
}
