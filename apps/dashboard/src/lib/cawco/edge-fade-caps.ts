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
 * it, and when it stops. Those few are the only candidates. A frame reads
 * the scroller's box and the candidates' line boxes, then writes the two
 * caps: reads before writes, nothing else read. The tree is walked for runs
 * and marks only when the list's own nodes change, never on a scroll. After
 * such a change (a row arriving, a fold opening), while motion of a set
 * length runs in the list, a frame reads again until it ends: a transform
 * moves a line past an edge without a scroll, a resize or a mutation to say
 * so. A scroll's frames never ask after the list's motion.
 */
import type { Attachment } from "svelte/attachments";

/** How far in from each edge what it cuts reaches, drawn. */
interface Reach {
  end: number;
  start: number;
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
const holdsWords = (el: Element): boolean =>
  [...el.childNodes].some(
    (child) => child.nodeType === Node.TEXT_NODE && !!child.textContent?.trim()
  );

/** Each run of words and each mark in `node`: what an edge can cut. */
function cuttable(node: HTMLElement): Set<Element> {
  const found = new Set<Element>(node.querySelectorAll(MARKS));
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    if (holdsWords(el as Element)) {
      found.add(el as Element);
    }
  }
  return found;
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
  for (const child of el.childNodes) {
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

/** Motion of a set length running in `node` on the page's clock: what moves a line without a scroll. */
const moving = (node: HTMLElement): boolean =>
  node.getAnimations({ subtree: true }).some((run) => {
    const end = run.effect?.getComputedTiming().endTime;
    return (
      run.playState === "running" &&
      run.timeline === document.timeline &&
      typeof end === "number" &&
      Number.isFinite(end)
    );
  });

export const capEdgeFades: Attachment<HTMLElement> = (node) => {
  let frame = 0;
  let scan = 0;
  /** The list's nodes changed: motion may have started with them, so frames read on until it ends. A scroll never asks. */
  let follow = false;
  const written = { start: "", end: "" };
  /** What stands partly inside the scroller now, an edge across it. */
  const partly = new Set<Element>();
  let watched = new Set<Element>();

  const write = (edge: keyof Reach, drawnPx: number, scale: number) => {
    const value = `${Math.floor(drawnPx / scale)}px`;
    if (written[edge] !== value) {
      written[edge] = value;
      node.style.setProperty(`--fade-cap-${edge}`, value);
    }
  };
  const measure = () => {
    frame = 0;
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
    write("start", reach.start, scale);
    write("end", reach.end, scale);
    if (follow) {
      follow = moving(node);
      if (follow) {
        later();
      }
    }
  };
  function later(): void {
    if (!frame) {
      frame = requestAnimationFrame(measure);
    }
  }

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio < 1) {
          partly.add(entry.target);
        } else {
          partly.delete(entry.target);
        }
      }
      later();
    },
    { root: node, threshold: [0, 1] }
  );
  /** The runs and marks watched: the list's own, as its nodes now stand. */
  const watch = () => {
    scan = 0;
    const now = cuttable(node);
    for (const el of watched) {
      if (!now.has(el)) {
        seen.unobserve(el);
        partly.delete(el);
      }
    }
    for (const el of now) {
      if (!watched.has(el)) {
        seen.observe(el);
      }
    }
    watched = now;
    follow = true;
    later();
  };
  const changes = new MutationObserver(() => {
    if (!scan) {
      scan = requestAnimationFrame(watch);
    }
  });
  // A fold opening or shutting moves the lines under it on its own clock.
  changes.observe(node, {
    attributeFilter: ["aria-expanded", "data-open", "inert"],
    characterData: true,
    childList: true,
    subtree: true,
  });
  // A scroll or a resize moves the candidates across their edge; the
  // observer adds and drops candidates as runs cross the thresholds.
  const sizes = new ResizeObserver(later);
  sizes.observe(node);
  node.addEventListener("scroll", later, { passive: true });
  watch();
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(scan);
    seen.disconnect();
    changes.disconnect();
    sizes.disconnect();
    node.removeEventListener("scroll", later);
  };
};
