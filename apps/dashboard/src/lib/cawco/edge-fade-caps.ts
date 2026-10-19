/**
 * The house edge fade kept off every line drawn whole (DESIGN.md, Edge
 * fade; app.css `.kit-edge-fade-block` and its `--fade-cap-start` and
 * `--fade-cap-end`, as the tabs track cuts its fades short at the chosen
 * tab): each edge's fade reaches in only as far as the line or mark that
 * edge cuts, so a line standing whole in the scroller is in full ink, at
 * rest and while it scrolls, and a line the edge cuts fades across what
 * shows of it. Where an edge falls between lines, that edge fades nothing.
 *
 * What an edge cuts is found without reading every line: an
 * IntersectionObserver rooted on the scroller watches each run of words
 * (an element holding words of its own) and each mark, at the thresholds 0
 * and 1, so it says when one comes to stand partly inside, an edge across
 * it, and when it stops. Those few are the only candidates, read again on
 * each scroll, each resize and each crossing.
 *
 * What it watches is kept from what changed: the MutationObserver's records
 * name the nodes that came, went or were reworded, and only those are
 * looked at again, never the whole list.
 *
 * A run of motion (a row's slide, a fold's height) moves lines with no
 * scroll to say so, and where it leaves them is read when it ends: a CSS
 * transition or animation says so itself, its end event rising to the
 * list; a script's run (a component's transition, a list's reflow) starts
 * with the list's nodes or a fold's state changing, so the next frame after
 * such a change asks the list once for its runs and each says when it ends
 * through its `finished`. No frame is read only because something moves:
 * between a run's start and its end, the crossings it makes are read as
 * they happen.
 *
 * Every capped list on the page is read in one frame and then written,
 * reads before writes, so one list's caps never force the next list's
 * style.
 */
import type { Attachment } from "svelte/attachments";

/** How far in from each edge what it cuts reaches, drawn. */
interface Reach {
  end: number;
  start: number;
}

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
 * How far past an edge a run may stand and still be drawn whole, in drawn
 * pixels: a row come to rest a fraction of a pixel over the foot shows all
 * its ink, and a fade across it would wash a whole line out.
 */
const SLACK = 1;

/** A word's worth of text: anything but space. */
const WORD = /\S/;

/** The end of a CSS run, rising from the element it ran on. */
const ENDS = [
  "animationcancel",
  "animationend",
  "transitioncancel",
  "transitionend",
] as const;

/** Whether an edge of `box` cuts the run from `top` to `bottom`. */
const crosses = (box: DOMRect, top: number, bottom: number): boolean =>
  top < box.bottom &&
  bottom > box.top &&
  (top < box.top - SLACK || bottom > box.bottom + SLACK);

/** Drawn: a shut fold's words are inert and transparent, a reader's own clipped to a pixel. */
const drawn = (el: Element, width: number): boolean =>
  width > 1 &&
  !el.closest("[inert]") &&
  el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

/** Takes in a run an edge of `box` cuts: what shows of it inside that edge. */
function cut(reach: Reach, box: DOMRect, top: number, bottom: number): void {
  if (top < box.top - SLACK) {
    reach.start = Math.max(reach.start, bottom - box.top);
  }
  if (bottom > box.bottom + SLACK) {
    reach.end = Math.max(reach.end, box.bottom - top);
  }
}

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

/** Takes in what `el` shows that an edge of `box` cuts: each of its lines of words, or its box as a mark. */
function cutOf(el: Element, box: DOMRect, reach: Reach, range: Range): void {
  const held = el.getBoundingClientRect();
  if (!(crosses(box, held.top, held.bottom) && drawn(el, held.width))) {
    return;
  }
  if (!holdsWords(el)) {
    cut(reach, box, held.top, held.bottom);
    return;
  }
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== Node.TEXT_NODE) {
      continue;
    }
    range.selectNodeContents(child);
    for (const line of range.getClientRects()) {
      if (line.height > 0 && crosses(box, line.top, line.bottom)) {
        cut(reach, box, line.top, line.bottom);
      }
    }
  }
}

