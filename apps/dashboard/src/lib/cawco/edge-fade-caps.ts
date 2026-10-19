/**
 * The house edge fade kept off every line drawn whole (DESIGN.md, Edge
 * fade; app.css `.kit-edge-fade-block` and its `--fade-cap-start` and
 * `--fade-cap-end`, as the tabs track cuts its fades short at the chosen
 * tab): each edge's fade reaches in only as far as the line or mark that
 * edge cuts, so a line standing whole in the scroller is in full ink, at
 * rest, while it scrolls and while it moves, and a line the edge cuts fades
 * across what shows of it. Where an edge falls between lines, that edge
 * fades nothing.
 *
 * A line's place in what scrolls does not change as it scrolls, so each
 * run of words (an element holding words of its own) and each mark is read
 * once where it stands, every line of it, in the scroller's own pixels,
 * and a scroll reads nothing of the page but how far it has scrolled: what
 * each edge cuts is worked out from the places kept. Every line is read
 * again when the lines may all have moved: a fold's state changed, the
 * scroller or what it holds changed size, the fonts settled, or a run of
 * motion ended (a CSS transition or animation by its end event rising to
 * the list; a script's run, a component's transition or a list's reflow,
 * by its `finished`, the list asked for those once after its nodes or a
 * fold's state change). While a run of motion plays, each frame reads the
 * places again, and once more on the frame after it is held (paused),
 * where it was held; a held run is watched until it ends, to be seen
 * played again.
 *
 * Nodes or words changed in place (a clock's second, a glyph swapped, a
 * row's state) read again only the runs they touched, as the
 * MutationObserver's records name them: a line they push along moves only
 * as the content's height changes or as a run they touched now stands
 * elsewhere, and either has every line read again. A run of motion that
 * can move no line kept reads nothing: paint alone (a fade, a colour, a
 * ring's stroke), and a transform, or a box out of the flow changing its
 * size, that holds no line kept (a progress line's fill, a sweep's band)
 * moves only itself. Each run is asked that once.
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

/**
 * What a run can change and move only its own box and what it holds,
 * never the flow around it.
 */
const TRANSFORMS = new Set(["rotate", "scale", "transform", "translate"]);

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

/** Whether `el` is or holds what an edge can cut: it stops at the first word or mark it finds. */
function holdsLines(el: Element): boolean {
  if (el.matches(MARKS)) {
    return true;
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (WORD.test((text as Text).data)) {
      return true;
    }
  }
  return el.querySelector(MARKS) !== null;
}

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

/** A transitioned property, if it changes more than paint. */
const pastPaintIn = (property: string): string[] =>
  PAINT.has(property) ? [] : [property];

/**
 * What a run's frames change past paint, as CSS names it; null for a run
 * whose frames cannot be read (a script's own effect), which may change
 * anything.
 */
function pastPaint(run: Animation): string[] | null {
  if (run instanceof CSSTransition) {
    return pastPaintIn(run.transitionProperty);
  }
  if (!(run.effect instanceof KeyframeEffect)) {
    return null;
  }
  const changed = new Set<string>();
  for (const keyframe of run.effect.getKeyframes()) {
    for (const key of Object.keys(keyframe)) {
      const name = cssName(key);
      if (!(TIMING.has(key) || PAINT.has(name))) {
        changed.add(name);
      }
    }
  }
  return [...changed];
}

/**
 * A run of a set length on the page's clock: one that ends, and leaves its
 * lines where they will stand.
 */
function ends(run: Animation): boolean {
  const end = run.effect?.getComputedTiming().endTime;
  return (
    run.timeline === document.timeline &&
    typeof end === "number" &&
    Number.isFinite(end)
  );
}

/** Whether a run's top and foot, line by line, span what they spanned: none taller or shorter, none come or gone. */
function sameSpan(was: number[], now: number[]): boolean {
  const span = (lines: number[]) => {
    let top = Number.POSITIVE_INFINITY;
    let foot = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < lines.length; i += 2) {
      top = Math.min(top, lines[i] ?? 0);
      foot = Math.max(foot, lines[i + 1] ?? 0);
    }
    return { top, foot };
  };
  if (was.length !== now.length) {
    return false;
  }
  if (now.length === 0) {
    return true;
  }
  const before = span(was);
  const after = span(now);
  return (
    Math.abs(before.top - after.top) < 0.5 &&
    Math.abs(before.foot - after.foot) < 0.5
  );
}

/** What a change in the list can move: words alone, its nodes, or a fold's lines on its own clock. */
type Change = "fold" | "nodes" | "words";

/** The wider a change, the more it may have moved. */
const WIDTH: Record<Change, number> = { words: 0, nodes: 1, fold: 2 };

