<script lang="ts">
  /**
   * The artifacts as a masonry of their thumbnails: each card is its page
   * as the transcript's card keeps it (ToolGroup's thumbnail, at its own
   * shape, a tall page held to 3:4 from its top), under it the kind's glyph
   * (ArtifactMenu's GLYPHS), the name giving way first, and a meta line of
   * its age and its promoted commit. A search that matched the page's words
   * shows them under the name, the hit marked as the finder marks it.
   *
   * As many columns as the region holds at `--card-min`, each card going to
   * the shortest column in order, so newest-first reads across the top and
   * no column runs long. The one on show wears the list's selection pill
   * (components/ui/highlight, its grid axis).
   */
  import type { ArtifactKind } from "@cawco/core";
  import type { Component } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import IconArtifactPage from "~icons/solar/document-text-bold-duotone";
  import IconArtifactCanvas from "~icons/solar/pen-new-square-bold-duotone";
  import IconArtifactSheet from "~icons/solar/widget-4-bold-duotone";
  import IconWindow from "~icons/solar/window-frame-bold-duotone";
  import { type ArtifactRow, loadedAt } from "./fixtures";
  import type { Hit } from "./search";

  let {
    hits,
    chosen = null,
  }: { hits: Hit<ArtifactRow>[]; chosen?: string | null } = $props();

  // ArtifactMenu's GLYPHS.
  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    sheet: IconArtifactSheet,
  };

  /** A tall page is shown from its top, at 3:4 at the tallest. */
  const TALLEST = 4 / 3;
  /** A thumbnail's height over its width. */
  const shape = (hit: Hit<ArtifactRow>) =>
    Math.min(hit.item.thumb.h / hit.item.thumb.w, TALLEST);

  let box = $state<HTMLDivElement>();
  let width = $state(0);
  $effect(() => {
    if (!box) {
      return;
    }
    const seen = new ResizeObserver(([entry]) => {
      ({ width } = entry.contentRect);
    });
    seen.observe(box);
    return () => seen.disconnect();
  });

  /** Columns: as many as hold a card at its least width, at least one. */
  let cardMin = $state(0);
  let gap = $state(0);
  $effect(() => {
    if (!box) {
      return;
    }
    const styles = getComputedStyle(box);
    cardMin = Number.parseFloat(styles.getPropertyValue("--card-min")) || 1;
    gap = Number.parseFloat(styles.columnGap) || 0;
  });
  const count = $derived(
    width > 0 ? Math.max(1, Math.floor((width + gap) / (cardMin + gap))) : 1
  );
  /** Each card to the column whose foot stands highest, in order. */
  const columns = $derived.by(() => {
    const feet = Array.from({ length: count }, () => 0);
    const lanes: Hit<ArtifactRow>[][] = Array.from({ length: count }, () => []);
    for (const hit of hits) {
      const lane = feet.indexOf(Math.min(...feet));
      lanes[lane].push(hit);
      // The caption counts as a share of the width: one line, two with a hit.
      feet[lane] += shape(hit) + (hit.within ? 0.62 : 0.36);
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
      {#each lane as hit (hit.item.id)}
        {@const artifact = hit.item}
        {@const Glyph = GLYPHS[artifact.kind]}
        <button
          aria-current={artifact.id === chosen || undefined}
          class="card"
          data-artifact={artifact.id}
          data-files-card
          title={artifact.name}
          type="button"
        >
          <img
            alt=""
            class="thumb"
            decoding="async"
            loading="lazy"
            src={artifact.thumb.src}
            style:aspect-ratio="1 / {shape(hit)}"
          />
          <span class="caption mark-line">
            <Glyph aria-hidden="true" class="glyph" />
            <span class="name">{artifact.name}</span>
          </span>
          <span class="meta">
            <span class="num"
              >{formatAgeShort(loadedAt - artifact.age, loadedAt)}</span
            >{#if artifact.promoted}<span class="sep" aria-hidden="true">·</span
              ><span
                class="promoted"
                title="Promoted into the project's folder at artifacts/{artifact.name}/"
                >Promoted {artifact.promoted}</span
              >{/if}
          </span>
          {#if hit.within}
            <span class="within"
              >“{#each hit.within as part, j (j)}{#if part.matched}<mark
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
     thumbnail's plus that inset (concentric). */
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
  .thumb {
    display: block;
    inline-size: 100%;
    block-size: auto;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    object-fit: cover;
    object-position: top;
    outline: 1px solid var(--image-outline);
    outline-offset: -1px;
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
  /* The page's words around the hit: two lines at most, the hit in strong
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
