/**
 * The morph MorphText draws: the words a text had become the new ones,
 * letter by letter, on torph's text matching (`segmentText`, `diffSegments`;
 * its README: "The text matching torph runs on is exported for building
 * your own behaviour on top of it") and this renderer instead of torph's.
 *
 * torph's renderer tweens its root's width and height from the old words'
 * size to the new ones', which slides whatever stands after the text, and
 * runs its fades on clocks of their own (linear, a quarter to a half of the
 * duration) beside the letters' moves. Here:
 *
 * - Each step's words are a layer of letters of their own, and every layer
 *   stands in the box's one grid cell, so the box is the larger of the words
 *   drawn and the words coming, at once, by layout alone: nothing beside it
 *   moves while the letters cross, and nothing is read to hold it. The
 *   older layers stay, their letters gone, until the morph's box goes (the
 *   plain text back, morph-text.svelte), so the box is held at the largest
 *   it was drawn at until then, and a `morph()` around it hears the box's
 *   one change of size there. A new layer is put in before the older ones,
 *   so what leaves is drawn over what arrives.
 * - Nothing is read while the page is still to be laid out. A step writes
 *   its layer and the next frame's layout lays it out with the rest of the
 *   page; its ResizeObserver delivery, after that layout, reads every box it
 *   needs (where each letter is drawn now and where the new ones are laid)
 *   and then writes only animations, which resize nothing. A paragraph
 *   (`wrap`) is first written as plain text in the cell, hidden: its first
 *   delivery reads where that text wraps and writes the layer broken there,
 *   the same lines in the same box, and a second delivery in the same frame
 *   (its letters stand deeper) reads the letters. Read between writes, each
 *   read laid the page out again: a forced layout per step, up to 7 ms at 4x.
 * - Every animation of a step runs on one clock: one start time, one
 *   duration, one curve. A letter that stays glides from where it was drawn;
 *   one that arrives fades up from 0.95; one that leaves stays where it was
 *   and fades down to 0.95; a digit rolls, in from below and out above, in
 *   a slot that clips it.
 * - A step that lands mid-step starts from what is drawn: each letter from
 *   where it is and how opaque it is, the leaving ones fading on from there.
 * - With less motion (`fade`) nothing moves: the old words fade out where
 *   they stand and the new ones fade in where they lay out, in the same
 *   box, opacity only, on the same clock (DESIGN.md, The Reduced Motion
 *   Rule: "It does not mean an instant swap").
 */
import { diffSegments, type Segment, segmentText } from "torph";

const LOCALE = "en";
const SHRINK = "scale(0.95)";
const TRAILING_SPACE = / $/u;
/** Within this, two sizes are one: what a `morph()` around the text treats as no change. */
const SAME_PX = 0.5;

/** Where a letter is drawn in the box, how opaque, and how far it is moved. */
interface Drawn {
  opacity: number;
  /** Its transform's translation now (a glide in flight). */
  tx: number;
  ty: number;
  x: number;
  y: number;
}

/** One step's words, laid out in the box's one cell. */
interface Layer {
  el: HTMLElement;
  /** Its letters (no line breaks), by segment id. */
  letters: Map<string, HTMLElement>;
  segments: Segment[];
}

/** What a step read: each drawn letter, and where each new one is laid. */
interface Reads {
  drawn: Map<HTMLElement, Drawn>;
  laid: Map<HTMLElement, { x: number; y: number }>;
}

/** A read made once the page is laid out; it hands back what to write. */
type Read = () => (() => void) | undefined;

type Run = (el: Element, keyframes: Keyframe[]) => void;

/** The reads waiting on the frame's layout, by the element whose box says it came. */
const waiting = new Map<Element, Read>();
// biome-ignore lint/style/noRestrictedGlobals: the observer `onceLaidOut` makes, which reads inside its delivery (see there).
let laidOut: ResizeObserver | undefined;

/**
 * Every read waiting in this delivery, then every write: a write between two
 * reads laid the page out again. What is written resizes nothing (animations,
 * or a paragraph's letters in place of its text, the same lines), so the
 * delivery passes no box it changed.
 */
function deliver(entries: ResizeObserverEntry[]): void {
  const reads: Read[] = [];
  for (const { target } of entries) {
    const read = waiting.get(target);
    laidOut?.unobserve(target);
    if (read) {
      waiting.delete(target);
      reads.push(read);
    }
  }
  const writes = reads.map((read) => read());
  for (const write of writes) {
    write?.();
  }
}

/** `read` runs once `el` has been laid out: in the next frame, before it is drawn. */
function onceLaidOut(el: Element, read: Read): void {
  // biome-ignore lint/style/noRestrictedGlobals: the morph reads its letters inside the delivery, after the frame's layout, so no read lays the page out; what it writes there resizes nothing (animations, or a paragraph's letters in place of its text on the same lines).
  laidOut ??= new ResizeObserver(deliver);
  waiting.set(el, read);
  laidOut.observe(el);
}