/**
 * Takes in what the records changed: each node that came or went, and all
 * under it, as it stands now (a node moved within the list is gone from one
 * record and come in another, and stays kept either way), and each
 * element whose own words were reworded in place, each passed to `touch`.
 * Says what changed, the widest first: a fold's state (its lines move on
 * its own clock), the list's nodes (which a script's run may move), or
 * words alone.
 */
function takeIn(
  records: MutationRecord[],
  touch: (el: Element | null) => void
): Change {
  let changed: Change = "words";
  for (const record of records) {
    const one = takeOne(record, touch);
    if (WIDTH[one] > WIDTH[changed]) {
      changed = one;
    }
  }
  return changed;
}

/** What one record changed, each element it names passed to `touch`. */
function takeOne(
  record: MutationRecord,
  touch: (el: Element | null) => void
): Change {
  const { target } = record;
  if (record.type === "characterData") {
    touch(target.parentElement);
    return "words";
  }
  if (record.type === "childList") {
    for (const one of [...record.removedNodes, ...record.addedNodes]) {
      if (one instanceof Element) {
        eachUnder(one, touch);
      }
    }
    touch(target instanceof Element ? target : null);
    return "nodes";
  }
  if (record.attributeName === "inert" && target instanceof Element) {
    // Inert moves no box: it says whether the lines under it are drawn.
    eachUnder(target, touch);
    return "nodes";
  }
  return "fold";
}

/**
 * How far in from each edge what it cuts reaches, in the scroller's pixels,
 * with the scroller scrolled to `top` and `height` tall: both edges stand
 * in what scrolls at `top` and `top + height`.
 */
