/**
 * The two text changes the preview makes, from transitions.dev's recipes,
 * on the house's tokens, played as Web Animations so a change starts on the
 * frame it is asked for and waits on no timer:
 *
 * - `TextMorph` (transitions.dev "Text morph", 33-text-morph.md): the
 *   letters two texts share at their start and end stay; only the part that
 *   differs cross-blurs (old out, new in, `--dur-morph`, 2px blur) while its
 *   width eases to the new part's (`--dur-pop`), on `--ease-out`.
 * - `TextSwap` (transitions.dev "Text states swap", 04-text-states-swap.md):
 *   texts that share nothing; the old exits up 4px with a 2px blur and fades
 *   over `--dur-exit`, then the new enters from 4px below over the same, on
 *   `--ease-crossfade` (CSS ease-in-out, the recipe's curve).
 *
 * Each is a job of phases (`prepare` reads, `lay` writes, `measure` reads,
 * `start` animates), so a page changing several texts in one frame lays
 * itself out once for all of them.
 */

const BLUR = "blur(2px)";
const CLEAR = "blur(0px)";

/** A run of the change, kept until it lands, then the plain text put back. */
function landing(host, text, runs, step, current) {
  Promise.all(runs.map((run) => run.finished)).then(
    () => {
      if (step === current()) {
        host.textContent = text;
      }
    },
    () => undefined
  );
  return runs;
}

export class TextMorph {
  #host;
  #text;
  #step = 0;

  constructor(host) {
    this.#host = host;
    this.#text = host.textContent.trim();
  }

  get text() {
    return this.#text;
  }

  put(text) {
    this.#step += 1;
    this.#text = text;
    this.#host.textContent = text;
  }

  /** The morph to `next` (null when nothing changes), with `timing` { delay, morph, resize, easing }. */
  prepare(next, timing) {
    const prev = this.#text;
    if (prev === next) {
      return null;
    }
    let a = 0;
    while (a < prev.length && a < next.length && prev[a] === next[a]) {
      a += 1;
    }
    let b = 0;
    while (
      b < prev.length - a &&
      b < next.length - a &&
      prev[prev.length - 1 - b] === next[next.length - 1 - b]
    ) {
      b += 1;
    }
    const host = this.#host;
    let swap = null;
    let out = null;
    let inn = null;
    let widths = [0, 0];
    let step = 0;
    return {
      lay: () => {
        this.#step += 1;
        step = this.#step;
        this.#text = next;
        swap = document.createElement("span");
        swap.className = "t-morph-swap";
        out = document.createElement("span");
        out.className = "t-morph-old";
        out.setAttribute("aria-hidden", "true");
        out.textContent = prev.slice(a, prev.length - b);
        inn = document.createElement("span");
        inn.className = "t-morph-new";
        inn.textContent = next.slice(a, next.length - b);
        swap.append(out, inn);
        host.replaceChildren(next.slice(0, a), swap, next.slice(next.length - b));
      },
      measure: () => {
        // Layout widths (offsetWidth), not drawn ones: a frame drawn at a scale draws the morph at it.
        widths = [out.offsetWidth, inn.offsetWidth];
      },
      start: () => {
        const fade = { delay: timing.delay, duration: timing.morph, easing: timing.easing, fill: "both" };
        const runs = [
          out.animate(
            [
              { opacity: 1, filter: CLEAR },
              { opacity: 0, filter: BLUR },
            ],
            fade
          ),
          inn.animate(
            [
              { opacity: 0, filter: BLUR },
              { opacity: 1, filter: CLEAR },
            ],
            fade
          ),
          swap.animate([{ width: `${widths[0]}px` }, { width: `${widths[1]}px` }], {
            ...fade,
            duration: timing.resize,
          }),
        ];
        return landing(host, next, runs, step, () => this.#step);
      },
    };
  }
}

export class TextSwap {
  #host;
  #text;
  #step = 0;

  constructor(host) {
    this.#host = host;
    this.#text = host.textContent.trim();
  }

  get text() {
    return this.#text;
  }

  put(text) {
    this.#step += 1;
    this.#text = text;
    this.#host.textContent = text;
  }

  /** The swap to `next` (null when nothing changes), with `timing` { delay, duration, easing, lift }. */
  prepare(next, timing) {
    const prev = this.#text;
    if (prev === next) {
      return null;
    }
    const host = this.#host;
    let old = null;
    let neu = null;
    let step = 0;
    return {
      lay: () => {
        this.#step += 1;
        step = this.#step;
        this.#text = next;
        old = document.createElement("span");
        old.className = "t-swap-old";
        old.setAttribute("aria-hidden", "true");
        old.textContent = prev;
        neu = document.createElement("span");
        neu.className = "t-swap-new";
        neu.textContent = next;
        host.replaceChildren(old, neu);
      },
      measure: () => undefined,
      start: () => {
        const { delay, duration, easing, lift } = timing;
        const runs = [
          old.animate(
            [
              { opacity: 1, transform: "none", filter: CLEAR },
              { opacity: 0, transform: `translateY(-${lift})`, filter: BLUR },
            ],
            { delay, duration, easing, fill: "both" }
          ),
          neu.animate(
            [
              { opacity: 0, transform: `translateY(${lift})`, filter: BLUR },
              { opacity: 1, transform: "none", filter: CLEAR },
            ],
            { delay: delay + duration, duration, easing, fill: "both" }
          ),
        ];
        return landing(host, next, runs, step, () => this.#step);
      },
    };
  }
}
