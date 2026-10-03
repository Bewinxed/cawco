/**
 * A table whose rows a filter, a search or a re-sort changes reflows
 * instead of jumping. In one batch, on one curve and one length:
 *
 * - rows that stay slide from where they were drawn to their new places;
 * - a row that leaves closes to nothing while it fades, its edges
 *   travelling with the rows either side of it;
 * - rows that arrive ride on the row that stays above them; between rows
 *   that stay they open as one block, its bottom edge travelling with the
 *   row below as that row slides down; at the end they fade in while the
 *   table's height uncovers them;
 * - when no row stays at all, the old rows fade where they are as the new
 *   ones fade in over them;
 * - the table's box takes its new height at once, in the same update: a
 *   `reflow` container around it (below) carries that change, tweening the
 *   card it stands in and sliding what sits under it. Nothing below jumps.
 *
 * Every piece starts in the same task, so every edge is on the same frame
 * of the same curve as the edge next to it.
 *
 *   const reflow = tableReflow({ layer: () => layerEl, rows: "tbody tr[data-key]" });
 *   const list = $derived.by(() => {
 *     const next = compute();
 *     untrack(() => reflow(next.map((r) => r.key)));
 *     return next;
 *   });
 *
 * It is called where the list is computed, with the keys the table is about
 * to show. With Svelte's async mode an `{#each}` block updates before any
 * `$effect.pre` runs, so the list's own recomputation (the block reading it
 * as it starts to update) is the one moment the old rows are still on
 * screen to be measured. The motion starts once the update is in, a
 * microtask after the flush, and reads layout rather than drawn boxes, so a
 * slide still in flight does not skew where anything lands.
 *
 * A leaving `<tr>` cannot stay in the table to close (a table row cannot be
 * shorter than its cells), so it is copied, before the list updates, into
 * a table of its own that keeps the live table's classes (the fixed column
 * widths come from them), inside a zero-size layer the caller places as
 * the first child of the table's box, which is the element that styles the
 * table and is `position: relative`.
 */
import { watchRendered } from "#lib/utils/rendered.js";
import {
  dur,
  ease,
  easeInOut,
  glide,
  motionOk,
  popScale,
} from "./curves.svelte";

/** Samples for the one piece whose value is not a straight line in the curve. */
const STEPS = 48;

interface Leaving {
  /** The row that stays before it: with none after, it closes under this one. */
  above: string | null;
  /** The row that stays after it, whose new top is where it closes to. */
  below: string | null;
  body: HTMLElement;
  height: number;
  top: number;
  wrap: HTMLElement;
}

interface Before {
  leaving: Leaving[];
  /** Each row's drawn top, by key, in the layer's frame. */
  tops: Map<string, number>;
}

/** An element's layout top in `host`'s padding box, transforms ignored. */
function layoutTop(element: HTMLElement, host: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== host) {
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== host) {
      top += parent.clientTop;
    }
    node = parent;
  }
  return top;
}