function forget(el: Element): void {
  waiting.delete(el);
  laidOut?.unobserve(el);
}

const isBreak = (el: Element): boolean => el.tagName === "BR";

/** A segment's element: a line break, a rolling digit in its slot, or text. */
function make(segment: Segment): HTMLElement {
  if (segment.string === "\n") {
    return document.createElement("br");
  }
  const el = document.createElement("span");
  if (segment.kind === "digit") {
    el.dataset.roll = "";
    const face = document.createElement("span");
    face.textContent = segment.string;
    el.append(face);
  } else {
    el.textContent = segment.string;
  }
  return el;
}

/** A layer of `segments`' letters. */
function layer(segments: Segment[]): Layer {
  const el = document.createElement("span");
  el.dataset.layer = "";
  const letters = new Map<string, HTMLElement>();
  el.append(
    ...segments.map((segment) => {
      const one = make(segment);
      if (!isBreak(one)) {
        letters.set(segment.id, one);
      }
      return one;
    })
  );
  return { el, letters, segments };
}

/** `text` as plain words in the cell, hidden, wrapping as the text at rest does. */
function probe(text: string): HTMLElement {
  const el = document.createElement("span");
  el.dataset.probe = "";
  el.textContent = text;
  return el;
}

/** `text` with a "\n" wherever it wraps in `el` (a probe), laid out already. */
function linesIn(el: HTMLElement, text: string): string {
  const node = el.firstChild as Text | null;
  if (!node) {
    return text;
  }
  const range = document.createRange();
  let out = "";
  let top: number | null = null;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== " " && (i === 0 || text[i - 1] === " ")) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const y = Math.round(range.getBoundingClientRect().top);
      if (top !== null && y > top + 1) {
        out = `${out.replace(TRAILING_SPACE, "")}\n`;
      }
      top = y;
    }
    out += text[i];
  }
  return out;
}

/**
 * Where `el` is drawn from `origin`, mid-step its glide included, and how
 * opaque; with no step running it stands at full opacity, and its style is
 * not asked.
 */
function drawnNow(el: HTMLElement, origin: DOMRect, running: boolean): Drawn {
  const at = el.getBoundingClientRect();
  const style = running ? getComputedStyle(el) : null;
  const moved =
    style && style.transform !== "none"
      ? new DOMMatrixReadOnly(style.transform)
      : null;
  return {
    opacity: style ? Number(style.opacity) : 1,
    tx: moved?.e ?? 0,
    ty: moved?.f ?? 0,
    x: at.left - origin.left,
    y: at.top - origin.top,
  };
}

/** What rolls in a digit's slot: the face inside it; any other letter is itself. */
const face = (el: HTMLElement): HTMLElement =>
  el.dataset.roll === undefined
    ? el
    : ((el.firstElementChild as HTMLElement | null) ?? el);

/**
 * A letter arriving fades up from 0.95; a digit rolls in from below. With
 * less motion it only fades up.
 */
function arrive(el: HTMLElement, run: Run, fade: boolean): void {
  run(el, [{ opacity: 0 }, { opacity: 1 }]);
  if (fade) {
    return;
  }
  if (el.dataset.roll === undefined) {
    run(el, [{ transform: SHRINK }, { transform: "none" }]);
  } else {
    run(face(el), [{ transform: "translateY(100%)" }, { transform: "none" }]);
  }
}

/** A letter that stays glides from where it was drawn, and fades up if it was fading. */
function glide(
  el: HTMLElement,
  was: Drawn,
  at: { x: number; y: number },
  run: Run
): void {
  const dx = was.x - at.x;
  const dy = was.y - at.y;
  if (dx !== 0 || dy !== 0) {
    run(el, [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: "none" },
    ]);
  }
  if (was.opacity < 1) {
    run(el, [{ opacity: was.opacity }, { opacity: 1 }]);
  }
}

/**
 * A letter leaving fades down to 0.95 where it stands (held where a glide
 * had it); a digit rolls out above. With less motion it only fades out.
 */
function go(el: HTMLElement, was: Drawn, run: Run, fade: boolean): void {
  run(el, [{ opacity: was.opacity }, { opacity: 0 }]);
  if (fade) {
    return;
  }
  const at =
    was.tx === 0 && was.ty === 0 ? "" : `translate(${was.tx}px, ${was.ty}px)`;
  if (el.dataset.roll === undefined) {
    run(el, [
      { transform: at || "none" },
      { transform: `${at} ${SHRINK}`.trim() },
    ]);
    return;
  }
  if (at) {
    run(el, [{ transform: at }, { transform: at }]);
  }
  run(face(el), [{ transform: "none" }, { transform: "translateY(-100%)" }]);
}

