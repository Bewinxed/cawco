<script lang="ts">
  /**
   * The skeleton of a piece, drawn in the server's HTML in the shape the
   * piece will take, so it stands in the first paint and nothing moves when
   * the content lands (owner's decisions of 2026-11-25).
   *
   * Its bones are captured from the piece itself at build time (`bun run
   * bones`: boneyard reads the piece's fixture on /dev/bones at every box
   * width where its layout changes), and drawn here (bones/draw.ts): every
   * captured layout is emitted, and a container query on the bones' own box
   * shows the one that fits. The shape is the one this slot last showed,
   * kept in a cookie (shape.ts), or the typical one its screen passes in.
   *
   * The look: 1px outlines at each element's own radius, the piece's own
   * faintest, the shapes it holds firmer, content outlines full, all under
   * one strength (--line-alpha); words as rows of faint Braille glyphs at
   * their ink's height; marks as line icons; a picture's well as a faint
   * repeating pattern fading to its edges. One band of coral light sweeps
   * each layer (two composited translates), from the first frame.
   *
   * When the data lands, each bone fades while the content sharpens from a
   * 4px blur over --duration-base, in reading order a step apart; with
   * reduced motion there is no light, and the hand-over is a fade.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { dur, sharpenIn } from "#lib/platform/motion/curves.svelte.js";
  import {
    draw,
    type Item,
    layerStyle,
    isList as listOf,
    readingSteps,
    runsPerRow,
  } from "./bones/draw.js";
  import { bonesOf, emptyBonesOf } from "./bones/index.js";
  import { BOXES, findRuns, lineCounts } from "./bones/ink.js";
  import {
    rememberSkeletonShape,
    type SkeletonShape,
    SLOT_KEY,
    skeletonShapes,
  } from "./shape.js";

  let {
    name,
    slot,
    loading,
    count,
    typical = {},
    children,
  }: {
    /** The piece: its bones' name. */
    name: string;
    /** This skeleton's place on its screen, a stable key: its last-seen shape is kept under it. */
    slot: string;
    /** The piece's data is still coming. */
    loading: boolean;
    /** A list's rows, once its data has landed. */
    count?: number;
    /** The shape drawn where this slot has never been seen. */
    typical?: SkeletonShape;
    /** The piece itself, drawn once it has its data. */
    children?: Snippet;
  } = $props();

  if (!SLOT_KEY.test(untrack(() => slot))) {
    throw new Error(
      `A skeleton slot key holds only letters, digits and : . / _ - ("${untrack(() => slot)}")`
    );
  }

  const shapes = skeletonShapes();
  const shape = $derived(shapes()[slot] ?? typical);
  const piece = $derived(bonesOf(name));
  const isList = $derived(listOf(piece));
  const empty = $derived(
    isList && shape.count === 0 ? emptyBonesOf(name) : undefined
  );
  const key = $derived(empty ? `${name}.empty` : name);
  const drawing = $derived(
    empty ? draw(empty, {}, slot) : draw(piece, shape, slot)
  );
  /** The sheet that shows the layer that fits (bones/draw.ts `layerSheet`). */
  const sheet = $derived(layerStyle(key, drawing));

  /** The hand-over has ended; null where the content was here from the start. */
  let ended = $state<boolean | null>(null);
  $effect.pre(() => {
    if (loading) {
      ended = false;
    }
  });

  /**
   * The bones' width as they waited, held through their fade: once the
   * content stands, the box may take the content's own width (a
   * shrink-to-fit parent), and the fading bones keep the drawing they had.
   * Read as the box is sized while it waits, never at the hand-over, when
   * the content is already laid out.
   */
  let waited = $state<number | undefined>(undefined);
  const keepWidth = frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().width,
    (width) => {
      if (untrack(() => loading)) {
        waited = width;
      }
    }
  );
  const held = $derived(
    loading || waited === undefined ? undefined : `${waited}px`
  );
  const bonesShown = $derived(loading || ended === false);

  /** The bones' box, the size container whose width picks the layer. */
  let layersBox = $state<HTMLElement | null>(null);

  /**
   * Each kind's look: outlines weighted by nesting (the piece's own
   * faintest, the shapes it holds firmer, content outlines full), firmer
   * where the reader asks for less transparency.
   */
  const LOOK: Record<Item["kind"], string> = {
    frame: "border border-current opacity-45 reduced-transparency:opacity-70",
    shape: "border border-current opacity-70 reduced-transparency:opacity-85",
    outline: "border border-current",
    well: "sketch-well border border-current opacity-70 reduced-transparency:opacity-85",
    words: "flex items-center overflow-hidden whitespace-pre font-mono",
    mark: "sketch-mark",
  };
  const ICON: Record<string, string> = {
    folder: "sketch-icon-folder",
    document: "sketch-icon-document",
    chip: "sketch-icon-chip",
    person: "sketch-icon-person",
    globe: "sketch-icon-globe",
    tesseract: "sketch-icon-tesseract",
    terminal: "sketch-icon-terminal",
    key: "sketch-icon-key",
  };
  const PATTERN: Record<string, string> = {
    plus: "sketch-pattern-plus",
    hatch: "sketch-pattern-hatch",
    waves: "sketch-pattern-waves",
    honeycomb: "sketch-pattern-honeycomb",
    rings: "sketch-pattern-rings",
    chevron: "sketch-pattern-chevron",
    grid: "sketch-pattern-grid",
  };
  const looks = (item: Item, fades: boolean): string =>
    [
      "absolute top-(--sketch-y) left-(--sketch-x) box-border h-(--sketch-h) w-(--sketch-w) rounded-(--sketch-r) text-(length:--sketch-glyph) tracking-(--sketch-track)",
      LOOK[item.kind],
      item.icon ? ICON[item.icon] : "",
      item.pattern ? PATTERN[item.pattern] : "",
      fades ? "group-aria-busy-false/sk:animate-sketch-out" : "",
    ].join(" ");

  /** A bone's corner: its own radius, or a circle's. */
  const radius = (item: Item): string | undefined => {
    if (item.kind === "mark" || item.kind === "words") {
      return undefined;
    }
    return item.r === "circle" ? "50%" : `${item.r}px`;
  };
  /** Glyphs a little taller than the ink, a step of about one character. */
  const glyph = (item: Item): string | undefined =>
    item.kind === "words" ? `${(item.hpx * 1.3).toFixed(1)}px` : undefined;
  const track = (item: Item): string | undefined =>
    item.kind === "words" ? `${(-0.06 * item.hpx).toFixed(2)}px` : undefined;

  /** What sharpens in turn: every run of words, and every box drawn whole. */
  function leavesOf(root: Element): Element[] {
    const all = [
      ...findRuns(root),
      ...root.querySelectorAll([...BOXES].join(",")),
    ];
    return all.filter(
      (el) => !all.some((other) => other !== el && other.contains(el))
    );
  }

  /**
   * Off screen the light holds still, so a skeleton nobody sees costs
   * nothing: its sweep pauses while its box is out of the window.
   */
  function pauseAway(node: HTMLElement) {
    const seen = new IntersectionObserver(([entry]) => {
      node.toggleAttribute("data-away", !entry?.isIntersecting);
    });
    seen.observe(node);
    return () => seen.disconnect();
  }

  const onScreen = (r: DOMRect): boolean =>
    r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;

  /** The shape the content landed in, kept for this slot's next skeleton. */
  function remember(root: Element): void {
    const perRow = runsPerRow(piece);
    const found = lineCounts(root);
    const next: SkeletonShape = {};
    if (isList) {
      next.count = count ?? 0;
      if (next.count === 0) {
        next.lines = shape.lines;
      } else if (found.length === next.count * perRow) {
        next.lines = found.slice(0, perRow);
      }
    } else if (found.length === perRow) {
      next.lines = found;
    }
    rememberSkeletonShape(slot, next);
  }

  /**
   * The content has landed: the bones fade a step apart in reading order
   * (their steps counted from the first on screen), and every leaf of the
   * content sharpens out of a blur in the same order.
   */
  function handOver(node: HTMLElement) {
    let live = true;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    if (untrack(() => ended) !== false) {
      fonts.then(() => {
        if (live) {
          remember(node);
        }
      });
      return () => {
        live = false;
      };
    }
    const step = dur("--duration-fast") / 4;
    const animations: Animation[] = [];
    const box = untrack(() => layersBox);
    if (box) {
      const shown = [...box.querySelectorAll<HTMLElement>("[data-lines] > *")];
      const visible = shown
        .filter((el) => onScreen(el.getBoundingClientRect()))
        .map((el) => Number(el.style.getPropertyValue("--sketch-at")) || 0);
      const first = visible.length ? Math.min(...visible) : 0;
      box.style.setProperty(
        "--sketch-from-at",
        String(first > 1 ? first - 1 : 0)
      );
      // The bones' own fades, which the page's styles start.
      animations.push(...box.getAnimations({ subtree: true }));
    }
    const leaves = leavesOf(node);
    const rects = leaves.map((el) => el.getBoundingClientRect());
    const steps = readingSteps(
      rects.map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })),
      rects.map(() => false)
    );
    leaves.forEach((el, i) => {
      const rect = rects[i];
      if (rect && onScreen(rect)) {
        animations.push(sharpenIn(el, (steps[i] ?? 0) * step));
      }
    });
    // Once every bone has faded and every part has sharpened, the bones go,
    // and the shape is read from the content standing still: a run still
    // fading in from nothing is not counted (ink.ts `shown`).
    Promise.allSettled([...animations.map((a) => a.finished), fonts]).then(
      () => {
        if (live) {
          ended = true;
          remember(node);
        }
      }
    );
    return () => {
      live = false;
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }
</script>

