/**
 * Another conversation's words take the field's place the way its
 * transcript does: the words that stood there slide --swap-nudge away from the
 * incoming tab's side as they fade, and the new ones slide in from that
 * side and fade up, typed out so the last character lands as the field's
 * height glide ends: the field holds its height until the transcript has
 * landed ({@link FieldFlight.holdUntil}), then glides on its own transition.
 * Both are drawn on an overlay laid over the field's text box, each laid out
 * as its full text with the part not yet typed clear, so every line already
 * stands where the field will put it and nothing moves vertically. The
 * field keeps its layout, height tween and focus underneath, its own text
 * clear. A switch mid-flight sends off what is on screen, from where it
 * is; the text changing in place (typing, a send, a chip) lands it at once.
 */
import { untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import {
  CURVE,
  easeOut,
  motionOk,
} from "#lib/platform/motion/curves.svelte.js";
import { msOf } from "#lib/platform/motion/time.js";
import { track } from "#lib/platform/track.js";
import { readAs } from "../find/mention.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";

interface Flight {
  dir: number;
  /** Where the words leaving stand as they start to go. */
  from: { transform: string; opacity: string };
  /** The words leaving, and the part of them that was never typed. */
  out: string;
  /** How far the words leaving drop from the field's foot ({@link scrollDrop}). */
  outDrop: number;
  outRest: string;
  /** The width the words leaving wrapped at in the field ({@link wrapOf}). */
  outWrap: number;
  text: string;
}

/** The field's height transition, in the unit the stylesheet wrote it in. */
export function heightMs(node: HTMLElement): number {
  const style = getComputedStyle(node);
  const props = style.transitionProperty.split(",").map((p) => p.trim());
  const durations = style.transitionDuration.split(",").map((d) => d.trim());
  const at = props.findIndex((p) => p === "height" || p === "all");
  if (at < 0) {
    return 0;
  }
  return msOf(durations[at % durations.length]);
}

/**
 * A layer stands whole on the field's foot, which puts its last line where
 * a field scrolled to its end shows it. A field scrolled higher shows its
 * lines lower by the scroll range it has left below, so the layer drops by
 * that much. A text the field holds whole has none, and stands as it is.
 */
const scrollDrop = (whole: number, box: number, scrolled: number) =>
  Math.max(0, whole - box - scrolled);

/**
 * The characters of `text` on the lines a box `box` tall shows from `top`
 * down, measured on a hidden copy of `layer` holding the whole text.
 */
function inView(
  layer: HTMLElement,
  text: string,
  top: number,
  box: number
): [number, number] {
  const probe = layer.cloneNode(false) as HTMLElement;
  probe.removeAttribute("data-rest");
  probe.removeAttribute("style");
  probe.style.visibility = "hidden";
  probe.textContent = text;
  layer.after(probe);
  const glyphs = probe.firstChild as Text;
  const origin = probe.getBoundingClientRect().top;
  const range = document.createRange();
  /** The foot of the line character `at` is on. */
  const footOf = (at: number) => {
    range.setStart(glyphs, 0);
    range.setEnd(glyphs, at + 1);
    return range.getBoundingClientRect().bottom - origin;
  };
  /** The head of the line character `at` is on. */
  const headOf = (at: number) => {
    range.setStart(glyphs, at);
    range.setEnd(glyphs, text.length);
    return range.getBoundingClientRect().top - origin;
  };
  /** The first character from `start` on for which `past` holds; they are in order. */
  const first = (start: number, past: (at: number) => boolean) => {
    let lo = start;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (past(mid)) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return lo;
  };
  const from = first(0, (at) => footOf(at) > top + 0.5);
  const to = first(from, (at) => headOf(at) >= top + box - 0.5);
  probe.remove();
  return [from, to];
}

/**
 * When the field's height glide ends, off the glide's own start (the
 * frame the fit landed in); null until it has started.
 */
function glideEndOf(node: HTMLElement, ms: number): number | null {
  const run = node
    .getAnimations()
    .find(
      (animation) =>
        animation instanceof CSSTransition &&
        animation.transitionProperty === "height"
    );
  return typeof run?.startTime === "number" ? run.startTime + ms : null;
}

/**
 * The width the field's text wraps at: its client width less its inline
 * padding. The field draws no scrollbar (its stylesheet), so this is its
 * width in every state; it changes only with the row around it, which is
 * why the words leaving are read before a switch and the words arriving
 * after it.
 */
function wrapOf(node: HTMLElement): number {
  const style = getComputedStyle(node);
  return (
    node.clientWidth -
    Number.parseFloat(style.paddingInlineStart) -
    Number.parseFloat(style.paddingInlineEnd)
  );
}

export interface FieldFlightParts {
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  /** Whether a draft of this height folds to its first line while the field is not written in. */
  folds: (whole: number) => boolean;
  /**
   * The transcript's motion for that switch: the field keeps its height
   * until `done`, then glides to the new draft's; `ms` is how long the
   * motion has left.
   */
  landing: () => { done: Promise<void>; ms: () => number };
  /**
   * Which way the tab strip moved when this composer was last handed
   * another conversation's draft: 1 to a tab on the right, -1 to one on
   * the left, 0 where there is no strip or no known side.
   */
  switchDir: () => number;
}

export class FieldFlight {
  flight = $state<Flight | null>(null);
  typed = $state("");
  /** How far the words arriving drop from the field's foot ({@link scrollDrop}). */
  inDrop = $state(0);
  flightOut = $state<HTMLElement>();
  flightIn = $state<HTMLElement>();
  /**
   * The field's scroll cue, standing in for the scrollbar it does not draw:
   * `cue-top` while text is scrolled out above, `cue-bottom` while there is
   * more below, and neither when the text fits. The stylesheet fades that
   * edge. Kept current as the field scrolls, resizes (a glide, a fold) and
   * is handed another draft.
   */
  cueTop = $state(false);
  cueBottom = $state(false);
  /**
   * The field keeps its height while the transcript's switch motion runs
   * (`landing`), and glides to the new draft's once it has landed, so the
   * words being typed in finish with the field (`fly`): from a switch until
   * that motion lands, or until the text changes in place. A newer switch
   * holds on to its own landing. The field's further lines stand over the
   * transcript's foot, so neither its height nor its hold moves a row.
   */
  holding = $state(false);
  readonly #parts: FieldFlightParts;
  /** The width the words arriving wrap at ({@link wrapOf}). */
  #inWrap = 0;
  #flightFrame = 0;
  /** The text the field last showed, and whose; undefined until it has shown one. */
  #shown: string | undefined;
  #shownDraft: ComposerDraft | undefined;
  /**
   * The field as it was last laid out: how far its text is scrolled past its
   * drop, and the width its text wraps at. Kept by the cue, which reads the
   * field wherever it already lays out (its scroll, its resize, the frame
   * after its text moves), so a switch flies the words leaving off this
   * (`fly`): read off the field in the switch itself, the page was laid out
   * in the click with the pane just shown dirty, styling the whole page in
   * that task.
   */
  #laidOut = { drop: 0, wrap: 0 };
  #holdFor: Promise<void> | null = null;

  constructor(parts: FieldFlightParts) {
    this.#parts = parts;

    $effect.pre(() => {
      const next = parts.draft();
      const { text } = next;
      untrack(() => {
        if (this.#shown !== undefined && next !== this.#shownDraft) {
          this.holdUntil(parts.landing().done);
          if (motionOk.current && (this.flight || text !== this.#shown)) {
            // The words as they read, each chip its `@<label>`.
            this.fly(readAs(this.#shown), readAs(text), parts.switchDir());
          } else {
            this.endFlight();
          }
        } else if (text !== this.#shown) {
          this.endFlight();
          this.letGo();
        }
        this.#shown = text;
        this.#shownDraft = next;
      });
    });

    $effect(() => () => cancelAnimationFrame(this.#flightFrame));
  }

  /**
   * Where the arriving text will rest once the field has fitted it: the
   * field's height, the text's drop, and the characters in view, as offsets
   * into it. The field's own box and scroll at rest are worked out from the
   * layer, laid out whole at the field's width, and the field's min and max
   * height; the scroll is the field's own, as its bounds at rest will hold
   * it.
   */
  #restOf(
    node: HTMLElement,
    layer: HTMLElement,
    text: string
  ): { fitted: number; drop: number; from: number; to: number } {
    const style = getComputedStyle(node);
    const padTop = Number.parseFloat(style.paddingTop);
    const border = node.offsetHeight - node.clientHeight;
    const whole =
      layer.offsetHeight + padTop + Number.parseFloat(style.paddingBottom);
    const least = Number.parseFloat(style.minHeight) || 0;
    // A field not being written in folds a longer draft to its first line.
    const folding = this.#parts.folds(whole + border);
    const cap = folding
      ? least
      : Number.parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY;
    const box = Math.min(Math.max(whole + border, least), cap) - border;
    const fitted = box + border;
    if (whole <= box) {
      return { fitted, drop: 0, from: 0, to: text.length };
    }
    const scrolled = folding ? 0 : Math.min(node.scrollTop, whole - box);
    const [from, to] = inView(layer, text, scrolled - padTop, box);
    return { fitted, drop: scrollDrop(whole, box, scrolled), from, to };
  }

  scrollCue = (node: HTMLElement) => {
    /** The field's scroll and wrap, read only. */
    const read = () => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      scrollTop: node.scrollTop,
      wrap: wrapOf(node),
    });
    const take = ({
      scrollHeight,
      clientHeight,
      scrollTop,
      wrap,
    }: ReturnType<typeof read>) => {
      const hidden = scrollHeight - clientHeight;
      this.cueTop = hidden > 1 && scrollTop > 1;
      this.cueBottom = hidden > 1 && scrollTop < hidden - 1;
      this.#laidOut = {
        drop: scrollDrop(scrollHeight, clientHeight, scrollTop),
        wrap,
      };
    };
    const cue = () => take(read());
    let frame = 0;
    $effect(() => {
      track(this.#parts.draft().text);
      frame = requestAnimationFrame(cue);
    });
    // A resize is read inside the delivery, on the layout the frame has
    // just done, and taken in the next frame (frameObserver `read`): the
    // cues are the field's edges, drawn on it. Read in the next frame's
    // callbacks instead, every frame of a rail drag laid the page out for
    // it. A scroll lays nothing out, and is read at once.
    let resized: ReturnType<typeof read> | null = null;
    const sizes = frameObserver(
      () => {
        if (resized) {
          take(resized);
          resized = null;
        }
      },
      {
        read: () => {
          resized = read();
        },
      }
    );
    sizes.observe(node);
    node.addEventListener("scroll", cue, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      node.removeEventListener("scroll", cue);
    };
  };

  endFlight(): void {
    cancelAnimationFrame(this.#flightFrame);
    this.flight = null;
  }

  holdUntil(done: Promise<void>): void {
    this.holding = true;
    this.#holdFor = done;
    done.then(() => {
      if (this.#holdFor === done) {
        this.letGo();
      }
    });
  }

  letGo(): void {
    this.#holdFor = null;
    this.holding = false;
  }

  fly(from: string, to: string, dir: number): void {
    cancelAnimationFrame(this.#flightFrame);
    const was = this.flight;
    let start = { transform: "none", opacity: "1" };
    let out = from;
    let outRest = "";
    // The field still showing the words leaving, as it was last laid out.
    let outDrop = this.#laidOut.drop;
    let outWrap = this.#laidOut.wrap;
    if (was && this.flightIn) {
      const style = getComputedStyle(this.flightIn);
      start = { transform: style.transform, opacity: style.opacity };
      out = this.typed;
      outRest = was.text.slice(this.typed.length);
      outDrop = this.inDrop;
      outWrap = this.#inWrap;
    }
    for (const node of [this.flightOut, this.flightIn]) {
      for (const running of node?.getAnimations() ?? []) {
        running.cancel();
      }
    }
    this.typed = "";
    this.inDrop = 0;
    this.flight = {
      dir,
      out,
      outDrop,
      outRest,
      outWrap,
      from: start,
      text: to,
    };
    this.#flightFrame = requestAnimationFrame((began) => {
      // Both are on the page: the overlay rendered with the switch.
      const node = this.#parts.field() as HTMLDivElement;
      const layer = this.flightIn as HTMLElement;
      const ms = heightMs(node);
      // The words arriving wrap where the field, now in its new row, does;
      // set before the layer is measured.
      this.#inWrap = wrapOf(node);
      layer.style.inlineSize = `${this.#inWrap}px`;
      const rest = this.#restOf(node, layer, to);
      this.inDrop = rest.drop;
      const timing = {
        duration: ms,
        easing: CURVE.out,
        fill: "forwards",
      } as const;
      this.flightOut?.animate(
        [
          start,
          {
            transform: `translateX(calc(var(--swap-nudge) * ${-dir}))`,
            opacity: 0,
          },
        ],
        timing
      );
      this.flightIn?.animate(
        [
          {
            transform: `translateX(calc(var(--swap-nudge) * ${dir}))`,
            opacity: 0,
          },
          { transform: "none", opacity: 1 },
        ],
        timing
      );
      // The typing runs from the slide to the end of the field's glide,
      // which starts when the transcript lands: until then its end is where
      // the landing is expected, and once landed it is that frame plus the
      // glide, or that frame alone when the height does not change.
      const glide = Math.abs(rest.fitted - node.offsetHeight) > 0.5 ? ms : 0;
      const expected = began + this.#parts.landing().ms() + glide;
      let glideEnd: number | null = null;
      let letGoAt: number | null = null;
      // The fit runs in the frame the hold lets go or the next; a frame on
      // with no glide running, the height had nothing to glide to.
      const endAt = (now: number): number | null => {
        if (glideEnd !== null || this.holding) {
          return glideEnd;
        }
        letGoAt ??= now;
        if (!glide) {
          return now;
        }
        return glideEndOf(node, ms) ?? (now > letGoAt ? now : null);
      };
      let count = rest.from;
      const type = (now: number) => {
        glideEnd = endAt(now);
        const end = glideEnd ?? Math.max(expected, now + glide + 1);
        const landed = glideEnd !== null && now >= glideEnd;
        const progress =
          end > began ? Math.min(1, (now - began) / (end - began)) : 1;
        // Typed across what the field will show; what stands above it is
        // there from the start, so the typing is never spent out of view.
        count = Math.max(
          count,
          rest.from + Math.floor((rest.to - rest.from) * easeOut(progress))
        );
        this.typed = landed ? to : to.slice(0, count);
        this.#flightFrame = requestAnimationFrame(
          landed ? () => this.endFlight() : type
        );
      };
      type(began);
    });
  }
}