/** The row as it is drawn, in a table of its own. */
function copyOf(row: HTMLElement, left: number, top: number): HTMLElement {
  const { width, height } = row.getBoundingClientRect();
  const table = row.closest("table")?.cloneNode(false) as HTMLElement;
  table.style.width = `${width}px`;
  const tbody = row.parentElement?.cloneNode(false) as HTMLElement;
  const copy = row.cloneNode(true) as HTMLElement;
  // A copy is nobody's row: not a shared-element source, not a list row.
  for (const node of [copy, ...copy.querySelectorAll("[data-share]")]) {
    node.removeAttribute("data-share");
  }
  copy.removeAttribute("data-key");
  tbody.append(copy);
  // A row that was not the last keeps its bottom rule: an empty row after
  // it keeps the table's `tr:last-child` rules off the copy.
  if (row.nextElementSibling) {
    tbody.append(document.createElement("tr"));
  }
  table.append(tbody);
  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.inert = true;
  wrap.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none`;
  wrap.append(table);
  return wrap;
}

/** The key of the row that stays before each row, in the list's old order. */
function staysAbove(rows: HTMLElement[], keep: Set<string>): (string | null)[] {
  const above: (string | null)[] = [];
  let last: string | null = null;
  for (const row of rows) {
    above.push(last);
    const key = row.dataset.key ?? "";
    if (keep.has(key)) {
      last = key;
    }
  }
  return above;
}

/** A copy of each drawn row not in `keep`, placed from `base`'s corner. */
function leavingRows(
  rows: HTMLElement[],
  keep: Set<string>,
  base: DOMRect
): Leaving[] {
  const above = staysAbove(rows, keep);
  const leaving: Leaving[] = [];
  let below: string | null = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const key = row.dataset.key ?? "";
    if (keep.has(key)) {
      below = key;
      continue;
    }
    const rect = row.getBoundingClientRect();
    if (rect.height === 0) {
      continue;
    }
    const top = rect.top - base.top;
    const wrap = copyOf(row, rect.left - base.left, top);
    leaving.push({
      wrap,
      body: wrap.firstElementChild as HTMLElement,
      top,
      height: rect.height,
      above: above[i],
      below,
    });
  }
  return leaving;
}

/** Movement on screen: --dur-panel, easing in-out (app.css). */
const timing = (easing: string): KeyframeAnimationOptions => ({
  duration: dur("--dur-panel"),
  easing,
});

export function tableReflow(options: {
  /** False while the table is not on screen: nothing to animate. */
  enabled?: () => boolean;
  /** The zero-size layer, first child of the table's box. */
  layer: () => HTMLElement | null;
  /** The rows, each carrying its list key in `data-key`. */
  rows: string;
}) {
  /** What each element is doing now, so a newer reflow replaces it. */
  const running = new WeakMap<Element, Animation>();
  const play = (
    element: Element,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions
  ) => {
    running.get(element)?.cancel();
    const animation = element.animate(frames, opts);
    running.set(element, animation);
    return animation;
  };

  const rowOf = (host: HTMLElement, key: string | null) =>
    key === null
      ? null
      : host.querySelector<HTMLElement>(
          `${options.rows}[data-key="${CSS.escape(key)}"]`
        );

  /** Rows that stay: from where they were drawn to where they are laid out. */
  const slide = (host: HTMLElement, rows: HTMLElement[], before: Before) => {
    for (const row of rows) {
      const was = before.tops.get(row.dataset.key ?? "");
      if (was === undefined) {
        continue;
      }
      const dy = was - layoutTop(row, host);
      if (Math.abs(dy) < 0.5) {
        running.get(row)?.cancel();
        continue;
      }
      play(
        row,
        [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        timing(ease("--ease-in-out"))
      );
    }
  };

  /**
   * A copied row closes to the new top of the row that stays after it, else
   * the new bottom of the row that stays before it. With neither, the whole
   * list changed: it fades where it is while the new rows fade in over it,
   * and the box's height tween clips it away.
   */
  const close = (layer: HTMLElement, host: HTMLElement, list: Leaving[]) => {
    for (const item of list) {
      const below = rowOf(host, item.below);
      const above = rowOf(host, item.above);
      layer.append(item.wrap);
      const fading = item.body.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-exit"),
        easing: ease("--ease-out"),
        fill: "forwards",
      });
      const done = () => item.wrap.remove();
      if (!(below || above)) {
        fading.finished.then(done, done);
        continue;
      }
      const to = below
        ? layoutTop(below, host)
        : layoutTop(above as HTMLElement, host) +
          (above as HTMLElement).offsetHeight;
      item.wrap
        .animate(
          [
            { height: `${item.height}px`, transform: "none" },
            { height: "0px", transform: `translateY(${to - item.top}px)` },
          ],
          { ...timing(ease("--ease-in-out")), fill: "forwards" }
        )
        .finished.then(done, done);
    }
  };

  /**
   * A run of arriving rows rides on the row that stays above it (its top
   * edge is that row's bottom edge, sliding with it) and, with a row that
   * stays below it, opens as one block whose bottom edge is that row's top
   * edge. A run at the end fades in, uncovered by the box's height tween.
   */
  const enter = (
    host: HTMLElement,
    run: HTMLElement[],
    prev: number,
    next: { dy: number; row: HTMLElement } | null
  ) => {
    const start = layoutTop(run[0], host);
    const size = next ? layoutTop(next.row, host) - start : 0;
    for (const row of run) {
      const offset = layoutTop(row, host) - start;
      const height = row.offsetHeight;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= STEPS; i += 1) {
        const e = easeInOut(i / STEPS);
        const frame: Keyframe = {
          offset: i / STEPS,
          transform: `translateY(${(prev * (1 - e)).toFixed(2)}px)`,
          opacity: e,
        };
        if (next) {
          const open = size + (next.dy - prev) * (1 - e);
          const shown = Math.min(height, Math.max(0, open - offset));
          frame.clipPath = `inset(0 0 ${(height - shown).toFixed(2)}px 0)`;
        }
        frames.push(frame);
      }
      play(row, frames, timing("linear"));
    }
  };

  /** Arriving rows, in runs between the rows that stay. */
  const arrive = (host: HTMLElement, rows: HTMLElement[], before: Before) => {
    const dyOf = (row: HTMLElement) =>
      (before.tops.get(row.dataset.key ?? "") ?? 0) - layoutTop(row, host);
    let run: HTMLElement[] = [];
    let prev = 0;
    for (const row of rows) {
      if (!before.tops.has(row.dataset.key ?? "")) {
        run.push(row);
        continue;
      }
      const dy = dyOf(row);
      if (run.length > 0) {
        enter(host, run, prev, { dy, row });
        run = [];
      }
      prev = dy;
    }
    if (run.length > 0) {
      enter(host, run, prev, null);
    }
  };

  /** The list as last shown: the same keys in the same order move nothing. */
  let shown = "";

  /** Called before the list updates, with the keys it is about to show. */
  return (keys: string[]): void => {
    const next = keys.join("\n");
    if (next === shown) {
      return;
    }
    shown = next;
    const layer = options.layer();
    const host = layer?.parentElement;
    if (!(layer && host) || options.enabled?.() === false) {
      return;
    }
    const rows = [...host.querySelectorAll<HTMLElement>(options.rows)];
    const base = layer.getBoundingClientRect();
    const tops = new Map(
      rows.map((row) => [
        row.dataset.key ?? "",
        row.getBoundingClientRect().top - base.top,
      ])
    );
    if (!motionOk.current) {
      // Reduced motion: no travel. Arriving rows still fade in.
      queueMicrotask(() => {
        for (const row of host.querySelectorAll<HTMLElement>(options.rows)) {
          if (!tops.has(row.dataset.key ?? "")) {
            row.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: dur("--dur-pop"),
              easing: ease("--ease-out"),
            });
          }
        }
      });
      return;
    }
    const before: Before = {
      tops,
      leaving: leavingRows(rows, new Set(keys), base),
    };
    queueMicrotask(() => {
      const now = [...host.querySelectorAll<HTMLElement>(options.rows)];
      slide(host, now, before);
      arrive(host, now, before);
      close(layer, host, before.leaving);
    });
  };
}

/**
 * Every other list moves the same way when what it shows changes, whatever
 * changed it: a machine coming back, a badge a deploy raises, a count, a
 * toggle, a re-sort. Attach to the container, `{@attach reflow()}`, and mark
 * what travels with `data-flip`:
 *
 * - `data-flip` (a row): arriving, it is uncovered top to bottom as it fades
 *   in, while what follows it slides down to make its room; leaving, a copy
 *   of it closes and fades where it stood while what follows slides up into
 *   the space;
 * - `data-flip="pop"` (a chip, a badge, a count): it scales in from
 *   --pop-scale as it fades, and out the same way reversed, while its
 *   neighbours slide aside or together;
 * - `data-flip="box"` (a card whose edge is drawn): a row too, and when what
 *   is inside it grows or shrinks, its edge travels to the new size; with
 *   "pop" as well (`data-flip="pop box"`, a count's pill) it pops in and out
 *   and its width travels as the count grows a digit.
 * - `data-flip-enter="own"` beside any of these: it arrives with an entrance
 *   of its own, so it is not popped or uncovered here; it still slides, and
 *   still leaves the way its mark says.
 *
 * Layout changes once, in the update that changes the DOM, and everything
 * marked that moved starts, in that same update, on a transform that holds
 * it where it was drawn, then slides home. So nothing is ever painted where
 * it jumped to: a MutationObserver hears the change in the microtask after
 * the DOM is written, before the frame is painted. Places are layout boxes
 * (offsets, which transforms never move), each read against its nearest
 * marked ancestor, so a group that slides carries its rows and a row that
 * moves inside it adds only its own step. A box takes its new room in the
 * layout from the first frame and only its edge travels (`edgeOf`), so
 * nothing after it moves except on its own transform. A container inside
 * another with its own `reflow` owns its marks. `data-flip-anchor` marks a
 * box someone else moves (a table's row, which `tableReflow` slides): the
 * marks inside it are read against it, so they travel only for what moves
 * inside it, and it is never slid, uncovered or copied here.
 *
 * Movement eases in-out over --dur-panel (over --dur-exit in a batch a
 * tree's closing paces, `atTravel`); entrances ease out over --dur-pop and
 * exits over --dur-exit (app.css). With reduced motion nothing travels:
 * arrivals and departures only fade.
 */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

interface Placed extends Box {
  /** Against the container, where a copy of it would stand. */
  cx: number;
  cy: number;
  /** The nearest marked ancestor `x` and `y` are read against, or the container. */
  ref: HTMLElement;
}

interface Move {
  /** The slide, once it has taken over from the hold. */
  animation?: Animation;
  /** Drops the slide's start while a style still holds the element. */
  hold?: () => void;
  /** How much of the way it has come at a progress of its timing (`paced`). */
  share?: (progress: number) => number;
  x: number;
  y: number;
}

/**
 * The one frame every move a change sets off starts on, its time on the
 * document timeline, and the pace they travel at. A change's slides, its
 * boxes' edges, its arrivals and departures, and a tree fold (motion/branch)
 * all ask for it in the update that changes the DOM; the first ask opens a
 * batch that starts two frames on (the hold `#slide` explains), and every
 * ask until then joins it. Each animation is created held at its first
 * frame and given this start time, so every edge is on the same frame of
 * the same curve as the edge next to it: a box's edge and the row under it
 * never part by a frame.
 *
 * `now`: the batch carries on from the frame it was asked in, the last one
 * drawn. It runs in the next frame's callbacks with that frame's time as its
 * start, so the next frame already shows it under way, from exactly where
 * the last one left everything. A tree folding (motion/branch `fold`) asks
 * so, and a tree turned back while it opens: its line held where it was
 * drawn, two frames of waiting were two frames of a line standing still
 * mid-stroke. A click sets both off, and Chrome leaves a shift within
 * 500ms of input out of the layout shift score, so the hold the two frames
 * keep for a change that comes on its own (live data) is not needed here.
 * A tree opening from rest still waits: it mounts out of the layout and is
 * shown a task after its click (motion/branch `open`), so building its rows
 * and laying them out are two tasks, each inside a frame.
 *
 * `pace`, how the batch's moves travel. A tree closing asks with `close`
 * (motion/branch `fold`): every move in its batch travels over --dur-exit
 * rather than --dur-panel, so closing is quicker than opening and never
 * waits. A tree opening asks with its line's
 * `speed` (px a ms): every move in its batch glides at that speed
 * (curves `glide`), as its line does, so its room's edge, and every row under
 * it, keep step with the line's head and are never outrun by it; on the
 * rows' in-out curve the room had to open in 110–212ms to stay ahead of a
 * line running at an even pace, and at 280ms the head ran up to 29px below
 * its edge. Two trees opening in one batch (the same tree in the rail's
 * Sessions and in its project, open-trees) travel at the first one's speed,
 * the list it was opened in, which asks a task before the other: each line
 * runs at that speed too, so no room falls behind its line. A later tree
 * only makes it faster, as far as its `least`: the speed it needs to open
 * within --dur-cascade. A closing and an opening are batches apart, each at
 * its own pace.
 */
export interface Pace {
  close: boolean;
  speed: number | null;
}
type Run = (at: number, pace: Pace) => void;
interface Batch {
  pace: Pace;
  runs: Set<Run>;
  /** Its start, when it carries on from the frame it was asked in (`now`). */
  since: number | null;
}
/** The batch still taking asks: the one the current update joins. */
let taking: Batch | null = null;

export function atTravel(
  run: Run,
  ask: { close?: boolean; least?: number; now?: boolean; speed?: number } = {}
): () => void {
  // A tree closing and a tree opening never share a batch: the one asked
  // second opens the next, and every ask after it joins that one.
  const apart =
    taking !== null &&
    ((ask.close === true && taking.pace.speed !== null) ||
      (ask.speed !== undefined && taking.pace.close));
  if (!taking || apart) {
    const open: Batch = {
      runs: new Set(),
      pace: { close: false, speed: null },
      since: null,
    };
    taking = open;
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames < (open.since === null ? 2 : 1)) {
        requestAnimationFrame(tick);
        return;
      }
      // From here on it is closed: a later ask opens the next batch.
      if (taking === open) {
        taking = null;
      }
      const at = open.since ?? Number(document.timeline.currentTime);
      for (const go of open.runs) {
        go(at, open.pace);
      }
    };
    requestAnimationFrame(tick);
  }
  const joined = taking;
  if (ask.now && joined.since === null) {
    joined.since = Number(document.timeline.currentTime);
  }
  if (ask.close) {
    joined.pace.close = true;
  }
  if (ask.speed !== undefined) {
    joined.pace.speed = Math.max(
      joined.pace.speed ?? ask.speed,
      ask.least ?? ask.speed
    );
  }
  joined.runs.add(run);
  return () => {
    joined.runs.delete(run);
  };
}

