<script generics="T" lang="ts">
  /**
   * A tree's rows, drawn as far as the reader can see and no further in the
   * update that opens it: the rail's sessions under a project, a session's
   * delegates at every depth, a project's older box, the home's Working and
   * Finished trees. The rest of the list stands as one empty item of their
   * exact height (`size`, `gap`: the rows' own tokens, added up, never
   * measured), so the list is as tall from its first frame as it is with
   * every row drawn, and nothing under it moves when they arrive.
   *
   * They arrive once the opening has landed, a few milliseconds' worth a
   * frame (`DRAW_MS`), top down, which
   * is nearest the reader first: the list is drawn from its first row. A
   * scroll towards them draws them a scroller's height ahead of the edge, so
   * the empty item is never on screen. Once all are drawn the list is as it
   * always was: every row in the page, in order, in reach of Tab and of
   * find.
   *
   * Drawn whole, a tree of 133 was laid into the page in the click: each of
   * the five passes its opening makes over its rows' styles took 30 to 60ms,
   * and its worst frame 150 to 183ms.
   *
   * The opening reads the empty item (motion/branch `measure`): its line
   * runs as far as the last row will stand, so it travels at the pace it
   * would with every row drawn.
   */
  import { flushSync, type Snippet, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { dur } from "./motion/curves.svelte";

  let {
    items,
    key,
    size,
    gap,
    room,
    row,
  }: {
    items: T[];
    key: (item: T) => string;
    /** A row's height in the list, px, with whatever is open under it. */
    size: (item: T) => number;
    /** The gap between two rows, px. */
    gap: number;
    /** How much of the list can be seen at once, px: the viewport's height, or a box's that scrolls on its own. */
    room?: number;
    row: Snippet<[T]>;
  } = $props();

  /**
   * How long a frame spends drawing rows once the opening has landed, ms:
   * about 6ms of the frame in all. A frame's rows cost their drawing here,
   * then one pass over their styles after it: 3.5ms whatever is added (one
   * hidden item, timed in an open tree of 134), and half a millisecond a
   * row. Half the 6ms is spent drawing, a row at a time, and the other half
   * is left for that pass.
   */
  const DRAW_MS = 3;
  /** Six frames at 60Hz past an opening's own length, ms. */
  const SETTLE = (1000 / 60) * 6;

  /**
   * How many rows it takes, from `from`, to fill `px` of the list; every
   * row there is and any that joins later (a session starting), once that
   * is all of them.
   */
  function reach(from: number, px: number): number {
    let count = from;
    for (let at = 0; count < items.length && at < px; count += 1) {
      at += size(items[count]) + gap;
    }
    return count < items.length ? count : Number.POSITIVE_INFINITY;
  }

  const seen = () =>
    room ?? (typeof window === "undefined" ? 0 : window.innerHeight);
  /** How many rows are drawn, from the first. */
  let drawn = $state(untrack(() => reach(0, seen())));
  const shown = $derived(drawn >= items.length ? items : items.slice(0, drawn));
  /** The rows not drawn yet: their height, and where the last of them starts in it. */
  const rest = $derived.by(() => {
    let height = 0;
    let last = 0;
    for (let i = drawn; i < items.length; i += 1) {
      last = height;
      height += size(items[i]) + gap;
    }
    return { height: height - gap, last };
  });

  /** The box an element scrolls in, or null: the page. */
  function scrollerOf(node: HTMLElement): HTMLElement | null {
    for (let at = node.parentElement; at; at = at.parentElement) {
      const { overflowY } = getComputedStyle(at);
      if (overflowY === "auto" || overflowY === "scroll") {
        return at;
      }
    }
    return null;
  }

  /**
   * On the empty item, while there is one. It draws the rows a scroll
   * brings near (`ahead` of the edge they come over), and the rest a few a
   * frame from the moment an opening has landed.
   */
  const fill: Attachment<HTMLElement> = (node) => {
    let scroller: HTMLElement | null | undefined;
    const cover = (ahead: boolean) => {
      // Out of the layout (a group not yet shown, motion/branch): nowhere.
      if (node.offsetParent === null) {
        return;
      }
      scroller ??= scrollerOf(node);
      const box = scroller?.getBoundingClientRect();
      const edge = Math.min(
        window.innerHeight,
        box?.bottom ?? window.innerHeight
      );
      const margin = ahead ? (box?.height ?? window.innerHeight) : 0;
      const short = edge + margin - node.getBoundingClientRect().top;
      if (short > 0) {
        drawn = reach(drawn, short);
      }
    };
    // Another pane scrolling moves nothing of the list.
    const scrolled = ({ target }: Event) => {
      if (target === document || (target as Node).contains(node)) {
        cover(true);
      }
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener("scroll", scrolled, options);
    // Before the first paint: a list drawn under a scroll already made (the
    // rail put back where it was) shows its rows, not the empty item.
    let frame = requestAnimationFrame(() => cover(false));
    // A row at a time, each drawn before the clock is read again, until the
    // frame's share is spent; then the next frame's.
    const more = () => {
      const from = performance.now();
      do {
        flushSync(() => {
          drawn =
            drawn + 1 < items.length ? drawn + 1 : Number.POSITIVE_INFINITY;
        });
      } while (drawn < items.length && performance.now() - from < DRAW_MS);
      frame = requestAnimationFrame(more);
    };
    const landed = setTimeout(
      () => {
        frame = requestAnimationFrame(more);
      },
      // An opening's longest (motion/branch `open`), and the frames its
      // batch waits before it starts.
      dur("--dur-cascade") + dur("--dur-rail") + SETTLE
    );
    return () => {
      document.removeEventListener("scroll", scrolled, options);
      cancelAnimationFrame(frame);
      clearTimeout(landed);
    };
  };
</script>

{#each shown as item (key(item))}
  {@render row(item)}
{/each}
{#if drawn < items.length}
  <li
    aria-hidden="true"
    class="tree-rest"
    data-tree-rest={rest.last}
    style:block-size="{rest.height}px"
    {@attach fill}
  ></li>
{/if}
