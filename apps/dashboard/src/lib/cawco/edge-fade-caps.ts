/**
 * The house edge fade kept off every line drawn whole (DESIGN.md, Edge
 * fade; app.css `.kit-edge-fade-block` and its `--fade-cap-start` and
 * `--fade-cap-end`, as the tabs track cuts its fades short at the chosen
 * tab): each edge's fade reaches in only as far as the line or mark that
 * edge cuts, so a line standing whole in the scroller is in full ink, at
 * rest and while it scrolls, and a line the edge cuts fades across what
 * shows of it. Where an edge falls between lines, that edge fades nothing.
 *
 * A line's place in what scrolls does not change as it scrolls, so each
 * run of words (an element holding words of its own) and each mark is read
 * once where it stands, every line of it, in the scroller's own pixels,
 * and a scroll reads nothing of the page but how far it has scrolled: what
 * each edge cuts is worked out from the places kept. They are read again
 * only when the lines may have moved: the list's nodes or words changed
 * (the MutationObserver's records name which, and only those are looked
 * at again to know what to read), the scroller or what it holds changed
 * size, the fonts settled, or a run of motion ended (a CSS transition or
 * animation by its end event rising to the list; a script's run, a
 * component's transition or a list's reflow, by its `finished`, the list
 * asked for those once after its nodes or a fold's state change). A run of
 * paint alone (a fade, a colour, a ring's stroke) moves no line, and its end
 * reads nothing. While a run of motion plays, the places kept are where it
 * started.
 *
 * Every capped list on the page is read in one frame and then written,
 * reads before writes, so one list's caps never force the next list's
 * style.
 */
import type { Attachment } from "svelte/attachments";

/** A capped list, as the page's one frame reads and then writes it. */
interface Capped {
  read: () => void;
  write: () => void;
}

/**
 * The marks a row draws beside its words: a glyph, an image, a tile or
 * badge drawn as a box of its own (`data-box`, app.css's mark line). A plan's
 * lanes run the list's length, past both edges, as the list does.
 */
const MARKS =
  ':is(svg, img, [data-box]):not([data-slot="connectors"], [data-slot="connectors"] *)';

/**
 * How far past an edge a line may stand and still be drawn whole, in the
 * scroller's pixels: a row come to rest a fraction of a pixel over the foot
 * shows all its ink, and a fade across it would wash a whole line out.
 */
const SLACK = 1;

/** A word's worth of text: anything but space. */
const WORD = /\S/;

/** A CSS transition's end, rising from the element it ran on. */
const TRANSITION_ENDS = ["transitioncancel", "transitionend"] as const;

/** A CSS animation's end. */
const ANIMATION_ENDS = ["animationcancel", "animationend"] as const;

/**
 * What a run can change and move no line: paint alone, never a box's size
 * or place. Its end leaves every line where it stood. A custom property
 * may feed either, so it counts as moving.
 */
const PAINT = new Set([
  "background-color",
  "border-color",
  "box-shadow",
  "color",
  "fill",
  "filter",
  "opacity",
  "outline-color",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "visibility",
]);

/** Drawn: a shut fold's words are inert and transparent, a reader's own clipped to a pixel. */
const drawn = (el: Element, width: number): boolean =>
  width > 1 &&
  !el.closest("[inert]") &&
  el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

/** Whether `el` holds words of its own, not only in its children. */
function holdsWords(el: Element): boolean {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.TEXT_NODE && WORD.test((child as Text).data)) {
      return true;
    }
  }
  return false;
}

/** What an edge can cut: a run of words or a mark. */
const cuttable = (el: Element): boolean => holdsWords(el) || el.matches(MARKS);

/** `root` and every element under it. */
function eachUnder(root: Element, visit: (el: Element) => void): void {
  visit(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    visit(el as Element);
  }
}

/** Each box `el` draws that an edge can cut, drawn: each of its lines of words, or its box as a mark. */
function boxesOf(el: Element, range: Range, take: (box: DOMRect) => void) {
  const held = el.getBoundingClientRect();
  if (!drawn(el, held.width)) {
    return;
  }
  if (!holdsWords(el)) {
    take(held);
    return;
  }
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== Node.TEXT_NODE) {
      continue;
    }
    range.selectNodeContents(child);
    for (const line of range.getClientRects()) {
      if (line.height > 0) {
        take(line);
      }
    }
  }
}

/** A keyframe's own keys, not a property's. */
const TIMING = new Set(["composite", "computedOffset", "easing", "offset"]);

/** A property as CSS names it: a keyframe's `backgroundColor` is `background-color`. */
const cssName = (key: string): string =>
  key.startsWith("--")
    ? key
    : key.replace(/[A-Z]/g, (cap) => `-${cap.toLowerCase()}`);