/**
 * A move `distance` px long, from `from` to `to`, at a batch's pace, and
 * how much of the way it has come at a given progress of its timing.
 */
function paced(
  pace: Pace,
  from: Keyframe,
  to: Keyframe,
  distance: number
): {
  frames: Keyframe[];
  share: (progress: number) => number;
  timing: { duration: number; easing: string };
} {
  if (pace.speed && distance > 0) {
    const along = glide(distance, pace.speed);
    return {
      frames: along.frames(from, to),
      share: (progress) => along.covered(progress * along.duration) / distance,
      timing: { duration: Math.max(1, along.duration), easing: "linear" },
    };
  }
  return {
    frames: [from, to],
    share: (progress) => progress,
    timing: pace.close ? closing() : travel(),
  };
}

/** A keyframe as an animation reads it back, without its timing. */
const valuesOf = (frame: ComputedKeyframe): Keyframe => {
  const { offset, easing, composite, computedOffset, ...values } = frame;
  return values;
};

/** An animation's keyframes, each at its place and on its curve, to make it again. */
const framesOf = (animation: Animation): Keyframe[] =>
  ((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? []).map(
    ({ computedOffset, ...frame }) => ({ ...frame, offset: computedOffset })
  );

/**
 * An animation held at its first frame until the batch starts, then run
 * from the batch's start. One that is cancelled in the meantime stays
 * cancelled. `distance`: it moves rows (an edge, a width, a box's size, a
 * row's uncovering), that many px, so it takes the batch's pace.
 */
export function heldToTravel(
  animation: Animation,
  distance?: number
): Animation {
  animation.pause();
  atTravel((at, pace) => {
    if (animation.playState !== "paused") {
      return;
    }
    const effect = animation.effect as KeyframeEffect | null;
    if (effect && distance !== undefined && (pace.speed || pace.close)) {
      const [first, ...after] = effect.getKeyframes();
      const move = paced(
        pace,
        valuesOf(first),
        valuesOf(after.at(-1) ?? first),
        distance
      );
      effect.setKeyframes(move.frames);
      effect.updateTiming(move.timing);
    }
    animation.startTime = at;
  });
  return animation;
}

/** It pops (scales in and out) rather than being uncovered like a row. */
const pops = (element: HTMLElement) =>
  (element.dataset.flip ?? "").includes("pop");
/** Its edges travel when it changes size. */
const hasEdges = (element: HTMLElement) =>
  (element.dataset.flip ?? "").includes("box");

/** Marked, and this container's rather than a nested one's. */
const ownedBy = (node: HTMLElement, element: HTMLElement) =>
  element.parentElement?.closest("[data-reflow]") === node;

/** The layout box against the container, or null where it is not laid out in it. */
/**
 * Layout boxes against a container, each offset parent read once: walked
 * from every element in turn, a list's shared ancestors were read again for
 * every row in them, a long task of offsets in the frame a tree opened.
 */
function boxesIn(node: HTMLElement) {
  /** An element's border-box corner in the container, or null outside it. */
  const corners = new Map<HTMLElement, { x: number; y: number } | null>();
  const cornerOf = (at: HTMLElement): { x: number; y: number } | null => {
    const known = corners.get(at);
    if (known !== undefined) {
      return known;
    }
    const parent = at.offsetParent as HTMLElement | null;
    let corner: { x: number; y: number } | null = null;
    if (parent === node) {
      corner = { x: at.offsetLeft, y: at.offsetTop };
    } else if (parent) {
      const base = cornerOf(parent);
      corner = base && {
        x: base.x + parent.clientLeft + at.offsetLeft,
        y: base.y + parent.clientTop + at.offsetTop,
      };
    }
    corners.set(at, corner);
    return corner;
  };
  return (element: HTMLElement): Box | null => {
    const corner = cornerOf(element);
    return corner
      ? { ...corner, w: element.offsetWidth, h: element.offsetHeight }
      : null;
  };
}

function referenceIn(node: HTMLElement, element: HTMLElement): HTMLElement {
  let at = element.parentElement;
  while (at && at !== node) {
    if (
      (at.hasAttribute("data-flip") || at.hasAttribute("data-flip-anchor")) &&
      ownedBy(node, at)
    ) {
      return at;
    }
    at = at.parentElement;
  }
  return node;
}

/** Every marked element the container lays out, placed against its reference. */
function placesIn(node: HTMLElement): Map<HTMLElement, Placed> {
  const boxes = new Map<HTMLElement, Box>();
  const boxIn = boxesIn(node);
  for (const element of node.querySelectorAll<HTMLElement>(
    "[data-flip], [data-flip-anchor]"
  )) {
    const box = ownedBy(node, element) ? boxIn(element) : null;
    if (box) {
      boxes.set(element, box);
    }
  }
  const places = new Map<HTMLElement, Placed>();
  for (const [element, box] of boxes) {
    const ref = referenceIn(node, element);
    const origin = ref === node ? { x: 0, y: 0 } : boxes.get(ref);
    if (origin) {
      places.set(element, {
        ...box,
        x: box.x - origin.x,
        y: box.y - origin.y,
        cx: box.x,
        cy: box.y,
        ref,
      });
    }
  }
  return places;
}

/** How far a slide in flight still holds its element from its place. */
function heldBy(move: Move | undefined) {
  if (!move) {
    return { x: 0, y: 0 };
  }
  if (move.hold !== undefined) {
    return { x: move.x, y: move.y };
  }
  if (move.animation?.playState !== "running") {
    return { x: 0, y: 0 };
  }
  const timed = move.animation.effect?.getComputedTiming().progress ?? 1;
  const progress = move.share ? move.share(timed) : timed;
  return { x: move.x * (1 - progress), y: move.y * (1 - progress) };
}

/** An element's own `translate`, offset by a step: composed, never replaced. */
function offsetTranslate(own: string, x: number, y: number): string {
  if (own === "none" || own === "") {
    return `${x}px ${y}px`;
  }
  const [ownX = "0px", ownY = "0px"] = own.split(" ");
  return `calc(${ownX} + ${x}px) calc(${ownY} + ${y}px)`;
}

const entrance = () => ({
  duration: dur("--dur-pop"),
  easing: ease("--ease-out"),
});
const exit = () => ({
  duration: dur("--dur-exit"),
  easing: ease("--ease-out"),
});
const travel = () => ({
  duration: dur("--dur-panel"),
  easing: ease("--ease-in-out"),
});
/** Travel in a batch a tree's closing paces (`atTravel`). */
const closing = () => ({
  duration: dur("--dur-exit"),
  easing: ease("--ease-in-out"),
});

/**
 * Drawn somewhere in the viewport. An element that arrives out of sight has
 * nothing to show arriving: a long list mounting a chunk at a time past the
 * fold would otherwise start two animations a row for rows nobody sees.
 */
function onScreen(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

/**
 * Neither where it is drawn now nor where it is laid out now is in the
 * viewport: a move nobody can see. Sliding it anyway is worse than wasted. A
 * list growing a page at a time past the fold moves what sits under it on
 * every page, and a slide still in flight when the next page lands carries on
 * from where it is drawn, so while the reader scrolls it trails further and
 * further behind its place until it is drawn on screen, still sliding away:
 * the fleet board's Not running, its Show moving out from under the pointer.
 * `dy` is how far above its place it is drawn. Places are read in the
 * container's content, so `view` is where that content's top is in the
 * viewport, scroll included (the rail): unscrolled, a row half a rail down
 * was taken for one below the viewport, and jumped where it should have
 * slid.
 */
function unseen(view: number, place: Placed, dy: number): boolean {
  const top = view + place.cy;
  const off = (at: number) => at + place.h <= 0 || at >= window.innerHeight;
  return off(top) && off(top + dy);
}

/** `height`: its laid-out height, how far its uncovering travels. */
function arrival(element: HTMLElement, still: boolean, height: number) {
  // It brings its own entrance (a delegate chip whose mark flew in, or one
  // that was simply there when the page loaded); its neighbours still slide.
  if (element.dataset.flipEnter === "own") {
    return;
  }
  if (still) {
    heldToTravel(element.animate([{ opacity: 0 }, { opacity: 1 }], entrance()));
  } else if (pops(element)) {
    heldToTravel(
      element.animate(
        [
          { opacity: 0, transform: `scale(${popScale()})` },
          { opacity: 1, transform: "none" },
        ],
        entrance()
      )
    );
  } else {
    // Uncovered on the curve the rows after it slide down on, from the frame
    // they start on, so its bottom edge is their top edge all the way.
    heldToTravel(
      element.animate(
        [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }],
        travel()
      ),
      height
    );
    heldToTravel(element.animate([{ opacity: 0 }, { opacity: 1 }], entrance()));
  }
}

/** A copy of what left, where it was drawn, closing or shrinking away. */
function departure(
  node: HTMLElement,
  element: HTMLElement,
  was: Placed,
  at: { x: number; y: number },
  still: boolean
) {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const marked of [copy, ...copy.querySelectorAll("[data-flip]")]) {
    marked.removeAttribute("data-flip");
  }
  copy.setAttribute("data-reflow-ghost", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  Object.assign(copy.style, {
    position: "absolute",
    left: `${was.cx + at.x}px`,
    top: `${was.cy + at.y}px`,
    width: `${was.w}px`,
    height: `${was.h}px`,
    margin: "0",
    boxSizing: "border-box",
    pointerEvents: "none",
    transform: "none",
  });
  node.append(copy);
  const done = () => copy.remove();
  let last: Animation;
  let travels: number | undefined;
  if (still) {
    last = copy.animate([{ opacity: 1 }, { opacity: 0 }], exit());
  } else if (pops(element)) {
    last = copy.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: `scale(${popScale()})` },
      ],
      { ...exit(), fill: "forwards" }
    );
  } else {
    heldToTravel(
      copy.animate([{ opacity: 1 }, { opacity: 0 }], {
        ...exit(),
        fill: "forwards",
      })
    );
    last = copy.animate(
      [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }],
      { ...travel(), fill: "forwards" }
    );
    travels = was.h;
  }
  // It closes from the frame the rows around it start moving on.
  heldToTravel(last, travels).finished.then(done, done);
}

