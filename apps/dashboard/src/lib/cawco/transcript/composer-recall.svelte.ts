/**
 * Recall: what you sent, rolled up on a wheel over the pill (↑, or a held
 * press on a touch screen). The wheel's shape grows out of the pill; the
 * pill's buttons fold into a deck while it is up, and its pick lands in the
 * field, which fits it on the wheel's fold.
 */
import { traitsOf } from "@cawco/core/harness/traits";
import { tick, untrack } from "svelte";
import { newId } from "#lib/platform/id.js";
import {
  CURVE,
  dur,
  easeDrawer,
  motionOk,
} from "#lib/platform/motion/curves.svelte.js";
import { scrollMotion } from "#lib/platform/motion/keyed.svelte.js";
import { track } from "#lib/platform/track.js";
import type MentionField from "../find/MentionField.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";
import type { ComposerFleet } from "./composer-fleet";
import { heightMs } from "./field-flight.svelte";
import { measureShape } from "./grown";
import { sentByReader } from "./recall";

/** One of the pill's buttons, where it stands in the deck. */
interface DeckPlace {
  card: HTMLElement;
  o: number;
  s: number;
  x: number;
}

/**
 * Where each of the pill's buttons stands in the deck they fold into
 * while the wheel is up, read before anything is written: Send in front,
 * where it is; each one behind it slid toward it until it peeks out by
 * `--c-deck-peek`, a step smaller (`--c-deck-scale`), whole, so its edge
 * reads behind the one in front and nothing behind it shows through. With
 * reduced motion nothing slides: the ones behind fade out, and the deck is
 * Send alone. Returns each button's place, and where the deck starts
 * (`deck`) and where its first button stands now (`start`), from the
 * shell's inline start.
 */