/** Whether a run's frames change anything but paint. */
function movesLines(run: Animation): boolean {
  if (run instanceof CSSTransition) {
    return !PAINT.has(run.transitionProperty);
  }
  if (!(run.effect instanceof KeyframeEffect)) {
    return true;
  }
  return run.effect
    .getKeyframes()
    .some((keyframe) =>
      Object.keys(keyframe).some(
        (key) => !(TIMING.has(key) || PAINT.has(cssName(key)))
      )
    );
}

/**
 * A run of a set length on the page's clock that can move a line: one that
 * ends, and leaves its lines where they will stand. A fade ends where it
 * started.
 */
function ends(run: Animation): boolean {
  const end = run.effect?.getComputedTiming().endTime;
  return (
    run.timeline === document.timeline &&
    typeof end === "number" &&
    Number.isFinite(end) &&
    movesLines(run)
  );
}

/**
 * Takes in what the records changed: each node that came or went, and all
 * under it, as it stands now (a node moved within the list is gone from one
 * record and come in another, and stays kept either way), and each element
 * whose own words came, went or were reworded. Says whether the list's
 * nodes or a fold's state changed, which a script's run may move.
 */
function takeIn(
  records: MutationRecord[],
  recheck: (el: Element | null) => void
): boolean {
  let nodes = false;
  for (const record of records) {
    if (record.type === "characterData") {
      recheck(record.target.parentElement);
      continue;
    }
    nodes = true;
    if (record.type === "childList") {
      for (const one of [...record.removedNodes, ...record.addedNodes]) {
        if (one instanceof Element) {
          eachUnder(one, recheck);
        }
      }
      recheck(record.target instanceof Element ? record.target : null);
    }
  }
  return nodes;
}

/**
 * How far in from each edge what it cuts reaches, in the scroller's pixels,
 * with the scroller scrolled to `top` and `height` tall: both edges stand
 * in what scrolls at `top` and `top + height`.
 */
function reachAt(
  tops: number[],
  feet: number[],
  top: number,
  height: number
): { end: number; start: number } {
  const foot = top + height;
  let start = 0;
  let end = 0;
  for (let i = 0; i < tops.length; i += 1) {
    const from = tops[i] ?? 0;
    const to = feet[i] ?? 0;
    if (from < top - SLACK && to > top) {
      start = Math.max(start, to - top);
    }
    if (to > foot + SLACK && from < foot) {
      end = Math.max(end, foot - from);
    }
  }
  return { end, start };
}

/** A CSS transition, as one key on its element: its pseudo-element and its property. */
const transitionKey = (event: TransitionEvent): string =>
  `${event.pseudoElement}:${event.propertyName}`;

/** The lists the next frame reads, then writes. */
const due = new Set<Capped>();
let frame = 0;

function flush(): void {
  frame = 0;
  const now = [...due];
  due.clear();
  for (const one of now) {
    one.read();
  }
  for (const one of now) {
    one.write();
  }
}

/** Asks the next frame to read `one` again. */
function ask(one: Capped): void {
  due.add(one);
  if (!frame) {
    frame = requestAnimationFrame(flush);
  }
}