/**
 * A moving edge clips only at the edge: above it and either side, whatever
 * the box draws outside itself (a shadow, a nesting rail reaching up to its
 * parent's glyph, an arm out to the left) shows all the while.
 */
const OPEN = "-100vmax";
/** A box's clip, read for where its bottom edge is drawn: above (hiding) or below its foot. */
const CLIP_BOTTOM = /^inset\(\S+ \S+ (-?[\d.]+)px/;

/**
 * A shrinking box, as the change found it: its bottom margin, and whether it
 * draws anything of its own (a background, a shadow, an outline, a border
 * down a side or along its foot) that would jump to its new size.
 */
interface Shrink {
  margin: number;
  paints: boolean;
}

function shrinkOf(styles: CSSStyleDeclaration): Shrink {
  const side = (edge: "Right" | "Bottom" | "Left") =>
    styles[`border${edge}Style`] !== "none" &&
    Number.parseFloat(styles[`border${edge}Width`]) > 0;
  return {
    margin: Number.parseFloat(styles.marginBottom),
    paints:
      !["rgba(0, 0, 0, 0)", "transparent"].includes(styles.backgroundColor) ||
      styles.backgroundImage !== "none" ||
      styles.boxShadow !== "none" ||
      (styles.outlineStyle !== "none" &&
        Number.parseFloat(styles.outlineWidth) > 0) ||
      side("Right") ||
      side("Bottom") ||
      side("Left"),
  };
}

/**
 * A box's edge, from where it is drawn to its new size, while the room it
 * takes in the layout is the new size throughout, so nothing after it moves
 * on its account. The box is laid out at its new height at once, and a clip
 * moves its bottom edge from where it was drawn: growing, the clip hides the
 * new strip and uncovers it; shrinking, it reaches below the box over the
 * strip given up and closes on it. Nothing is laid out again as it moves:
 * a box that shrank by its height laid the list out on every frame, and
 * with a session streaming a tree's fold dropped frames that its opening
 * did not.
 *
 * A box that draws something of its own (`Shrink.paints`: at its new size
 * at once, its background or border would jump) shrinks by its height: held
 * at its drawn height over an equal and opposite bottom margin (negative, it
 * sums with a following margin instead of collapsing into it; a positive one
 * would collapse, and the room would not add up), clipped at that height.
 * Either way the clip is the only cut: overflow is left alone, so the box's
 * layout (its margins, a stacking context) is the same before, during and
 * after.
 */
function edgeOf(
  element: HTMLElement,
  from: number,
  to: number,
  /** Read with every other style of the change, when it shrinks. */
  shrink: Shrink | null,
  clock: EffectTiming = travel()
): Animation {
  if (!shrink?.paints) {
    return element.animate(
      [
        { clipPath: `inset(${OPEN} ${OPEN} ${to - from}px ${OPEN})` },
        { clipPath: `inset(${OPEN} ${OPEN} 0px ${OPEN})` },
      ],
      clock
    );
  }
  const { margin } = shrink;
  const clipPath = `inset(${OPEN} ${OPEN} 0px ${OPEN})`;
  return element.animate(
    [
      {
        height: `${from}px`,
        marginBottom: `${margin + to - from}px`,
        clipPath,
      },
      { height: `${to}px`, marginBottom: `${margin}px`, clipPath },
    ],
    clock
  );
}

/**
 * An edge in flight that a change found still bound for the same size: it
 * is made again from the same size, on the same clock, rather than started
 * afresh from where it is drawn on a later batch's frame. Started afresh, a
 * change made while a tree closed (a row's time ticking over, the same tree
 * folding in another list) put the room's edge a frame or two behind the
 * rows sliding up under it, and they slid over the rows it still held.
 */
interface Carry extends Sizes {
  /** Its keyframes as they were made: a glide's own stretches included. */
  frames: Keyframe[];
  start: number;
  timing: EffectTiming;
}
/** An edge's sizes, and whether it moves by its clip, the box laid out at `to`. */
interface Sizes {
  clip: boolean;
  from: number;
  to: number;
}
/** Each edge's own sizes, for carrying it across a change. */
const edgeSizes = new WeakMap<Animation, Sizes>();

/**
 * A box's width, from where it is drawn to its new width. In the flow, an
 * equal and opposite right margin keeps its room at the new width throughout
 * (inline margins never collapse); placed absolutely, nothing follows it and
 * only the width travels.
 */
function spanOf(
  element: HTMLElement,
  from: number,
  to: number,
  /** Read with every other style of the change: placed out of the flow, its right margin. */
  { placed, margin }: { margin: number; placed: boolean }
): Animation {
  if (placed) {
    return element.animate(
      [{ width: `${from}px` }, { width: `${to}px` }],
      travel()
    );
  }
  return element.animate(
    [
      { width: `${from}px`, marginRight: `${margin + to - from}px` },
      { width: `${to}px`, marginRight: `${margin}px` },
    ],
    travel()
  );
}

/** What one change will do, decided before anything is written. */
interface Plan {
  edges: { carry?: Carry; element: HTMLElement; from: number; to: number }[];
  slides: { element: HTMLElement; x: number; y: number }[];
  spans: { element: HTMLElement; from: number; to: number }[];
  stops: HTMLElement[];
}

/** One container's marked elements: where each was last laid out, and what is moving. */
class Reflow {
  readonly #node: HTMLElement;
  readonly #moves = new Map<HTMLElement, Move>();
  readonly #edges = new Map<HTMLElement, Animation>();
  readonly #spans = new Map<HTMLElement, Animation>();
  #placed: Map<HTMLElement, Placed>;
  /** The scroll the rows were last drawn at (`#anchor`). */
  #scroll: number;
  /** Where the content's top is in the viewport, read once a change. */
  #view: number | null = null;
  /**
   * The container is not being rendered: an ancestor skips its content
   * (`content-visibility: hidden`, the home board put away under a
   * conversation) or it has no box. It has no layout to read, and reading
   * one lays it out, so nothing here measures it until it is rendered again
   * (`rendered`), which takes one fresh reading.
   */
  #skipped: boolean;

  #viewTop(): number {
    this.#view ??=
      this.#node.getBoundingClientRect().top +
      this.#node.clientTop -
      this.#scroll;
    return this.#view;
  }

  constructor(node: HTMLElement, rendered: boolean) {
    this.#node = node;
    this.#skipped = !rendered;
    this.#placed = rendered ? placesIn(node) : new Map();
    this.#scroll = rendered ? node.scrollTop : 0;
  }

  get skipped(): boolean {
    return this.#skipped;
  }

  /**
   * Rendered again, or skipped (`watchRendered`). Rendered again, every
   * place and the scroll are read as they stand: whatever changed while it
   * was skipped is where it is, and none of it is a change to animate.
   */
  rendered(on: boolean) {
    this.#skipped = !on;
    if (on) {
      this.#placed = placesIn(this.#node);
      this.#scroll = this.#node.scrollTop;
      this.#view = null;
    }
  }

  /** Every place is new and none of it is a change to animate (the container resized). */
  reread() {
    if (!this.#skipped) {
      this.#placed = placesIn(this.#node);
    }
  }

  /**
   * In three passes over the DOM: every decision first, reading only; then
   * every style it needs, read in one go; then every write. Read and written
   * a row at a time, each row's write laid the page out again for the next
   * row's read, ten layouts in the update that opened a tree.
   */
  change() {
    if (this.#skipped) {
      return;
    }
    const still = !motionOk.current;
    const drawn = this.#releaseEdges();
    const now = placesIn(this.#node);
    const scrolled = this.#anchor(now);
    this.#view = null;
    const plan: Plan = { slides: [], stops: [], edges: [], spans: [] };
    const arrivals: [HTMLElement, number][] = [];
    for (const [element, place] of now) {
      if (element.hasAttribute("data-flip-anchor")) {
        continue;
      }
      const was = this.#placed.get(element);
      if (was && !still) {
        this.#travel(element, was, place, drawn.get(element), scrolled, plan);
      } else if (
        !was &&
        (place.ref === this.#node || this.#placed.has(place.ref)) &&
        onScreen(element)
      ) {
        arrivals.push([element, place.h]);
      }
    }
    const departures: [HTMLElement, Placed, { x: number; y: number }][] = [];
    for (const [element, was] of this.#placed) {
      const gone = !(
        now.has(element) ||
        element.isConnected ||
        element.hasAttribute("data-flip-anchor")
      );
      if (gone && (was.ref === this.#node || now.has(was.ref))) {
        // Where it was drawn: a scroll this change made moves the content
        // under the viewport, and the copy with it.
        const held = heldBy(this.#moves.get(element));
        departures.push([element, was, { x: held.x, y: held.y + scrolled }]);
      }
    }
    // Writes that the reads after them must see: holds dropped.
    for (const element of [
      ...plan.stops,
      ...plan.slides.map((s) => s.element),
    ]) {
      this.#stop(element);
    }
    // Every style the writes need, in one pass.
    const own = plan.slides.map(
      (slide) => getComputedStyle(slide.element).translate
    );
    const shrinks = plan.edges.map((edge) =>
      edge.to < edge.from && !edge.carry
        ? shrinkOf(getComputedStyle(edge.element))
        : null
    );
    const spans = plan.spans.map((span) => {
      const styles = getComputedStyle(span.element);
      return {
        placed: styles.position === "absolute" || styles.position === "fixed",
        margin: Number.parseFloat(styles.marginRight),
      };
    });
    plan.slides.forEach((slide, i) => {
      this.#slide(slide.element, slide.x, slide.y, own[i]);
    });
    plan.edges.forEach((edge, i) => {
      const { carry } = edge;
      let animation: Animation;
      let clip: boolean;
      if (carry) {
        animation = edge.element.animate(carry.frames, carry.timing);
        animation.startTime = carry.start;
        ({ clip } = carry);
      } else {
        animation = heldToTravel(
          edgeOf(edge.element, edge.from, edge.to, shrinks[i]),
          Math.abs(edge.to - edge.from)
        );
        clip = !shrinks[i]?.paints;
      }
      edgeSizes.set(animation, { from: edge.from, to: edge.to, clip });
      this.#keep(this.#edges, edge.element, animation);
    });
    plan.spans.forEach((span, i) => {
      this.#keep(
        this.#spans,
        span.element,
        heldToTravel(
          spanOf(span.element, span.from, span.to, spans[i]),
          Math.abs(span.to - span.from)
        )
      );
    });
    for (const [element, height] of arrivals) {
      arrival(element, still, height);
    }
    for (const [element, was, at] of departures) {
      departure(this.#node, element, was, at, still);
    }
    this.#placed = now;
  }

  /**
   * The container's own scroll anchoring, in place of the browser's (off on
   * every reflow container): content above the first row in view grew or
   * shrank (a tree opening in a list higher up), so the container scrolls by
   * as much and that row stays where it is drawn. The browser's anchoring
   * scrolls the same way, but after this has placed every slide from where
   * rows were drawn, so each was moved twice: the whole rail jumped by the
   * change and slid back. Here the scroll is made first and every move,
   * copy and edge is read with it. Returns how far it scrolled.
   */
  #anchor(now: Map<HTMLElement, Placed>): number {
    const node = this.#node;
    // The scroll the rows were drawn at: content that got shorter may have
    // had the browser clamp it already, in the layout reading the places.
    // The scroll it leaves is kept here, read before anything is written:
    // read after the change's writes, it laid the page out again.
    const before = this.#scroll;
    if (before <= 0) {
      this.#scroll = node.scrollTop;
      return this.#scroll - before;
    }
    let anchor: { cy: number; was: number } | null = null;
    for (const [element, was] of this.#placed) {
      const place = now.get(element);
      if (
        place &&
        was.cy >= before &&
        (anchor === null || was.cy < anchor.was)
      ) {
        anchor = { was: was.cy, cy: place.cy };
      }
    }
    if (anchor && Math.abs(anchor.cy - anchor.was) >= 0.5) {
      node.scrollTop = before + anchor.cy - anchor.was;
    }
    this.#scroll = node.scrollTop;
    return this.#scroll - before;
  }

  /** The reader (or a page) scrolled: rows are drawn at this scroll now. */
  scrolled() {
    if (!this.#skipped) {
      this.#scroll = this.#node.scrollTop;
    }
  }

  /**
   * Where each box mid-tween is drawn; its tween is dropped so it reads at
   * its natural size. Every box is read before any tween is dropped.
   */
  #releaseEdges() {
    const drawn = new Map<
      HTMLElement,
      { carry?: Carry; h?: number; w?: number }
    >();
    for (const [element, animation] of this.#edges) {
      // A box whose edge moves by its clip is laid out at the size it is
      // bound for, and drawn to where the clip's bottom inset puts its edge:
      // above that size (growing) or below it (shrinking). Read from the
      // size it is laid out at now, a tree folded while it opened (its group
      // already out of the flow) was taken for drawn 81px above its own top,
      // and the fold "grew" it from there, clipping its parent row away
      // until it had closed. One that moves by its height is drawn as tall
      // as it is.
      const clip = CLIP_BOTTOM.exec(getComputedStyle(element).clipPath);
      const hidden = clip ? Number.parseFloat(clip[1]) : 0;
      const sizes = edgeSizes.get(animation);
      const start = animation.startTime;
      const whole = sizes?.clip
        ? sizes.to
        : element.getBoundingClientRect().height;
      drawn.set(element, {
        h: whole - hidden,
        // In flight on its batch's clock: carried if it is bound the same way.
        carry:
          sizes && start !== null && animation.playState === "running"
            ? {
                ...sizes,
                frames: framesOf(animation),
                start: Number(start),
                timing: animation.effect?.getTiming() ?? travel(),
              }
            : undefined,
      });
    }
    for (const element of this.#spans.keys()) {
      drawn.set(element, {
        ...drawn.get(element),
        w: element.getBoundingClientRect().width,
      });
    }
    for (const animation of [
      ...this.#edges.values(),
      ...this.#spans.values(),
    ]) {
      animation.cancel();
    }
    this.#edges.clear();
    this.#spans.clear();
    return drawn;
  }

  /** What a change does to one element, decided with reads only (`plan`). */
  #travel(
    element: HTMLElement,
    was: Placed,
    place: Placed,
    drawn: { carry?: Carry; h?: number; w?: number } | undefined,
    scrolled: number,
    plan: Plan
  ) {
    const step = heldBy(this.#moves.get(element));
    // Read against the container itself, a place is in its content: a scroll
    // this change made (`#anchor`) moved the content under the viewport, so
    // it is drawn that much further down than its place says.
    const shift = place.ref === this.#node ? scrolled : 0;
    const x = was.x + step.x - place.x;
    const y = was.y + shift + step.y - place.y;
    const moved =
      was.ref === place.ref &&
      (was.x !== place.x || Math.abs(was.y + shift - place.y) > 0.01);
    if (moved && (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)) {
      if (unseen(this.#viewTop(), place, y)) {
        plan.stops.push(element);
      } else {
        plan.slides.push({ element, x, y });
      }
    } else if (moved) {
      // Laid out where it is drawn (a change turned back before its slide
      // started): whatever slide it was waiting on is dropped, not run late.
      plan.stops.push(element);
    }
    if (!hasEdges(element)) {
      return;
    }
    // Held at the drawn size until the batch starts, so the edge leaves on
    // the frame the rows after it do; one in flight to this same size
    // carries on, on its own clock (`Carry`).
    const carry = drawn?.carry;
    const tall = drawn?.h ?? was.h;
    if (carry && Math.abs(carry.to - place.h) <= 0.5) {
      plan.edges.push({ element, from: carry.from, to: carry.to, carry });
    } else if (Math.abs(tall - place.h) > 0.5) {
      plan.edges.push({ element, from: tall, to: place.h });
    }
    const wide = drawn?.w ?? was.w;
    if (Math.abs(wide - place.w) > 0.5) {
      plan.spans.push({ element, from: wide, to: place.w });
    }
  }

  #keep(
    running: Map<HTMLElement, Animation>,
    element: HTMLElement,
    animation: Animation
  ) {
    running.set(element, animation);
    animation.finished.then(
      () => {
        if (running.get(element) === animation) {
          running.delete(element);
        }
      },
      () => {
        /* superseded by the next change */
      }
    );
  }

  /** `own`: its own `translate`, read with its hold dropped (`change`). */
  #slide(element: HTMLElement, x: number, y: number, own: string) {
    // The first frames hold it with a style, which their layout reads. An
    // animation started in the same update runs off the main thread, and the
    // frame is drawn, and counted as a layout shift, as though it had
    // jumped. The slide takes over from the same place when the batch starts
    // (`atTravel`), on the batch's clock. It is on `translate`, composed with
    // the element's own, so a chip's scale and a control's centring are left
    // alone; Chrome runs it on the compositor all the same.
    element.style.translate = offsetTranslate(own, x, y);
    const move: Move = { x, y };
    this.#moves.set(element, move);
    move.hold = atTravel((at, pace) => {
      move.hold = undefined;
      element.style.translate = "";
      const slide = paced(
        pace,
        { translate: `${x}px ${y}px` },
        { translate: "0px 0px" },
        Math.hypot(x, y)
      );
      const animation = element.animate(slide.frames, {
        ...slide.timing,
        composite: "add",
      });
      animation.startTime = at;
      move.animation = animation;
      move.share = slide.share;
      animation.finished.then(
        () => {
          if (this.#moves.get(element) === move) {
            this.#moves.delete(element);
          }
        },
        () => {
          /* superseded by the next slide */
        }
      );
    });
  }

  /** Whatever slide or hold the element is under, dropped where it stands. */
  #stop(element: HTMLElement) {
    const move = this.#moves.get(element);
    if (!move) {
      return;
    }
    if (move.hold !== undefined) {
      move.hold();
      element.style.translate = "";
    }
    move.animation?.cancel();
    this.#moves.delete(element);
  }
}