export class Morph {
  readonly #root: HTMLElement;
  readonly #duration: number;
  readonly #easing: string;
  /** Less motion: the old words fade out and the new ones in, in place. */
  readonly #fade: boolean;
  /** A paragraph: each side broken where it wraps as text in the box. */
  readonly #wrap: boolean;
  /** The words the last step morphed to (or the first drawn). */
  #current: Layer | null = null;
  /** Older layers, their letters leaving or gone. */
  readonly #old: Layer[] = [];
  #clock: Animation[] = [];
  #step = 0;
  /** What the step not yet read put in the box, taken out if another comes first. */
  #pending: HTMLElement[] = [];
  /** The element whose layout the step not yet read waits on. */
  #watched: Element | null = null;
  /** A paragraph's first words, not drawn yet: the next step starts from them. */
  #from: string | null = null;
  #resolve: ((settled: boolean) => void) | null = null;

  /**
   * The last step's words fill the box it holds: once it settles, the plain
   * text takes the box's place at its size (morph-text.svelte says so to a
   * `morph()` around it, which then measures nothing).
   */
  landsInPlace = false;

  constructor(
    root: HTMLElement,
    options: { duration: number; easing: string; fade: boolean; wrap: boolean }
  ) {
    this.#root = root;
    this.#duration = options.duration;
    this.#easing = options.easing;
    this.#fade = options.fade;
    this.#wrap = options.wrap;
  }

  /**
   * Draws `from` (the words the text had) and morphs to `to`, the first step.
   * Resolves as `to` does.
   */
  start(from: string, to: string): Promise<boolean> {
    if (!this.#wrap) {
      this.#current = layer(segmentText(from, LOCALE, true));
      this.#root.prepend(this.#current.el);
      return this.to(to);
    }
    this.#from = from;
    return this.#begin(to);
  }

  /**
   * Morphs to `value` on one clock. Resolves true once the step has settled,
   * false when a later step took over first.
   */
  to(value: string): Promise<boolean> {
    return this.#begin(value);
  }

  /** Lets go: a step not yet read is dropped, and nothing more is read. */
  stop(): void {
    this.#drop();
  }

