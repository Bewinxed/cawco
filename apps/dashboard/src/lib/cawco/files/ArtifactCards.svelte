<script lang="ts">
  /**
   * A session's artifacts as a masonry of their thumbnails (owner: "the
   * artifacts should have a thumbnail and be a masonry or thumbnail view").
   * Each card is the picture the hub keeps of it (a page's or preview's
   * capture as the pane took it, in the reader's scheme; a canvas's own
   * picture), at its own shape, a tall page held to 3:4 from its top; under
   * it the kind's glyph (ArtifactMenu's), the name giving way first, and a
   * meta line of its age and its promoted commit. One with no picture yet,
   * or whose picture didn't load, stands as its kind's glyph in the well at
   * the pane's 16:10. A search that matched the words on its page shows
   * them under the name, the hit marked as the finder marks it.
   *
   * As many columns as the region holds at `--card-min`, each card going to
   * the column whose foot stands highest, in order, so newest-first reads
   * across the top: one grid of 1px rows, each card spanning its own height
   * and the column gap, packed dense, in list order in the DOM. Every card's shape is
   * known before its picture loads (the hub keeps each picture's size), so
   * nothing moves as they arrive.
   * The one on show wears the list's selection pill (highlight, its grid
   * axis).
   */
  import {
    type ArtifactKind,
    type ArtifactSummary,
    artifactWords,
  } from "@cawco/core";
  import type { Component } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconGlobe,
    IconWindow,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { thumbnailUrl } from "../artifact-api";
  import type { ArtifactCard } from "./files.svelte";

  let {
    cards,
    chosen = null,
    ghosts = 0,
    onpick,
  }: {
    cards: ArtifactCard[];
    /** The artifact on show beside Files. */
    chosen?: string | null;
    /** Skeleton cards standing for a list still read. */
    ghosts?: number;
    onpick: (artifact: ArtifactSummary) => void;
  } = $props();

  // ArtifactMenu's GLYPHS.
  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
    browser: IconGlobe,
  };

  /** A tall page is shown from its top, at 3:4 at the tallest. */
  const TALLEST = 4 / 3;
  /** A card with no picture: the pane's own shape. */
  const PANE = 10 / 16;
  /** Pictures that didn't load: their card is its glyph in the well. */
  const broken = new SvelteSet<string>();
  const pictured = (artifact: ArtifactSummary) =>
    artifact.thumbnail !== null && !broken.has(artifact.id);
  /** A card's picture's height over its width. */
  const shape = ({ thumbnail }: ArtifactSummary) =>
    thumbnail && thumbnail.width > 0
      ? Math.min(thumbnail.height / thumbnail.width, TALLEST)
      : PANE;

  let box = $state<HTMLDivElement>();
  let width = $state(0);
  let cardMin = $state(1);
  let gap = $state(0);
  $effect(() => {
    if (!box) {
      return;
    }
    const styles = getComputedStyle(box);
    cardMin = Number.parseFloat(styles.getPropertyValue("--card-min")) || 1;
    gap = Number.parseFloat(styles.columnGap) || 0;
    const seen = new ResizeObserver(([entry]) => {
      ({ width } = entry.contentRect);
    });
    seen.observe(box);
    return () => seen.disconnect();
  });
  /** Columns: as many as hold a card at its least width, at least one. */
  const count = $derived(
    width > 0 ? Math.max(1, Math.floor((width + gap) / (cardMin + gap))) : 1
  );
  const columnWidth = $derived(
    width > 0 ? (width - gap * (count - 1)) / count : cardMin
  );
  /** Each card's height as drawn, by id; until drawn, its shape's. */
  const drawn = new SvelteMap<string, number>();
  /** A card's words under its picture, before it is drawn: one line and its meta, two more with a hit. */
  const WORDS_PX = 44;
  const WITHIN_PX = 36;
  const heightOf = (card: ArtifactCard) =>
    drawn.get(card.artifact.id) ??
    columnWidth * shape(card.artifact) +
      WORDS_PX +
      (card.within ? WITHIN_PX : 0);
  /**
   * Each card in list order, to the column whose foot stands highest, with
   * the rows it spans: drawn once, in one grid, so Tab and a screen reader
   * read them newest first across the top, as the eye does.
   */
  const placed = $derived.by(() => {
    const feet = Array.from({ length: count }, () => 0);
    return cards.map((card) => {
      const lane = feet.indexOf(Math.min(...feet));
      // Rows are 1px: a card spans its height and the gap under it, so the
      // gap between cards is the column gap, every time.
      const span = Math.ceil(heightOf(card) + gap);
      feet[lane] += span;
      return { card, lane, span };
    });
  });
  /** Keeps each card's drawn height, so its span is its own. */
  const measured: Attachment<HTMLElement> = (node) => {
    const id = node.dataset.artifact ?? "";
    const seen = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? 0;
      if (height > 0 && Math.abs((drawn.get(id) ?? 0) - height) > 0.5) {
        drawn.set(id, height);
      }
    });
    seen.observe(node);
    return () => seen.disconnect();
  };
</script>