/**
 * Sent (`reread`) to a `reflow` container, and every one around it, by an
 * owner that moves its contents itself (WorkTabs' tab swap, a fold): every
 * place is re-read as it now stands, so what that owner removed and added
 * is not taken for a change to animate.
 */
export const REFLOW_REREAD = "reflow:reread";

/**
 * The `reflow` container at `node`, if it is one, and every one around it,
 * the nearest first. What moves rows with no change to the DOM a container
 * hears (a fold, a relay driving its groups' heights) moves them for every
 * container around it too, so each of them reads its rows again when it
 * lets go (`reread`): otherwise its next change starts them from where they
 * stood before. Told to the Sessions list alone, a tab switch left the home
 * around it holding the Working tab's height for it, and the next tree
 * opened there grew the list from that height, its clip hiding every row
 * under the tree for most of a second.
 */
export function reflowsFrom(node: Element | null): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (
    let at = node?.closest<HTMLElement>("[data-reflow]") ?? null;
    at;
    at = at.parentElement?.closest<HTMLElement>("[data-reflow]") ?? null
  ) {
    found.push(at);
  }
  return found;
}

/** Each container reads its rows where they stand now, animating nothing. */
export function reread(containers: HTMLElement[]): void {
  for (const container of containers) {
    container.dispatchEvent(new Event(REFLOW_REREAD));
  }
}

