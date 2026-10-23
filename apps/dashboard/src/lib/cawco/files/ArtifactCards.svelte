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
   * axis). One waiting on the person (core artifact-needs.ts, the hub's
   * `pending`) wears the needs-you status dot on its picture's top-right
   * corner, the picture cut away round it (DESIGN.md, Status dot), echoing
   * three loops on the list's beat and then still, and says why first on
   * its meta line ("1d · 3 of 9").
   *
   * Or, as the person picks in the Artifacts head (files.svelte.ts
   * `artifactsView`), one row each in the attachments' own shape (FilesList):
   * the kind's glyph in the lead column, the name over what waits on the
   * person and its promoted commit, its age at the trailing edge. A row is
   * the same button its card is, so a switch moves each from its card's place
   * to its row's (reflow, `data-flip`), and a press opens it as the card's
   * does.
   */
  import {
    type ArtifactKind,
    type ArtifactSummary,
    artifactWords,
    reasonLine,
    reasonShort,
  } from "@cawco/core";
  import { type Component, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
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
  import { frameObserver } from "../frame-observer";
  import { echoBeat } from "../motion/echo.svelte";
  import { reflow } from "../motion/rows.svelte";
  import type { ArtifactCard, ArtifactsView } from "./files.svelte";

  let {
    cards,
    chosen = null,
    ghosts = 0,
    view = "thumbnails",
    onpick,
  }: {
    cards: ArtifactCard[];
    /** The masonry of thumbnails, or one row each. */
    view?: ArtifactsView;
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
    // Its width now, so the first frame painted has its columns; a change
    // after it in the next frame (frameObserver: the cards' spans resize
    // the scroller and Files' card above it).
    const region = box;
    // Its laid-out width, unscaled by Files' entrance and unrounded.
    const read = () => {
      width = Number.parseFloat(getComputedStyle(region).inlineSize) || 0;
    };
    read();
    const seen = frameObserver(read);
    seen.observe(region);
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
  /**
   * Keeps each card's drawn height, so its span is its own: read as it is
   * drawn, and a change after it in the next frame (frameObserver).
   */
  const measured: Attachment<HTMLElement> = (node) => {
    const id = node.dataset.artifact ?? "";
    // Its laid-out border box (a card is border-box), unscaled by Files'
    // entrance and unrounded, as its span is counted in.
    const read = () => {
      // A row's height is no card's: the masonry keeps what it last drew.
      // Read untracked: a switch keeps the card's attachment as it is.
      if (untrack(() => view) === "list") {
        return;
      }
      const height = Number.parseFloat(getComputedStyle(node).blockSize) || 0;
      if (height > 0 && Math.abs((drawn.get(id) ?? 0) - height) > 0.5) {
        drawn.set(id, height);
      }
    };
    read();
    const seen = frameObserver(read);
    seen.observe(node);
    return () => seen.disconnect();
  };
</script>

<!-- A card's least width: a thumbnail that still reads, and a name of a
     dozen characters beside its glyph. The gutter is the rows' edges, so a
     card's picture lines up with the head's glyph. In the list, one column
     edge to edge, as the attachments' rows stand, each row's own inset
     putting its glyph in the head's lead column. -->
<div
  bind:this={box}
  class={[
    "relative grid gap-x-space-2 pb-space-6",
    view === "list"
      ? "grid-cols-1"
      : "auto-rows-line grid-flow-dense grid-cols-(--lane-tracks) items-box-start px-(--gutter)",
  ]}
  data-files-cards
  data-files-view={view}
  style:--card-min="var(--c-artifact-card-min)"
  style:--gutter={"calc((var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2) - var(--space-1))"}
  style:--lane-tracks="repeat({count}, minmax(0, 1fr))"
  {@attach highlight({
    rows: "[data-files-card]",
    selected: '[data-files-card][aria-current="true"]',
    axis: view === "list" ? "y" : "xy",
  })}
  {@attach echoBeat()}
  {@attach reflow()}
>
  {#if ghosts > 0 && view === "list"}
    <!-- The Claim Of Nothing Rule: rows as they will stand, the attachments'
         skeleton row (FilesList). -->
    {#each Array.from({ length: ghosts }, (_, i) => i) as i (i)}
      <div
        aria-hidden="true"
        class="flex min-h-c-artifact-row-h items-center gap-c-row-inset ps-(--lead-pad) pe-c-row-inset"
        data-files-ghost
      >
        <span
          class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
          data-box><Skeleton cell="glyph" radius="text" /></span
        >
        <Skeleton
          class="w-(--name-w)"
          height="x-height"
          radius="line"
          style="--name-w: {[46, 34, 58][i % 3]}%"
          type="label"
        />
        <Skeleton
          class="ms-auto"
          height="x-height"
          radius="line"
          type="meta"
          width="age"
        />
      </div>
    {/each}
  {:else if ghosts > 0}
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
        <Skeleton class="w-full" height="picture" radius="chip" />
        <Skeleton class="my-space-2 w-3/5" line="label" radius="text" />
      </div>
    {/each}
  {/if}
  {#each placed as { card, lane, span } (card.artifact.id)}
    {@const artifact = card.artifact}
    {@const Glyph = GLYPHS[artifact.kind]}
    {@const waiting = artifact.pending}
    {@const age = formatAgeShort(Date.parse(artifact.createdAt))}
    <!-- mark-line: the picture stands over the words; the caption is the card's mark line.
         The card: the thumbnail and its words on one surface, a space-1 inset
         so the hover ghost and the pill frame the picture; its corner the
         picture's plus that inset (The Concentric Rule). Its one column is
         `minmax(0, 1fr)`, its slot's width: nothing it holds widens it.
         The row: the attachments' row (FilesList), its glyph in the lead
         column. One button either way, which a switch slides (data-flip). -->
    <button
      aria-current={artifact.id === chosen || undefined}
      class={view === "list"
        ? menuItemVariants({
            class:
              "relative flex min-h-c-artifact-row-h w-full min-w-0 items-center gap-c-row-inset rounded-sm border-none border-current bg-transparent ps-(--lead-pad) pe-c-row-inset text-start text-ink-strong select-none focus-inset",
          })
        : "select-none relative col-start-(--lane) row-end-(--span) grid min-w-0 grid-cols-1 gap-space-1 rounded-lg border-none border-current bg-transparent px-space-1 pt-space-1 pb-space-2 text-start text-ink-strong focus-inset"}
      data-artifact={artifact.id}
      data-files-card
      data-flip
      data-needs-you={waiting ? "" : undefined}
      style:--lane={view === "list" ? undefined : lane + 1}
      style:--span={view === "list" ? undefined : `span ${span}`}
      {@attach measured}
      onclick={() => onpick(artifact)}
      title={artifact.name}
      type="button"
    >
      {#if view === "list"}
        {@render listRow(card, Glyph, age)}
      {:else}
        {@render cardFace(card, Glyph, age)}
      {/if}
    </button>
  {/each}
</div>

<!-- The needs-you dot, centred on its box's top-right corner, and its echo
     over it, on the list's beat. -->
{#snippet needsDot()}
  <span
    data-slot="needs-dot"
    aria-hidden="true"
    class="pointer-events-none absolute z-5 top-(--dot-at) right-(--dot-at) size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
  ></span>
  <span
    data-ping
    data-echo
    data-slot="needs-dot"
    aria-hidden="true"
    class="pointer-events-none absolute z-5 top-(--dot-at) right-(--dot-at) size-(--status-dot-size) rounded-pill bg-status-attn-glyph opacity-0"
  ></span>
{/snippet}

<!-- What waits on the person, said in short and for a reader, and the
     promoted commit: the card's meta line after its age, the row's under its
     name. Its words apart by the gap, never by spaces a flex row would drop. -->
{#snippet metaParts(artifact: ArtifactSummary, lead: boolean)}
  {@const waiting = artifact.pending}
  {#if waiting?.pending[0]}{#if lead}<span aria-hidden="true">·</span>{/if}<span
      class="min-w-0 truncate"
      aria-hidden="true"
      data-slot="needs-reason">{reasonShort(waiting.pending[0])}</span
    ><span class="sr-only"
      >{artifactWords.waitingOnYou}: {reasonLine(waiting.pending)}</span
    >{/if}{#if artifact.promoted}{#if lead || waiting?.pending[0]}<span
        aria-hidden="true">·</span
      >{/if}<span
      class="min-w-0 truncate"
      title={artifactWords.promotedTitle(artifact.name)}
      >{artifactWords.promoted(artifact.promoted.commit.slice(0, 7))}</span
    >{/if}
{/snippet}

<!-- The page's words round the hit, the hit in strong ink as the finder
     marks it (FindRow `.reason`). -->
{#snippet within(card: ArtifactCard)}
  “{#each card.within ?? [] as part, j (j)}{#if part.matched}<mark
        class="bg-transparent font-medium text-ink-strong">{part.text}</mark
      >{:else}{part.text}{/if}{/each}”
{/snippet}

{#snippet cardFace(card: ArtifactCard, Glyph: Component, age: string)}
  {@const artifact = card.artifact}
  {@const waiting = artifact.pending}
  <!-- The picture in a well (DESIGN.md, Surfaces: `surface-well` with
       `border-well`, "a content well inside a raised card"): the well's
       ground while it loads, and its edge drawn over the picture, so a
       pale page keeps an edge on the cream card by day. Its shape is
       its own (`--shape`), whatever the picture's: the picture lies
       over the well, out of its flow, so a page taller than 3:4 never
       sizes it. -->
  <span
    class={[
      "relative grid aspect-(--shape) place-items-center overflow-clip rounded-sm bg-surface-well after:pointer-events-none after:absolute after:inset-0 after:rounded-inherit after:border after:border-border-well",
      waiting && "mask-(--hole-mask)",
    ]}
    data-files-thumb={pictured(artifact) ? "picture" : "glyph"}
    style:--shape="1 / {shape(artifact)}"
    style:--hole={waiting
      ? "calc(var(--status-dot-size) / 2 + var(--status-dot-cut))"
      : undefined}
    style:--hole-mask={waiting
      ? "radial-gradient(circle at 100% 0, transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"
      : undefined}
  >
    {#if artifact.thumbnail && pictured(artifact)}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load stands as its kind's glyph. -->
      <img
        alt=""
        class="absolute inset-0 size-full object-cover object-top"
        decoding="async"
        loading="lazy"
        onerror={() => broken.add(artifact.id)}
        src={thumbnailUrl(artifact.id, artifact.thumbnail, theme.resolved)}
      />
    {:else}
      <Glyph aria-hidden="true" class="size-icon-lg text-ink-subtle" />
    {/if}
  </span>
  {#if waiting}
    <!-- On the picture's top-right corner, the picture cut away round it
         (--status-dot-cut) so the card's own surface shows round it on any
         picture and under the hover and selected washes. -->
    <span
      class="contents"
      style:--dot-at="calc(var(--space-1) - var(--status-dot-size) / 2)"
      >{@render needsDot()}</span
    >
  {/if}
  <span class="mark-line flex min-w-0 items-center gap-space-1 px-space-row">
    <Glyph aria-hidden="true" class="size-icon-md flex-none text-ink-muted" />
    <span
      data-slot="name"
      class="type-label min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap"
      >{artifact.name}</span
    >
  </span>
  <span
    class="type-meta flex min-w-0 gap-space-1 px-space-row whitespace-nowrap text-ink-muted"
  >
    <span class="num flex-none">{age}</span>{@render metaParts(artifact, true)}
  </span>
  {#if card.within}
    <span
      class="type-meta line-clamp-2 wrap-anywhere px-space-row text-ink-subtle"
      data-files-within>{@render within(card)}</span
    >
  {/if}
{/snippet}

{#snippet listRow(card: ArtifactCard, Glyph: Component, age: string)}
  {@const artifact = card.artifact}
  {@const said = !!artifact.pending?.pending[0] || !!artifact.promoted}
  <!-- Its kind's glyph in the lead column, the dot just off the glyph's
       top-right corner, clear of its ink. -->
  <span
    class="relative grid size-c-row-lead flex-none place-items-center text-ink-muted"
    data-box
    style:--dot-at="calc((var(--c-row-lead) - var(--icon-md)) / 2 -
    var(--status-dot-size))"
  >
    <Glyph aria-hidden="true" class="size-icon-md" />
    {#if artifact.pending}{@render needsDot()}{/if}
  </span>
  <span class="flex min-w-0 flex-auto flex-col">
    <span data-slot="name" class="type-label min-w-0 truncate"
      >{artifact.name}</span
    >
    {#if said}
      <span
        class="type-meta flex min-w-0 gap-space-1 whitespace-nowrap text-ink-muted"
        >{@render metaParts(artifact, false)}</span
      >
    {/if}
    {#if card.within}
      <span class="type-meta truncate text-ink-subtle" data-files-within
        >{@render within(card)}</span
      >
    {/if}
  </span>
  <span class="num type-meta flex-none whitespace-nowrap text-ink-muted"
    >{age}</span
  >
{/snippet}