<!-- A card's least width: a thumbnail that still reads, and a name of a
     dozen characters beside its glyph. The gutter is the rows' edges, so a
     card's picture lines up with the head's glyph. -->
<div
  bind:this={box}
  class="relative grid auto-rows-line grid-flow-dense grid-cols-(--lane-tracks) items-box-start gap-x-space-2 px-(--gutter) pb-space-6"
  data-files-cards
  style:--card-min="var(--c-artifact-card-min)"
  style:--gutter="calc((var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2) - var(--space-1))"
  style:--lane-tracks="repeat({count}, minmax(0, 1fr))"
  {@attach highlight({
    rows: "[data-files-card]",
    selected: '[data-files-card][aria-current="true"]',
    axis: "xy",
  })}
>
  {#if ghosts > 0}
    <!-- The Claim Of Nothing Rule: cards as they will stand, the pane's
         well and a caption line, in the masonry's own columns. -->
    {#each Array.from({ length: ghosts }, (_, i) => i) as i (i)}
      <div
        aria-hidden="true"
        class="col-start-(--lane) row-end-(--span) grid min-w-0 cursor-default gap-space-1 rounded-lg px-space-1 pt-space-1 pb-space-2"
        data-files-ghost
        style:--lane={(i % count) + 1}
        style:--span="span {Math.ceil(columnWidth * PANE + WORDS_PX + gap)}"
      >
        <Skeleton class="aspect-16/10 w-full" radius="chip" />
        <Skeleton class="my-space-2 h-space-2 w-3/5" radius="text" />
      </div>
    {/each}
  {/if}
  {#each placed as { card, lane, span } (card.artifact.id)}
    {@const artifact = card.artifact}
    {@const Glyph = GLYPHS[artifact.kind]}
    <!-- mark-line: the picture stands over the words; the caption is the card's mark line.
         The card: the thumbnail and its words on one surface, a space-1 inset
         so the hover ghost and the pill frame the picture; its corner the
         picture's plus that inset (The Concentric Rule). -->
    <button
      aria-current={artifact.id === chosen || undefined}
      class="col-start-(--lane) row-end-(--span) grid min-w-0 cursor-pointer gap-space-1 rounded-lg border-none border-current bg-transparent px-space-1 pt-space-1 pb-space-2 text-start text-ink-strong focus-inset"
      data-artifact={artifact.id}
      data-files-card
      style:--lane={lane + 1}
      style:--span="span {span}"
      {@attach measured}
      onclick={() => onpick(artifact)}
      title={artifact.name}
      type="button"
    >
      <!-- The picture in a well (DESIGN.md, Surfaces: `surface-well` with
           `border-well`, "a content well inside a raised card"): the well's
           ground while it loads, and its edge drawn over the picture, so a
           pale page keeps an edge on the cream card by day. -->
      <span
        class="relative grid aspect-(--shape) place-items-center overflow-clip rounded-sm bg-surface-well after:pointer-events-none after:absolute after:inset-0 after:rounded-inherit after:border after:border-border-well"
        data-files-thumb={pictured(artifact) ? "picture" : "glyph"}
        style:--shape="1 / {shape(artifact)}"
      >
        {#if artifact.thumbnail && pictured(artifact)}
          <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load stands as its kind's glyph. -->
          <img
            alt=""
            class="block size-full max-w-none object-cover object-top"
            decoding="async"
            loading="lazy"
            onerror={() => broken.add(artifact.id)}
            src={thumbnailUrl(artifact.id, artifact.thumbnail, theme.resolved)}
          />
        {:else}
          <Glyph aria-hidden="true" class="size-icon-lg text-ink-subtle" />
        {/if}
      </span>
      <span class="mark-line flex min-w-0 items-center gap-space-1 px-space-row">
        <Glyph
          aria-hidden="true"
          class="size-icon-md flex-none text-ink-muted"
        />
        <span class="type-label min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap">{artifact.name}</span>
      </span>
      <!-- Its words apart by the gap, never by spaces a flex row would drop. -->
      <span
        class="type-meta flex min-w-0 gap-space-1 px-space-row whitespace-nowrap text-ink-muted"
      >
        <span class="num flex-none"
          >{formatAgeShort(Date.parse(artifact.createdAt))}</span
        >{#if artifact.promoted}<span aria-hidden="true">·</span><span
            class="min-w-0 truncate"
            title={artifactWords.promotedTitle(artifact.name)}
            >{artifactWords.promoted(
              artifact.promoted.commit.slice(0, 7)
            )}</span
          >{/if}
      </span>
      {#if card.within}
        <!-- The page's words round the hit: two lines at most, the hit in
             strong ink as the finder marks it (FindRow `.reason`). -->
        <span
          class="type-meta line-clamp-2 wrap-anywhere px-space-row text-ink-subtle"
          data-files-within
          >“{#each card.within as part, j (j)}{#if part.matched}<mark
                class="bg-transparent font-medium text-ink-strong"
                >{part.text}</mark
              >{:else}{part.text}{/if}{/each}”</span
        >
      {/if}
    </button>
  {/each}
</div>