  #begin(value: string): Promise<boolean> {
    this.#drop();
    this.#step += 1;
    const step = this.#step;
    const settled = new Promise<boolean>((resolve) => {
      this.#resolve = resolve;
    });
    if (!this.#wrap) {
      this.#lay(value, step);
      return settled;
    }
    // A paragraph: its words as text first, hidden in the cell, read where
    // they wrap once laid out; the box takes their size in that layout.
    const from = this.#from;
    const toProbe = probe(value);
    const fromProbe = from === null ? null : probe(from);
    const probes = fromProbe ? [toProbe, fromProbe] : [toProbe];
    this.#root.prepend(...probes);
    this.#pending = probes;
    this.#watch(toProbe, () => {
      const to = linesIn(toProbe, value);
      const was = fromProbe && from !== null ? linesIn(fromProbe, from) : null;
      return () => {
        // Each layer takes its text's place on the same lines: no change
        // of size, said so to a `morph()` around it (`data-in-place`).
        for (const one of probes) {
          one.dataset.inPlace = "";
          one.remove();
        }
        this.#pending = [];
        if (was !== null) {
          this.#from = null;
          this.#current = layer(segmentText(was, LOCALE, true));
          this.#current.el.dataset.inPlace = "";
          this.#root.prepend(this.#current.el);
        }
        this.#lay(to, step, true);
      };
    });
    return settled;
  }

  #watch(el: Element, read: Read): void {
    this.#watched = el;
    onceLaidOut(el, () => {
      this.#watched = null;
      return read();
    });
  }

  /** A step not yet read gives way to the one coming: its writes out. */
  #drop(): void {
    if (this.#watched) {
      forget(this.#watched);
      this.#watched = null;
    }
    for (const el of this.#pending) {
      el.remove();
    }
    this.#pending = [];
    this.#resolve?.(false);
    this.#resolve = null;
  }

  /**
   * The new words as a layer before the drawn ones, matched against them
   * by each letter's id; read once laid out. A word that stays but now
   * matches letter by letter is split into its letters where it stands
   * (`#split`) first, so each letter is drawn, and leaves or glides, from
   * where the word had it.
   */
  #lay(value: string, step: number, inPlace = false): void {
    const current = this.#current;
    let segments: Segment[];
    if (this.#fade || !current) {
      segments = segmentText(value, LOCALE, true);
    } else {
      const diff = diffSegments(current.segments, value, LOCALE, {
        numbers: true,
      });
      ({ segments } = diff);
      for (const [id, pieces] of diff.splits) {
        this.#split(current, id, pieces);
      }
    }
    const next = layer(segments);
    if (inPlace) {
      next.el.dataset.inPlace = "";
    }
    this.#root.prepend(next.el);
    this.#pending = [next.el];
    // Read once a letter is laid out: a letter stands deeper than the
    // paragraph's text a delivery ago, so the same frame's next delivery
    // reaches it.
    const [first] = next.letters.values();
    const [drawnFirst] = current?.letters.values() ?? [];
    this.#watch(first ?? drawnFirst ?? next.el, () => {
      if (step !== this.#step) {
        return;
      }
      const reads = this.#read(next);
      return () => this.#run(next, reads, step);
    });
  }

  /**
   * The drawn word `id` as its letters, in its place in `drawn`'s layer:
   * each moves as the word was moving (its glide and fade in flight carried
   * over on the same clock), so nothing drawn changes.
   */
  #split(drawn: Layer, id: string, pieces: Segment[]): void {
    const whole = drawn.letters.get(id);
    if (!whole) {
      return;
    }
    const els = pieces.map(make);
    const carried = this.#clock.filter(
      (animation) =>
        (animation.effect as KeyframeEffect | null)?.target === whole
    );
    whole.replaceWith(...els);
    drawn.letters.delete(id);
    for (const [i, piece] of pieces.entries()) {
      const el = els[i];
      if (isBreak(el)) {
        continue;
      }
      drawn.letters.set(piece.id, el);
      for (const animation of carried) {
        const effect = animation.effect as KeyframeEffect;
        const copy = el.animate(effect.getKeyframes(), effect.getTiming());
        copy.startTime = animation.startTime;
        this.#clock.push(copy);
      }
    }
  }

  /**
   * Every box the step needs, read in one go: where each letter drawn
   * stands now (mid-step, its glide included) and how opaque, and where the
   * new letters are laid. With no step running every letter stands at full
   * opacity, and its style is not asked.
   */
  #read(next: Layer): Reads {
    const origin = this.#root.getBoundingClientRect();
    const running = this.#clock.length > 0;
    const drawn = new Map<HTMLElement, Drawn>();
    for (const one of [this.#current, ...this.#old]) {
      for (const el of one?.letters.values() ?? []) {
        if (el.style.visibility !== "hidden") {
          drawn.set(el, drawnNow(el, origin, running));
        }
      }
    }
    const laid = new Map<HTMLElement, { x: number; y: number }>();
    let width = 0;
    let height = 0;
    for (const el of next.letters.values()) {
      const at = el.getBoundingClientRect();
      laid.set(el, { x: at.left - origin.left, y: at.top - origin.top });
      width = Math.max(width, at.right - origin.left);
      height = Math.max(height, at.bottom - origin.top);
    }
    // The new words fill the box: the plain text that returns once the
    // step settles stands in the box as it is drawn.
    this.landsInPlace =
      Math.abs(width - origin.width) <= SAME_PX &&
      Math.abs(height - origin.height) <= SAME_PX;
    return { drawn, laid };
  }

  /** Every animation of the step, on one start, duration and curve. */
  #run(next: Layer, { drawn, laid }: Reads, step: number): void {
    for (const animation of this.#clock) {
      animation.cancel();
    }
    const timing: KeyframeAnimationOptions = {
      duration: this.#duration,
      easing: this.#easing,
      fill: "both",
    };
    const clock: Animation[] = [];
    const run: Run = (el, keyframes) => {
      clock.push(el.animate(keyframes, timing));
    };
    const current = this.#current;
    /** The drawn letters the new words take over: hidden, not leaving. */
    const taken = new Set<HTMLElement>();
    for (const [id, el] of next.letters) {
      const at = laid.get(el);
      const kept = this.#fade ? undefined : current?.letters.get(id);
      const was = kept && drawn.get(kept);
      if (kept && was && at) {
        taken.add(kept);
        glide(el, was, at, run);
        continue;
      }
      arrive(el, run, this.#fade);
    }
    for (const [el, was] of drawn) {
      // One taken over, or one already gone (a letter that left a step ago).
      if (taken.has(el) || was.opacity === 0) {
        el.style.visibility = "hidden";
      } else {
        go(el, was, run, this.#fade);
      }
    }
    const start = document.timeline.currentTime;
    for (const animation of clock) {
      animation.startTime = start;
    }
    if (current) {
      this.#old.unshift(current);
    }
    this.#current = next;
    this.#pending = [];
    this.#clock = clock;
    const resolve = this.#resolve;
    Promise.all(clock.map((animation) => animation.finished)).then(
      () => {
        if (step !== this.#step) {
          return;
        }
        this.#resolve = null;
        resolve?.(true);
      },
      () => {
        if (step === this.#step) {
          this.#resolve = null;
          resolve?.(false);
        }
      }
    );
  }
}
