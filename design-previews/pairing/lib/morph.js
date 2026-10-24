/**
 * The house MorphText (apps/dashboard/src/lib/components/ui/morph-text), as
 * plain JS for this static preview: torph's matching, the house renderer.
 * One clock per swap (--dur-morph, ease-out); the box held at the larger of
 * the old and new words while the letters cross, so nothing beside it moves.
 *
 * One addition for the preview: `delay`, so a swap that starts later in a
 * moment's table (the readout at 220ms, the title at 240ms) is issued in the
 * same frame as every other part, never from a timer.
 */
import { diffSegments, segmentText } from "./torph.mjs";

const LOCALE = "en";
const SHRINK = "scale(0.95)";
const TRAILING_SPACE = / $/;

const isBreak = (el) => el.tagName === "BR";

function make(segment) {
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

const face = (el) =>
  el.dataset.roll === undefined ? el : (el.firstElementChild ?? el);

function arrive(el, run, fade) {
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

function glide(el, was, at, origin, run) {
  const dx = was.x - (at.left - origin.left);
  const dy = was.y - (at.top - origin.top);
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

function go(el, opacity, run, fade) {
  run(el, [{ opacity }, { opacity: 0 }]);
  if (fade) {
    return;
  }
  if (el.dataset.roll === undefined) {
    run(el, [{ transform: "none" }, { transform: SHRINK }]);
  } else {
    run(face(el), [{ transform: "none" }, { transform: "translateY(-100%)" }]);
  }
}

class Morph {
  #root;
  #segments = [];
  #flow = new Map();
  #leaving = [];
  #pieces = [];
  #box;
  #drawn;
  #value;
  #fade = false;
  #laidOut;
  #origin;
  #laid;
  clock = [];

  constructor(root) {
    this.#root = root;
  }

  show(value, hold) {
    this.#segments = segmentText(value, LOCALE, true);
    this.#flow.clear();
    const els = this.#segments.map((segment) => {
      const el = make(segment);
      this.#flow.set(segment.id, el);
      return el;
    });
    this.#root.replaceChildren(...els);
    this.#hold(hold);
  }

  /*
   * A step in four phases, so a page swapping several texts in one frame
   * reads every box together and writes every letter together (each read
   * after a write lays the page out again): `begin` reads what is drawn,
   * `shift` writes the new letters, `measure` reads where they lay out,
   * `start` runs every animation on one clock.
   */
  begin(value, fade) {
    this.#box = this.#root.getBoundingClientRect();
    this.#drawn = this.#read(this.#box);
    this.#value = value;
    this.#fade = fade;
  }

  shift() {
    const drawn = this.#drawn;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: begin() sets it per step
    if (this.#fade) {
      this.#segments = segmentText(this.#value, LOCALE, true);
      this.#leave(new Set(), drawn);
    } else {
      const { segments, splits } = diffSegments(
        this.#segments,
        this.#value,
        LOCALE,
        {
          numbers: true,
        }
      );
      this.#segments = segments;
      for (const [id, pieces] of splits) {
        this.#split(id, pieces, drawn);
      }
      this.#place(drawn);
      this.#leave(new Set(segments.map((segment) => segment.id)), drawn);
    }
    this.#laidOut = this.#lay(this.#segments);
    this.#hold(this.#box);
  }

  measure() {
    const { flow, arriving } = this.#laidOut;
    this.#origin = this.#root.getBoundingClientRect();
    this.#laid = new Map();
    for (const el of flow) {
      if (!(isBreak(el) || arriving.has(el))) {
        this.#laid.set(el, el.getBoundingClientRect());
      }
    }
  }

  start(timing) {
    const { flow, arriving } = this.#laidOut;
    const drawn = this.#drawn;
    const fade = this.#fade;
    const clock = [];
    const run = (el, keyframes) => {
      clock.push(el.animate(keyframes, { ...timing, fill: "both" }));
    };
    for (const el of flow) {
      if (isBreak(el)) {
        continue;
      }
      if (arriving.has(el)) {
        arrive(el, run, fade);
        continue;
      }
      const was = drawn.get(el);
      const at = this.#laid.get(el);
      if (was && at) {
        glide(el, was, at, this.#origin, run);
      }
    }
    for (const el of this.#leaving) {
      go(el, drawn.get(el)?.opacity ?? 1, run, fade);
    }
    this.clock = clock;
    return clock;
  }

  #place(drawn) {
    const pieces = this.#pieces.splice(0);
    const own = pieces.map(({ el }) => el.getBoundingClientRect());
    const leads = new Map(
      pieces.map(({ first }) => [first, first.getBoundingClientRect()])
    );
    for (const [i, { el, first, was }] of pieces.entries()) {
      const lead = leads.get(first);
      if (lead) {
        drawn.set(el, {
          opacity: was.opacity,
          x: was.x + (own[i].left - lead.left),
          y: was.y + (own[i].top - lead.top),
        });
      }
    }
  }

  #read(box) {
    const drawn = new Map();
    for (const el of [...this.#flow.values(), ...this.#leaving]) {
      if (isBreak(el)) {
        continue;
      }
      const at = el.getBoundingClientRect();
      drawn.set(el, { opacity: 1, x: at.left - box.left, y: at.top - box.top });
    }
    return drawn;
  }

  #split(id, pieces, drawn) {
    const whole = this.#flow.get(id);
    if (!whole) {
      return;
    }
    const was = drawn.get(whole);
    const els = pieces.map(make);
    whole.replaceWith(...els);
    this.#flow.delete(id);
    const [first] = els;
    for (const [i, piece] of pieces.entries()) {
      const el = els[i];
      this.#flow.set(piece.id, el);
      if (was && first && !isBreak(el)) {
        this.#pieces.push({ el, first, was });
      }
    }
  }

  #leave(staying, drawn) {
    for (const [id, el] of this.#flow) {
      if (staying.has(id)) {
        continue;
      }
      this.#flow.delete(id);
      if (!isBreak(el)) {
        this.#leaving.push(el);
      }
    }
    for (const el of this.#leaving) {
      const was = drawn.get(el);
      el.style.position = "absolute";
      el.style.insetInlineStart = `${was?.x ?? 0}px`;
      el.style.insetBlockStart = `${was?.y ?? 0}px`;
    }
  }

  #lay(segments) {
    const arriving = new Set();
    const flow = segments.map((segment) => {
      const kept = this.#flow.get(segment.id);
      if (kept) {
        if (!isBreak(kept) && kept.textContent !== segment.string) {
          face(kept).textContent = segment.string;
        }
        return kept;
      }
      const el = make(segment);
      this.#flow.set(segment.id, el);
      arriving.add(el);
      return el;
    });
    this.#root.replaceChildren(...flow, ...this.#leaving);
    return { flow, arriving };
  }

  #hold(was) {
    this.#root.style.minInlineSize = `${was.width}px`;
    this.#root.style.minBlockSize = `${was.height}px`;
  }
}

