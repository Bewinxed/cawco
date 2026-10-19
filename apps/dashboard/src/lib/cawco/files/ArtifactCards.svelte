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
   * across the top. Every card's shape is known before its picture loads
   * (the hub keeps each picture's size), so nothing moves as they arrive.
   * The one on show wears the list's selection pill (highlight, its grid
   * axis).
   */
  import {
    type ArtifactKind,
    type ArtifactSummary,
    artifactWords,
  } from "@cawco/core";
  import type { Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconWindow,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { thumbnailUrl } from "../artifact-api";
  import type { ArtifactCard } from "./files.svelte";

  let {
    cards,
    chosen = null,
    onpick,
  }: {
    cards: ArtifactCard[];
    /** The artifact on show beside Files. */
    chosen?: string | null;
    onpick: (artifact: ArtifactSummary) => void;
  } = $props();

  // ArtifactMenu's GLYPHS.
  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
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
  /** Each card to the column whose foot stands highest, in order. */
  const columns = $derived.by(() => {
    const feet = Array.from({ length: count }, () => 0);
    const lanes: ArtifactCard[][] = Array.from({ length: count }, () => []);
    for (const card of cards) {
      const lane = feet.indexOf(Math.min(...feet));
      lanes[lane].push(card);
      // The words count as a share of the width: one line, two with a hit.
      feet[lane] += shape(card.artifact) + (card.within ? 0.62 : 0.36);
    }
    return lanes;
  });
</script>

<div
  bind:this={box}
  class="cards"
  data-files-cards
  style:--lanes={count}
  {@attach highlight({
    rows: "[data-files-card]",
    selected: '[data-files-card][aria-current="true"]',
    axis: "xy",
  })}
>
  {#each columns as lane, i (i)}
    <div class="lane">
      {#each lane as card (card.artifact.id)}
        {@const artifact = card.artifact}
        {@const Glyph = GLYPHS[artifact.kind]}
        <!-- mark-line: the picture stands over the words; the caption is the card's mark line -->
        <button
          aria-current={artifact.id === chosen || undefined}
          class="card"
          data-artifact={artifact.id}
          data-files-card
          onclick={() => onpick(artifact)}
          title={artifact.name}
          type="button"
        >
          <span
            class="well"
            data-files-thumb={pictured(artifact) ? "picture" : "glyph"}
            style:aspect-ratio="1 / {shape(artifact)}"
          >
            {#if artifact.thumbnail && pictured(artifact)}
              <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load stands as its kind's glyph. -->
              <img
                alt=""
                decoding="async"
                loading="lazy"
                onerror={() => broken.add(artifact.id)}
                src={thumbnailUrl(
                  artifact.id,
                  artifact.thumbnail,
                  theme.resolved
                )}
              />
            {:else}
              <Glyph aria-hidden="true" class="well-glyph" />
            {/if}
          </span>
          <span class="caption mark-line">
            <Glyph aria-hidden="true" class="glyph" />
            <span class="name">{artifact.name}</span>
          </span>
          <span class="meta">
            <span class="num"
              >{formatAgeShort(Date.parse(artifact.createdAt))}</span
            >{#if artifact.promoted}<span aria-hidden="true">·</span><span
                class="promoted"
                title={artifactWords.promotedTitle(artifact.name)}
                >{artifactWords.promoted(
                  artifact.promoted.commit.slice(0, 7)
                )}</span
              >{/if}
          </span>
          {#if card.within}
            <span class="within" data-files-within
              >“{#each card.within as part, j (j)}{#if part.matched}<mark
                    >{part.text}</mark
                  >{:else}{part.text}{/if}{/each}”</span
            >
          {/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  /* A card's least width: a thumbnail that still reads, and a name of a
     dozen characters beside its glyph. */
  .cards {
    --card-min: 148px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--lanes), minmax(0, 1fr));
    column-gap: var(--space-2);
    align-items: start;
  }
  .lane {
    display: grid;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* The card: the thumbnail and its words on one surface, a space-1 inset
     so the hover ghost and the pill frame the picture; its corner the
     picture's plus that inset (The Concentric Rule). */
  .card {
    display: grid;
    gap: var(--space-1);
    min-inline-size: 0;
    padding: var(--space-1) var(--space-1) var(--space-2);
    border: 0;
    border-radius: calc(var(--radius-sm) + var(--space-1));
    background: none;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
  }
  /* The picture in a well (DESIGN.md, Surfaces: `surface-well` with
     `border-well`, "a content well inside a raised card"): the well's ground
     while it loads, and its edge drawn over the picture, so a pale page
     keeps an edge on the cream card by day. */
  .well {
    position: relative;
    display: grid;
    place-items: center;
    overflow: clip;
    border-radius: var(--radius-sm);
    background: var(--surface-well);

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border: 1px solid var(--border-well);
      border-radius: inherit;
      pointer-events: none;
    }
    & img {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      max-inline-size: none;
      object-fit: cover;
      object-position: top;
    }
    & :global(.well-glyph) {
      inline-size: var(--icon-lg);
      block-size: var(--icon-lg);
      color: var(--ink-subtle);
    }
  }
  .caption {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    padding-inline: calc(var(--space-1) / 2);

    & :global(.glyph) {
      flex: none;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
    }
  }
  .name {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  .meta,
  .within {
    padding-inline: calc(var(--space-1) / 2);
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  /* Its words apart by the gap, never by spaces a flex row would drop. */
  .meta {
    display: flex;
    gap: var(--space-1);
    min-inline-size: 0;
    white-space: nowrap;

    & .num {
      flex: none;
      font-variant-numeric: tabular-nums;
    }
  }
  .promoted {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
  }
  /* The page's words round the hit: two lines at most, the hit in strong
     ink as the finder marks it (FindRow `.reason`). */
  .within {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    color: var(--ink-subtle);

    & mark {
      background: none;
      color: var(--ink-strong);
      font-weight: var(--weight-strong);
    }
  }
</style>