function foldDeck(
  row: HTMLElement,
  from: number
): { deck: number; start: number; places: DeckPlace[] } {
  const style = getComputedStyle(row);
  const peek = Number.parseFloat(style.getPropertyValue("--c-deck-peek"));
  const scale = Number.parseFloat(style.getPropertyValue("--c-deck-scale"));
  const cards = [...row.children]
    .filter((card): card is HTMLElement => card instanceof HTMLElement)
    .map((card) => ({ card, box: card.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0)
    .reverse();
  const [front] = cards;
  if (!front) {
    const none = Number.POSITIVE_INFINITY;
    return { deck: none, start: none, places: [] };
  }
  const slide = motionOk.current;
  let { left } = front.box;
  // On the device's pixel grid, so each peeking edge is drawn whole, not
  // smeared across two pixels at a fraction of its contrast.
  const grid = window.devicePixelRatio || 1;
  const places = cards.map(({ card, box }, i) => {
    const s = slide ? scale ** i : 1;
    // Its leading edge one peek past the edge of the one in front.
    const edge = Math.round((front.box.left - i * peek) * grid) / grid;
    const x = slide
      ? edge + (box.width * s) / 2 - (box.left + box.width / 2)
      : 0;
    if (slide) {
      left = Math.min(left, edge);
    }
    return { card, x, s, o: slide ? 1 : Number(i === 0) };
  });
  const first = (cards.at(-1)?.box.left ?? left) - from;
  return { deck: left - from, start: slide ? first : left - from, places };
}

/** What the session being written to holds, as the sessions store reads it. */
type Recalled = ReturnType<ComposerFleet["sessionsStore"]["session"]> | null;

export interface ComposerRecallParts {
  /** An ask holds the composer. */
  askOpen: () => boolean;
  /** The canvas stands over the field. */
  canvasUp: () => boolean;
  /** The `/` menu is put away: the wheel's opening closes it. */
  dismissMenu: () => void;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  /** The field's one-line height. */
  floor: () => number;
  /** Whether a draft of this height folds to its first line while the field is not written in. */
  folds: (whole: number) => boolean;
  /** A held press is on the pill (press-hold.svelte.ts). */
  holding: () => boolean;
  mentionField: () => ReturnType<typeof MentionField> | undefined;
  pill: () => HTMLFormElement | undefined;
  /** The session being written to, as the sessions store reads it. */
  recalled: () => Recalled;
  /** The conversation whose sent messages the composer recalls. */
  recallOf: () => string | undefined;
  shell: () => HTMLElement | undefined;
  /** mod+Enter's send, which the wheel's send is. */
  submit: (cuts: boolean) => void;
}

export class ComposerRecall {
  /**
   * The wheel, while it is up: whether keys reach it from the field (a held
   * press leaves the keyboard down), the composer's text when it came up,
   * and where the caret stood in it.
   */
  recall = $state<{
    keys: boolean;
    text: string;
    caret: [number, number];
    measured: ReturnType<typeof measureShape>;
  } | null>(null);
  /** The pill's buttons, which fold into a deck while the wheel is up. */
  ctrls = $state<HTMLElement>();
  /** The field's box: the draft's row on the wheel. */
  fieldWrap = $state<HTMLElement>();
  wheel = $state<ReturnType<ComposerFleet["RecallWheel"]>>();
  /** ↑ pressed while the wheel was folding: it comes up again once folded. */
  reopen: boolean;
  /** The wheel's row on the field's line, for a screen reader. */
  recallActive = $state<string>();
  /**
   * The wheel is up and not yet folding: the field has no caret, and a
   * pick fits the field on the fold's clock once it is off (`.settling`).
   * The pill's own surface steps aside for as long as the wheel is mounted
   * (`.recalling`): its shape is the composer until it has folded away.
   */
  wheeling = $state(false);
  /**
   * The field's hint fading back in after the wheel has folded away (its
   * timer while it does): it is not drawn while the wheel is up, where it
   * would stand doubled under the row on the line.
   */
  hintBack = $state<ReturnType<typeof setTimeout> | 0>(0);
  readonly recallId = `recall-${newId()}`;
  readonly #parts: ComposerRecallParts;
  /** What the wheel rolls, read only while it is up. */
  readonly sentHere = $derived.by(() => {
    const recalled = this.#parts.recalled();
    return this.recall && recalled ? sentByReader(recalled.messages) : [];
  });
  /** Whose queued sends this harness calls queued, for the wheel's rows. */
  readonly queuedWord = $derived.by(() =>
    traitsOf(this.#parts.recalled()?.harness).queuesSends ? "Queued" : undefined
  );
  /**
   * The buttons folded into the deck, and their motion, while they are, and
   * where the first of them stands unfolded (from the shell's inline start).
   */
  #decked: { places: DeckPlace[]; runs: Animation[]; start: number } | null =
    null;
  /**
   * The deck's leading edge on the move, from the shell's inline start:
   * from `from` to `to` on `run`'s clock, the drawer curve. Every button
   * slides on the same curve, so the first one's edge leads the whole way.
   */
  #deckSlide: { from: number; to: number; run: Animation | null } | null = null;
  /**
   * The field's next fit, while a pick taken off the wheel waits on it
   * (autosize `measured`): it runs in the fit, so whatever moves with the
   * field's new height starts in the frame the height does.
   */
  onFit: ((whole: number) => void) | null = null;

  constructor(parts: ComposerRecallParts) {
    this.#parts = parts;
    this.reopen = false;

    // A composer handed another conversation's draft puts the last one's
    // wheel away at once: what it rolled was that conversation's.
    $effect.pre(() => {
      track(parts.draft());
      untrack(() => this.putAway());
    });

    // While the wheel is up, a press anywhere outside the composer puts it
    // away, back to the draft. The grown shape is the composer's: a press on
    // it, around the rows, rolls the wheel as a press on the rows does.
    $effect(() => {
      if (!this.recall) {
        return;
      }
      const outside = (event: PointerEvent) => {
        const { target } = event;
        if (!(target instanceof Element && parts.shell()?.contains(target))) {
          this.wheel?.back();
        } else if (target.closest('[data-slot="grown-halo"]')) {
          this.wheel?.grab(event);
        }
      };
      document.addEventListener("pointerdown", outside, true);
      return () => document.removeEventListener("pointerdown", outside, true);
    });

    // A touch the wheel is rolling must not pan the page under it. Pointer
    // events cannot cancel a pan, and touch-action alone has not always held
    // on iOS Safari, so the touch's own moves are cancelled while it belongs
    // to the wheel: one that began on the composer, or the held press that
    // brought the wheel up mid-touch.
    $effect(() => {
      if (!this.recall) {
        return;
      }
      let ours = untrack(() => parts.holding());
      const began = (event: TouchEvent) => {
        const { target } = event;
        ours = target instanceof Node && !!parts.shell()?.contains(target);
      };
      const moved = (event: TouchEvent) => {
        if (ours && event.cancelable) {
          event.preventDefault();
        }
      };
      document.addEventListener("touchstart", began, {
        capture: true,
        passive: true,
      });
      document.addEventListener("touchmove", moved, {
        capture: true,
        passive: false,
      });
      return () => {
        document.removeEventListener("touchstart", began, true);
        document.removeEventListener("touchmove", moved, true);
      };
    });
  }

  /** The wheel is put away at once: its deck back, nothing rolling. */
  putAway(): void {
    this.deckOut(0);
    this.recall = null;
    this.reopen = false;
    this.wheeling = false;
  }

  /**
   * ↑ starts recall only from an empty field or with the caret at its very
   * start, so in a draft it still moves the caret, as a shell's does.
   */
  startsRecall(): boolean {
    const { draft, field, mentionField } = this.#parts;
    if (
      !(this.#parts.recallOf() && field()) ||
      this.recall ||
      draft().lifted ||
      this.#parts.askOpen() ||
      this.#parts.canvasUp()
    ) {
      return false;
    }
    const [from, to] = mentionField()?.selection() ?? [0, 0];
    return from === to && (draft().text === "" || from === 0);
  }

  /**
   * Where the deck's leading edge stands this frame (from the shell's
   * inline start), and whether it has stopped: arithmetic off its motion's
   * clock, no layout read. The wheel's row on the field's line stops short
   * of it at every frame.
   */
  deckAt = (): { at: number; still: boolean } => {
    const slide = this.#deckSlide;
    if (!slide) {
      return { at: Number.POSITIVE_INFINITY, still: true };
    }
    const { run } = slide;
    const ms = Number(run?.effect?.getTiming().duration) || 0;
    const moving = run?.playState === "running" || run?.playState === "paused";
    const t =
      run && moving && ms > 0
        ? Math.min(1, Math.max(0, Number(run.currentTime ?? 0) / ms))
        : 1;
    return {
      at: slide.from + (slide.to - slide.from) * easeDrawer(t),
      still: t >= 1,
    };
  };

  /**
   * The buttons slide together into the deck on the wheel's own growth:
   * its --dur-grow on the drawer curve. Transform and opacity only, by the
   * Web Animations API, so the buttons' own transitions stay theirs.
   */
  #deckIn(places: DeckPlace[], from: number, to: number): void {
    this.deckOut(0);
    const timing = {
      duration: dur("--dur-grow"),
      easing: CURVE.drawer,
      fill: "forwards",
    } as const;
    const runs = places.map(({ card, x, s, o }) =>
      card.animate(
        [
          { translate: "0 0", scale: "1", opacity: 1 },
          { translate: `${x.toFixed(2)}px 0`, scale: String(s), opacity: o },
        ],
        timing
      )
    );
    const stack = { places, runs, start: from };
    this.#decked = stack;
    this.#deckSlide = { from, to, run: runs.at(-1) ?? null };
    // Landed, each card stands where it is as its own style, not held by a
    // motion: a held motion's layer is drawn at full size and scaled, which
    // smears each card's 1px edge across two pixels; standing, it is drawn
    // at its size, its edge whole.
    runs[0]?.finished.then(
      () => {
        if (this.#decked !== stack) {
          return;
        }
        // Its own end, written out (WebKit's commitStyles() has written a
        // finished motion's start).
        for (const [i, { card, x, s, o }] of places.entries()) {
          card.style.translate = `${x.toFixed(2)}px 0`;
          card.style.scale = String(s);
          card.style.opacity = String(o);
          runs[i]?.cancel();
        }
      },
      () => undefined
    );
  }

  /**
   * They fan back out to their places from wherever they are, on the
   * wheel's fold: its --dur-grow-exit on the drawer curve (`ms`: 0 puts
   * them back at once).
   */
  deckOut(ms = dur("--dur-grow-exit")): void {
    const was = this.#decked;
    this.#decked = null;
    if (!was) {
      return;
    }
    const edge = this.deckAt().at;
    this.#deckSlide = null;
    // Where each one is drawn now, read before the motion that held it goes.
    const from = was.places.map(({ card }) => {
      const style = getComputedStyle(card);
      return {
        translate: style.translate,
        scale: style.scale,
        opacity: Number(style.opacity),
      };
    });
    for (const run of was.runs) {
      run.cancel();
    }
    for (const { card } of was.places) {
      for (const property of ["translate", "scale", "opacity"]) {
        card.style.removeProperty(property);
      }
    }
    if (ms <= 0) {
      return;
    }
    const runs = was.places.map(({ card }, i) =>
      card.animate([from[i], { translate: "0 0", scale: "1", opacity: 1 }], {
        duration: ms,
        easing: CURVE.drawer,
      })
    );
    this.#deckSlide = { from: edge, to: was.start, run: runs.at(-1) ?? null };
  }

  openRecall(keys: boolean): void {
    const { draft, field, mentionField, shell, pill } = this.#parts;
    const [fieldEl, shellEl, pillEl] = [field(), shell(), pill()];
    if (
      !(this.#parts.recallOf() && fieldEl && shellEl && pillEl && this.ctrls) ||
      this.recall ||
      draft().lifted ||
      this.#parts.askOpen() ||
      this.#parts.canvasUp()
    ) {
      return;
    }
    // Every size first, before anything is written: one layout per open.
    const measured = measureShape(shellEl, pillEl, fieldEl);
    const deck = foldDeck(this.ctrls, shellEl.getBoundingClientRect().left);
    this.#deckIn(deck.places, deck.start, deck.deck);
    this.recall = {
      keys,
      text: draft().text,
      caret: mentionField()?.selection() ?? [0, 0],
      measured,
    };
    this.wheeling = true;
    this.#parts.dismissMenu();
    // Keys reach the wheel from the field.
    if (keys) {
      fieldEl.focus();
    }
  }

  /**
   * The wheel's pick, into the field. Its first line stays where the
   * wheel's row stood, the words they share in place, and the field fits
   * it on the wheel's fold (`.settling`): growing, its top carries the
   * further lines up; shrinking, the text stands as low as the line and
   * the field's top comes down to it on the same curve. The caret goes
   * after it once it has landed (`recallDone`). Resolves to the pill's
   * height, fitted.
   */
  recallTake = (text: string): Promise<number> => {
    const { draft, pill } = this.#parts;
    const node = this.#parts.field();
    const was = node?.offsetHeight ?? 0;
    const base = pill()?.offsetHeight ?? 0;
    this.deckOut();
    this.wheeling = false;
    if (!node || text === draft().text) {
      draft().text = text;
      return Promise.resolve(base);
    }
    const fitted = new Promise<number>((done) => {
      this.onFit = (whole) => {
        this.onFit = null;
        const cap =
          Number.parseFloat(getComputedStyle(node).maxHeight) ||
          Number.POSITIVE_INFINITY;
        const next = this.#parts.folds(whole)
          ? this.#parts.floor()
          : Math.min(whole, cap);
        const drop = was - next;
        if (drop > 0.5 && motionOk.current) {
          node.animate([{ translate: `0 ${drop}px` }, { translate: "0 0" }], {
            duration: heightMs(node),
            easing: CURVE.drawer,
          });
        }
        done(base + next - was);
      };
    });
    draft().text = text;
    return fitted;
  };

  /** Back to the draft, the caret where it was, so a key typed lands there. */
  recallBack = (): void => {
    this.deckOut();
    this.wheeling = false;
    if (this.recall && this.#parts.field()) {
      this.#parts.mentionField()?.select(...this.recall.caret);
    }
  };

  recallDone = async (send: boolean): Promise<void> => {
    const { draft, mentionField } = this.#parts;
    const was = this.recall;
    const again = this.reopen;
    this.reopen = false;
    this.recall = null;
    // The field's hint comes back once the rows are gone, never under them.
    clearTimeout(this.hintBack);
    this.hintBack = setTimeout(() => {
      this.hintBack = 0;
    }, dur("--dur-fade"));
    await tick();
    const took = was?.text !== draft().text;
    // Back to the draft and asked for again: it comes straight back up. A
    // pick taken or sent stands; the ↑ was too late for it.
    if (again && !took && !send) {
      this.openRecall(was?.keys ?? true);
      return;
    }
    const field = this.#parts.field();
    // Back to the field if you were typing in it, or to edit what you took;
    // a hold put away leaves the keyboard down.
    if (was?.keys || took) {
      field?.focus();
    }
    if (took && field) {
      // The caret after the pick, ready to edit. A pick past the field's
      // ceiling scrolls to its end, gliding rather than jumping there.
      const from = field.scrollTop;
      mentionField()?.select(draft().text.length);
      const to = Math.max(0, field.scrollHeight - field.clientHeight);
      if (to !== from) {
        field.scrollTop = from;
        field.scrollTo({
          top: to,
          behavior: scrollMotion(motionOk.current),
        });
      }
    }
    // The wheel sends only on mod+Enter, so its send is mod+Enter's.
    if (send) {
      this.#parts.submit(true);
    }
  };
}