/**
 * Every container that heard a change in this update, placed from the
 * innermost out. A container inside another is a box of the outer one, and
 * until the inner one has placed its own rows its last change's edges are
 * still applied: the outer one read the inner box at the size it was
 * leaving (a tree reopened in the home list mid-fold was read as still
 * folded), placed nothing under it, and the rail jumped once the inner one
 * caught up.
 */
const changed = new Map<Reflow, number>();
function heard(state: Reflow, depth: number): void {
  if (state.skipped) {
    return;
  }
  if (changed.size === 0) {
    queueMicrotask(() => {
      const order = [...changed].sort((a, b) => b[1] - a[1]);
      changed.clear();
      const settles = [...settling];
      settling.clear();
      for (const settle of settles) {
        settle();
      }
      for (const [each] of order) {
        each.change();
      }
    });
  }
  changed.set(state, depth);
}

/** Writes that the next change must read rows after (`beforeReflow`). */
const settling = new Set<() => void>();

/**
 * Runs `settle` once, before the next change reads where rows are: in the
 * microtask after the update that made it, which comes after everything the
 * update set off (Svelte starts a transition in a microtask of its own). A
 * nested list's inset (motion/branch `nestFrom`) lands here: measured in a
 * microtask of its own, it ran before the transition that holds its list
 * out of the layout, and laid out a tree of forty in the click.
 */