export const capEdgeFades: Attachment<HTMLElement> = (node) => {
  const written = { start: "", end: "" };
  const next = { start: "", end: "" };
  /** Every run of words and mark in the list. */
  const runs = new Set<Element>();
  /** Each line and mark's top and foot, in what scrolls, in the scroller's pixels. */
  let tops: number[] = [];
  let feet: number[] = [];
  /** The runs already asked whether they move a line. */
  const awaited = new WeakSet<Animation>();
  /** The script's and the CSS animations' runs moving lines in the list, each until it ends. */
  const moving = new Set<Animation>();
  /** The CSS transitions moving lines in the list, by element, each until its end event. */
  const sliding = new Map<EventTarget, Set<string>>();
  /** The lines may have moved: the next frame reads their places again. */
  let moved = true;
  /** The list's nodes or a fold changed: the next frame asks the list for its runs. */
  let stirred = true;
  /** Attached: a run ending after the list is gone asks no frame. */
  let live = true;
  const again = () => {
    if (live) {
      ask(self);
    }
  };
  const shifted = () => {
    moved = true;
    again();
  };
  /** A transition of more than paint started: the lines move until it ends. */
  const slides = (event: Event) => {
    const { target } = event;
    if (
      target &&
      event instanceof TransitionEvent &&
      !PAINT.has(event.propertyName)
    ) {
      sliding.set(
        target,
        (sliding.get(target) ?? new Set()).add(transitionKey(event))
      );
      again();
    }
  };
  const slid = (event: Event) => {
    const { target } = event;
    const keys = target ? sliding.get(target) : undefined;
    if (
      target &&
      event instanceof TransitionEvent &&
      keys?.delete(transitionKey(event))
    ) {
      if (keys.size === 0) {
        sliding.delete(target);
      }
      shifted();
    }
  };
  // A CSS animation starts with no node changed when a class changes: the
  // list is asked for its runs, as after a change of its nodes.
  const animates = () => {
    stirred = true;
    again();
  };
  /** Whether a run that moves lines plays in the list now. */
  const inMotion = (): boolean => {
    for (const run of moving) {
      if (run.playState !== "running") {
        // Held still (a paused clock), it moves nothing; its end still reads.
        moving.delete(run);
      }
    }
    for (const target of sliding.keys()) {
      if (!(target instanceof Node && node.contains(target))) {
        // A node taken out of the list ends its runs with no event to say so.
        sliding.delete(target);
      }
    }
    return moving.size > 0 || sliding.size > 0;
  };
  const events: [string, (event: Event) => void][] = [
    ["transitionrun", slides],
    ...TRANSITION_ENDS.map((type) => [type, slid] as [string, typeof slid]),
    ["animationstart", animates],
    ...ANIMATION_ENDS.map((type) => [type, shifted] as [string, () => void]),
  ];

  /** Where each line and mark stands in what scrolls. */
  const place = () => {
    const box = node.getBoundingClientRect();
    // In the scroller's pixels: a canvas or a zoomed page draws it scaled.
    const scale = box.height / (node.offsetHeight || box.height) || 1;
    const scrolled = node.scrollTop;
    const range = document.createRange();
    tops = [];
    feet = [];
    for (const el of runs) {
      boxesOf(el, range, (one) => {
        tops.push((one.top - box.top) / scale + scrolled);
        feet.push((one.bottom - box.top) / scale + scrolled);
      });
    }
  };

  const self: Capped = {
    read() {
      if (stirred) {
        stirred = false;
        for (const run of node.getAnimations({ subtree: true })) {
          if (!awaited.has(run) && ends(run) && run.playState === "running") {
            awaited.add(run);
            moving.add(run);
            const done = () => {
              moving.delete(run);
              shifted();
            };
            run.finished.then(done, done);
          }
        }
      }
      const height = node.offsetHeight;
      if (height === 0) {
        return;
      }
      // While lines move, each frame reads where they stand now.
      if (moved || moving.size > 0 || sliding.size > 0) {
        moved = false;
        place();
      }
      const reach = reachAt(tops, feet, node.scrollTop, height);
      next.start = `${Math.floor(reach.start)}px`;
      next.end = `${Math.floor(reach.end)}px`;
    },
    write() {
      for (const edge of ["start", "end"] as const) {
        if (next[edge] && written[edge] !== next[edge]) {
          written[edge] = next[edge];
          node.style.setProperty(`--fade-cap-${edge}`, next[edge]);
        }
      }
      if (inMotion()) {
        again();
      }
    },
  };

  /** Keeps `el` while it lies in the list and is a run or a mark, and lets it go when not. */
  const recheck = (el: Element | null) => {
    if (!el || el === node) {
      return;
    }
    if (node.contains(el) && cuttable(el)) {
      runs.add(el);
    } else {
      runs.delete(el);
    }
  };
  const changes = new MutationObserver((records) => {
    if (takeIn(records, recheck)) {
      stirred = true;
      watchSizes();
    }
    shifted();
  });
  // A fold opening or shutting moves the lines under it on its own clock.
  changes.observe(node, {
    attributeFilter: ["aria-expanded", "data-open", "inert"],
    characterData: true,
    childList: true,
    subtree: true,
  });
  for (const [type, on] of events) {
    node.addEventListener(type, on);
  }
  // The scroller's size moves its foot; what it holds changing size moves
  // the lines in it, a line rewrapped or a fold settled.
  const sizes = new ResizeObserver(shifted);
  const watchSizes = () => {
    sizes.observe(node);
    for (const held of node.children) {
      sizes.observe(held);
    }
  };
  watchSizes();
  document.fonts.addEventListener("loadingdone", shifted);
  node.addEventListener("scroll", again, { passive: true });
  eachUnder(node, recheck);
  again();
  return () => {
    live = false;
    due.delete(self);
    changes.disconnect();
    sizes.disconnect();
    for (const [type, on] of events) {
      node.removeEventListener(type, on);
    }
    moving.clear();
    sliding.clear();
    document.fonts.removeEventListener("loadingdone", shifted);
    node.removeEventListener("scroll", again);
  };
};