function reachAt(
  places: Iterable<number[]>,
  top: number,
  height: number
): { end: number; start: number } {
  const foot = top + height;
  let start = 0;
  let end = 0;
  for (const lines of places) {
    for (let i = 0; i < lines.length; i += 2) {
      const from = lines[i] ?? 0;
      const to = lines[i + 1] ?? 0;
      if (from < top - SLACK && to > top) {
        start = Math.max(start, to - top);
      }
      if (to > foot + SLACK && from < foot) {
        end = Math.max(end, foot - from);
      }
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
  /** Each run's lines (a mark's box), top and foot in turn, in what scrolls, in the scroller's pixels. */
  const places = new Map<Element, number[]>();
  /** The runs whose nodes or words changed in place since the last frame read. */
  const touched = new Set<Element>();
  /** The content's height when the places were read: a line moved by a change in place changes it, or moves a run touched. */
  let tall = 0;
  /** The runs already asked whether they move a line. */
  const awaited = new WeakSet<Animation>();
  /** The script's and the CSS animations' runs moving lines in the list, each until it ends, held or playing. */
  const moving = new Set<Animation>();
  /** Whether any of `moving` played at the last frame read. */
  let played = false;
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
  /**
   * Whether changing `changed` on `target` (or its pseudo-element) can move
   * a line the list keeps: a box moves and sizes what it holds, and moves
   * the flow around it only while it stands in the flow and changes more
   * than a transform ("flow": as its style says). Null changes may be
   * anything.
   */
  const reachOf = (
    target: Element,
    pseudo: string | null,
    changed: string[] | null
  ): "flow" | "no" | "yes" => {
    if (changed === null) {
      return "yes";
    }
    if (changed.length === 0) {
      return "no";
    }
    if (!pseudo && holdsLines(target)) {
      return "yes";
    }
    return changed.every((name) => TRANSFORMS.has(name)) ? "no" : "flow";
  };
  /** Whether `target` (or its pseudo-element) stands in the flow, as its style says. */
  const inFlow = (target: Element, pseudo: string | null): boolean => {
    const { position } = getComputedStyle(target, pseudo || null);
    return position !== "absolute" && position !== "fixed";
  };
  const reaches = (
    target: Element,
    pseudo: string | null,
    changed: string[] | null
  ): boolean => {
    const reach = reachOf(target, pseudo, changed);
    return reach === "yes" || (reach === "flow" && inFlow(target, pseudo));
  };
  /**
   * Transitions begun on a box that holds no line, kept until the frame's
   * read asks whether it stands in the flow: a style asked as the event
   * comes would recount the page's style mid-frame.
   */
  const unsure = new Map<Element, Map<string, string>>();
  /** Adds a transition's key to the lines' slides. */
  const slide = (target: Element, key: string) => {
    sliding.set(target, (sliding.get(target) ?? new Set()).add(key));
  };
  /** Whether a run can move a line the list keeps. */
  const movesKept = (run: Animation): boolean => {
    const { effect } = run;
    if (!(effect instanceof KeyframeEffect)) {
      return true;
    }
    return effect.target
      ? reaches(effect.target, effect.pseudoElement, pastPaint(run))
      : false;
  };
  /** A transition that can move a line kept started: the lines move until it ends. */
  const slides = (event: Event) => {
    const { target } = event;
    if (!(target instanceof Element && event instanceof TransitionEvent)) {
      return;
    }
    const reach = reachOf(
      target,
      event.pseudoElement,
      pastPaintIn(event.propertyName)
    );
    if (reach === "no") {
      return;
    }
    if (reach === "yes") {
      slide(target, transitionKey(event));
    } else {
      unsure.set(
        target,
        (unsure.get(target) ?? new Map()).set(
          transitionKey(event),
          event.pseudoElement
        )
      );
    }
    again();
  };
  const slid = (event: Event) => {
    const { target } = event;
    if (!(target instanceof Element && event instanceof TransitionEvent)) {
      return;
    }
    const key = transitionKey(event);
    const asked = unsure.get(target);
    if (asked?.delete(key) && asked.size === 0) {
      unsure.delete(target);
    }
    const keys = sliding.get(target);
    if (keys?.delete(key)) {
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
  const playing = (): boolean => {
    for (const run of moving) {
      if (run.playState === "running") {
        return true;
      }
    }
    return false;
  };
  /** Whether a run that moves lines is under way in the list, playing or held. */
  const inMotion = (): boolean => {
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

  /** A reader of where runs stand in what scrolls, as the scroller stands now. */
  const reader = () => {
    const box = node.getBoundingClientRect();
    // In the scroller's pixels: a canvas or a zoomed page draws it scaled.
    const scale = box.height / (node.offsetHeight || box.height) || 1;
    const scrolled = node.scrollTop;
    const range = document.createRange();
    return (el: Element): number[] => {
      const lines: number[] = [];
      boxesOf(el, range, (one) => {
        lines.push(
          (one.top - box.top) / scale + scrolled,
          (one.bottom - box.top) / scale + scrolled
        );
      });
      return lines;
    };
  };
  /** Where each line and mark stands in what scrolls. */
  const place = () => {
    const linesOf = reader();
    places.clear();
    touched.clear();
    tall = node.scrollHeight;
    for (const el of runs) {
      places.set(el, linesOf(el));
    }
  };
  /**
   * Reads again the runs a change in place touched, a run come read and a
   * run gone let go; says false, with every line still to read, where the
   * content's height changed or a run that stayed now spans more or less,
   * or stands elsewhere.
   */
  const placeTouched = (): boolean => {
    if (touched.size === 0) {
      return true;
    }
    if (node.scrollHeight !== tall) {
      return false;
    }
    const linesOf = reader();
    for (const el of touched) {
      const was = places.get(el);
      const now = runs.has(el) ? linesOf(el) : undefined;
      if (was && now && !sameSpan(was, now)) {
        return false;
      }
      if (now) {
        places.set(el, now);
      } else {
        places.delete(el);
      }
    }
    touched.clear();
    return true;
  };

  /** Asks the list for its runs: each new one that ends and can move a line kept is watched until it does. */
  const askRuns = () => {
    for (const run of node.getAnimations({ subtree: true })) {
      if (awaited.has(run) || run.playState !== "running") {
        continue;
      }
      awaited.add(run);
      if (ends(run) && movesKept(run)) {
        moving.add(run);
        const done = () => {
          moving.delete(run);
          shifted();
        };
        run.finished.then(done, done);
      }
    }
  };
  /**
   * With the frame's style counted, each transition begun on a box that
   * holds no line moves the lines only from where it stands in the flow.
   */
  const settleUnsure = () => {
    for (const [target, keys] of unsure) {
      if (!node.contains(target)) {
        continue;
      }
      for (const [key, pseudo] of keys) {
        if (inFlow(target, pseudo)) {
          slide(target, key);
        }
      }
    }
    unsure.clear();
  };

  const self: Capped = {
    read() {
      if (stirred) {
        stirred = false;
        askRuns();
      }
      const height = node.offsetHeight;
      if (height === 0) {
        return;
      }
      settleUnsure();
      // While lines move, each frame reads where they stand now, and the
      // frame after a run is held reads where it was held; a change in place
      // reads the runs it touched alone.
      const plays = playing();
      if (moved || plays || played || sliding.size > 0 || !placeTouched()) {
        moved = false;
        place();
      }
      played = plays;
      const reach = reachAt(places.values(), node.scrollTop, height);
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
  /** Keeps `el` as `recheck` does and, a run now or before, has the next frame read its lines again. */
  const touch = (el: Element | null) => {
    if (!el || el === node) {
      return;
    }
    recheck(el);
    if (runs.has(el) || places.has(el)) {
      touched.add(el);
    }
  };
  const changes = new MutationObserver((records) => {
    const changed = takeIn(records, touch);
    if (changed !== "words") {
      stirred = true;
      watchSizes();
    }
    if (changed === "fold") {
      shifted();
    } else {
      again();
    }
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