/** `text` with a "\n" wherever it wraps in `host` at `width`. */
function brokenAt(host, width, text) {
  const probe = host.cloneNode(false);
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;inset-inline-start:0;inset-block-start:0;inline-size:${width}px`;
  probe.textContent = text;
  host.parentElement.append(probe);
  const node = probe.firstChild;
  const range = document.createRange();
  let out = "";
  let top = null;
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
  probe.remove();
  return out;
}

/**
 * A MorphText on `host` (a block when `wrap`). `set(text, { delay })`
 * morphs to `text` from what is drawn; `put(text)` lands it with no morph.
 * Answers the swap's animations, all on one start, duration and curve.
 */
export class MorphText {
  #host;
  #wrap;
  #text;
  #step = 0;
  #morph = null;

  constructor(host, { wrap = false } = {}) {
    this.#host = host;
    this.#wrap = wrap;
    this.#text = host.textContent;
  }

  get text() {
    return this.#text;
  }

  put(text) {
    this.#step += 1;
    for (const run of this.#morph?.clock ?? []) {
      run.cancel();
    }
    this.#morph = null;
    this.#text = text;
    this.#host.textContent = text;
  }

  /**
   * The swap to `text` as a job of phases (see Morph): `prepare` reads now;
   * then `lay`, `read`, `shift`, `measure` and `start` in turn, each phase
   * run for every job on the page before the next. Null when nothing changes.
   */
  prepare(text, { delay = 0, duration, easing, fade = false }) {
    if (text === this.#text) {
      return null;
    }
    const host = this.#host;
    const was = this.#text;
    const box = host.getBoundingClientRect();
    const from = this.#wrap ? brokenAt(host, box.width, was) : was;
    const to = this.#wrap ? brokenAt(host, box.width, text) : text;
    let morph = null;
    let step = 0;
    return {
      lay: () => {
        for (const run of this.#morph?.clock ?? []) {
          run.cancel();
        }
        this.#step += 1;
        step = this.#step;
        this.#text = text;
        const letters = document.createElement("span");
        letters.className = "morph-letters";
        letters.setAttribute("aria-hidden", "true");
        const said = document.createElement("span");
        said.className = "sr-only";
        said.textContent = text;
        host.replaceChildren(letters, said);
        morph = new Morph(letters);
        morph.show(from, {
          width: box.width,
          height: this.#wrap ? box.height : 0,
        });
        this.#morph = morph;
      },
      read: () => morph.begin(to, fade),
      shift: () => morph.shift(),
      measure: () => morph.measure(),
      start: () => {
        const clock = morph.start({ delay, duration, easing });
        Promise.all(clock.map((run) => run.finished)).then(
          () => {
            if (step === this.#step) {
              this.#morph = null;
              host.textContent = text;
            }
          },
          () => undefined
        );
        return clock;
      },
    };
  }

  /** The whole swap at once, for a lone change. */
  set(text, options) {
    const job = this.prepare(text, options);
    if (!job) {
      return [];
    }
    job.lay();
    job.read();
    job.shift();
    job.measure();
    return job.start();
  }
}