export function beforeReflow(settle: () => void): void {
  settling.add(settle);
}

/** How many elements up to the root: a container's nesting. */
const depthOf = (node: Element): number => {
  let depth = 0;
  for (let at = node.parentElement; at; at = at.parentElement) {
    depth += 1;
  }
  return depth;
};

export function reflow() {
  return (node: HTMLElement) => {
    node.setAttribute("data-reflow", "");
    if (getComputedStyle(node).position === "static") {
      node.style.position = "relative";
    }
    // It anchors its own scroll (`#anchor`): the browser's would move every
    // row a second time.
    node.style.overflowAnchor = "none";
    const watching = watchRendered(node, (on) => state.rendered(on));
    const state = new Reflow(node, watching.rendered);
    const depth = depthOf(node);
    const watcher = new MutationObserver(() => heard(state, depth));
    watcher.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "data-state", "open"],
    });
    // The container's width changed (a window, the rail's width): every place
    // is new, and none of it is a change to animate. Its height alone is its
    // rows' own doing, which the change that made it has placed already:
    // read again, every place in the list was laid out a second time in the
    // frame a tree opened.
    let across = -1;
    const sizes = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width !== across) {
        across = width;
        state.reread();
      }
    });
    sizes.observe(node);
    const readAgain = () => state.reread();
    node.addEventListener(REFLOW_REREAD, readAgain);
    const scrolled = () => state.scrolled();
    node.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      node.removeEventListener(REFLOW_REREAD, readAgain);
      node.removeEventListener("scroll", scrolled);
      watcher.disconnect();
      sizes.disconnect();
      watching.stop();
    };
  };
}