{#snippet lines(items: Item[], fades: boolean)}
  {#each items as item, k (k)}
    <span
      class={looks(item, fades)}
      style:--sketch-at={item.at}
      style:--sketch-glyph={glyph(item)}
      style:--sketch-h={item.h}
      style:--sketch-r={radius(item)}
      style:--sketch-track={track(item)}
      style:--sketch-w={item.w}
      style:--sketch-x={item.x}
      style:--sketch-y={item.y}
      >{#if item.glyphs}{item.glyphs}{/if}</span
    >
  {/each}
{/snippet}

<div class="group/sk relative" aria-busy={loading} data-slot="skeleton-of">
  {#if !loading}
    <div class="flow-root" {@attach handOver}>{@render children?.()}</div>
  {/if}
  {#if bonesShown}
    <!-- The bones' own box is the size container, so a skeleton in a
         shrink-to-fit parent holds the piece's natural width, and the
         content beside it never stands inside the container. -->
    <div
      class="pointer-events-none relative @container text-sketch forced-color-adjust-none [contain-intrinsic-inline-size:var(--sketch-natural)] group-aria-busy-false/sk:absolute group-aria-busy-false/sk:top-0 group-aria-busy-false/sk:left-0 group-aria-busy-false/sk:w-[var(--sketch-held,100%)] forced-colors:text-[CanvasText]"
      aria-hidden="true"
      data-bones={key}
      style:--sketch-held={held}
      style:--sketch-natural={`${drawing.natural}px`}
      bind:this={layersBox}
      {@attach pauseAway}
      {@attach keepWidth}
    >
      {@html sheet}
      {#each drawing.layers as layer (`${layer.set}:${layer.from}`)}
        <div
          class="relative h-(--sketch-layer)"
          data-from={layer.from}
          data-set={layer.set}
          style:--sketch-layer={layer.height}
        >
          <div
            class="absolute inset-0 opacity-60 reduced-transparency:opacity-100"
            data-lines
          >
            {@render lines(layer.items, true)}
          </div>
          <div
            class="sketch-light absolute inset-y-0 left-0 w-3/10 overflow-hidden in-data-away:[animation-play-state:paused] group-aria-busy-false/sk:hidden motion-reduce:hidden motion-safe:group-aria-busy/sk:animate-sketch-sweep"
          >
            <div
              class="sketch-lit absolute inset-y-0 left-0 text-accent opacity-80 in-data-away:[animation-play-state:paused] forced-colors:text-[Highlight] motion-safe:group-aria-busy/sk:animate-sketch-sweep-back"
            >
              {@render lines(
                layer.items.filter((it) => it.kind !== "frame"),
                false
              )}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