/** A run of a set length on the page's clock: one that ends, and leaves its lines where they will stand. */
function ends(run: Animation): boolean {
  const end = run.effect?.getComputedTiming().endTime;
  return (
    run.timeline === document.timeline &&
    typeof end === "number" &&
    Number.isFinite(end)
  );
}

/**
 * Takes in what the records changed: each node that came or went, and all
 * under it, as it stands now (a node moved within the list is gone from one
 * record and come in another, and stays watched either way), and each
 * element whose own words came, went or were reworded. Says whether the
 * list's nodes or a fold's state changed, which a script's run may move.
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
  /** What stands partly inside the scroller now, an edge across it. */
  const partly = new Set<Element>();
  /** Every run of words and mark in the list, each observed. */
  const watched = new Set<Element>();
  /** The runs whose end is already awaited. */
  const awaited = new WeakSet<Animation>();
  /** The list's nodes or a fold changed: the next frame asks the list for its runs. */
  let stirred = false;
  /** Attached: a run ending after the list is gone asks no frame. */
  let live = true;
  const again = () => {
    if (live) {
      ask(self);
    }
  };

  const self: Capped = {
    read() {
      if (stirred) {
        stirred = false;
        for (const run of node.getAnimations({ subtree: true })) {
          if (!awaited.has(run) && ends(run)) {
            awaited.add(run);
            run.finished.then(again, again);
          }
        }
      }
      const box = node.getBoundingClientRect();
      if (box.height === 0) {
        return;
      }
      // In layout pixels: a canvas or a zoomed page draws the box scaled.
      const scale = box.height / (node.offsetHeight || box.height);
      const reach: Reach = { start: 0, end: 0 };
      const range = document.createRange();
      for (const el of partly) {
        cutOf(el, box, reach, range);
      }
      next.start = `${Math.floor(reach.start / scale)}px`;
      next.end = `${Math.floor(reach.end / scale)}px`;
    },
    write() {
      for (const edge of ["start", "end"] as const) {
        if (next[edge] && written[edge] !== next[edge]) {
          written[edge] = next[edge];
          node.style.setProperty(`--fade-cap-${edge}`, next[edge]);
        }
      }
    },
  };
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio < 1) {
          partly.add(entry.target);
        } else {
          partly.delete(entry.target);
        }
      }
      again();
    },
    { root: node, threshold: [0, 1] }
  );
  /** Watches `el` while it lies in the list and is a run or a mark, and lets it go when not. */
  const recheck = (el: Element | null) => {
    if (!el || el === node) {
      return;
    }
    if (node.contains(el) && cuttable(el)) {
      if (!watched.has(el)) {
        watched.add(el);
        seen.observe(el);
      }
    } else if (watched.delete(el)) {
      seen.unobserve(el);
      partly.delete(el);
    }
  };
  const changes = new MutationObserver((records) => {
    if (takeIn(records, recheck)) {
      stirred = true;
    }
    again();
  });
  // A fold opening or shutting moves the lines under it on its own clock.
  changes.observe(node, {
    attributeFilter: ["aria-expanded", "data-open", "inert"],
    characterData: true,
    childList: true,
    subtree: true,
  });
  for (const type of ENDS) {
    node.addEventListener(type, again);
  }
  // A scroll or a resize moves the candidates across their edge; the
  // observer adds and drops candidates as runs cross the thresholds.
  const sizes = new ResizeObserver(again);
  sizes.observe(node);
  node.addEventListener("scroll", again, { passive: true });
  eachUnder(node, recheck);
  stirred = true;
  again();
  return () => {
    live = false;
    due.delete(self);
    seen.disconnect();
    changes.disconnect();
    sizes.disconnect();
    for (const type of ENDS) {
      node.removeEventListener(type, again);
    }
    node.removeEventListener("scroll", again);
  };
};
