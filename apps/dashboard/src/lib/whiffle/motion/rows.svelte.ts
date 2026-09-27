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
 * - the table's box tweens its height, so whatever sits under the table
 *   moves with the rows. Nothing below jumps.
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
import { CURVE, easeDrawer, motionOk } from "./curves.svelte";

/** The length of the whole reflow. */
const REFLOW_MS = 220;
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
  /** The box's height as drawn. */
  height: number;
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

const timing = (easing: string): KeyframeAnimationOptions => ({
  duration: REFLOW_MS,
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
        timing(CURVE.drawer)
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
        duration: 120,
        easing: CURVE.out,
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
          { ...timing(CURVE.drawer), fill: "forwards" }
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
        const e = easeDrawer(i / STEPS);
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

  /** The box, from the height it was drawn at to its new one. */
  const resize = (host: HTMLElement, from: number) => {
    running.get(host)?.cancel();
    const to = host.offsetHeight;
    if (Math.abs(to - from) < 0.5 || from === 0 || to === 0) {
      return;
    }
    play(
      host,
      [
        { height: `${from}px`, overflow: "hidden" },
        { height: `${to}px`, overflow: "hidden" },
      ],
      timing(CURVE.drawer)
    );
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
            row.animate([{ opacity: 0 }, { opacity: 1 }], timing(CURVE.out));
          }
        }
      });
      return;
    }
    const before: Before = {
      tops,
      height: host.getBoundingClientRect().height,
      leaving: leavingRows(rows, new Set(keys), base),
    };
    queueMicrotask(() => {
      const now = [...host.querySelectorAll<HTMLElement>(options.rows)];
      slide(host, now, before);
      arrive(host, now, before);
      close(layer, host, before.leaving);
      resize(host, before.height);
    });
  };
}
