<script lang="ts">
  /**
   * The stage's panel (the design graph's spec, The stage): the frame that
   * holds the stage page (stage-host canvas stage.ts), where the real
   * component stands in the kept state, live, at 1:1, on the page it lives
   * on with the page's gutter round it, in the scheme and at the width he
   * picked. The page lives on the stage's origin, so the panel draws only
   * what surrounds it; what the drawing needs across, the page says
   * (`laid`), and the split gives the stage that and no more.
   *
   * The page runs to the panel's top beneath the artifact panel's floating
   * head and pads its top by that head's room alone (`room`, the panel's
   * `--side-room`, which the graph tells the page: STAGE_ROOM), drawing its
   * own scroll edge effect under it; no hairline cuts the drawing off. That
   * room never changes, so nothing said over the stage moves the drawing
   * (DESIGN.md, The Nothing Jumps Rule; the owner's pick on the stage
   * notices, "Into the floating tools"). The kept state's name, the steps,
   * the view and the components' menu stand in the panel's head
   * (graph-head.ts); the scale is a figure among the view's tools.
   *
   * What the stage says of itself floats over the drawing's top as glass,
   * under the panel's head: the hub's link down (Not live), and while
   * comparing the state compared with, a press that shows it in the kept
   * one's place (the flip), or its name alone where the page stands the two
   * side by side, then what differs, led by its count, a press that shows
   * or folds the lines on a card under the glass (open on a stage a desk's
   * least wide or wider, folded on a phone's, until he chooses); each line
   * a link to its ring on the stage, its mark the ring's own, solid for
   * what came in or changed, dashed for what went. Two states that don't
   * differ say so in the glass.
   */
  import type { StageDifferences, StageLaid } from "@cawco/core/stage-graph";
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconChevronDown, IconCloudCross } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { figureOf } from "./figures";

  let {
    name,
    variant = null,
    stale = false,
    laid,
    frame,
    compare = null,
    lang,
    onflip,
    ondifference,
    need = $bindable(0),
    room = $bindable(0),
  }: {
    /** The kept state's name. */
    name: string;
    /** The variant's name, when it is not the state as written. */
    variant?: string | null;
    /** The hub's link is down: this is the last drawing. */
    stale?: boolean;
    /** How the page laid the drawing out; null until it has. */
    laid: StageLaid | null;
    /** The frame that holds the stage page, filling the field. */
    frame: Snippet;
    /**
     * Compare, while it is on and compares with a state: that state's
     * name, whether it is shown in the kept one's place, and what the page
     * last read differs (null until it has).
     */
    compare?: {
      flipped: boolean;
      name: string;
      read: StageDifferences | null;
    } | null;
    /** The page's language, for its figures. */
    lang: string | undefined;
    /** The state compared with pressed: shown in the kept one's place, or back. */
    onflip: () => void;
    /** A difference's line pressed, by its place in what the page read: its ring brought into view. */
    ondifference: (index: number) => void;
    /**
     * The width the stage asks of its column, px: what the page needs
     * across and the panel round it (its edge). 0 until the page has laid
     * the drawing out.
     */
    need?: number;
    /** The room the panel's head floats over at the field's top, px (`--side-room`): the page pads its top by it, as a scroll view's content inset clears a bar at rest, its ground running beneath (The Title Bars Follow Liquid Glass Rule). */
    room?: number;
  } = $props();

  /** The most lines of differences the stage's head names; the rest are counted. */
  const LINES_SHOWN = 12;
  /** The panel's own width less its field's: its edge. */
  let edge = $state(-1);
  /** The panel's own width, px. */
  let panel = $state(0);
  const found = $derived(compare?.read?.found ?? []);
  const beside = $derived(compare?.read?.beside === true);
  const lines = $derived(found.slice(0, LINES_SHOWN));
  /** He showed or folded the lines himself; null until he has. */
  let listOpen = $state<boolean | null>(null);
  /**
   * The lines stand open on a stage a desk's least wide or wider
   * (`c-graph-stage-min`) and folded on a narrower one, until he chooses:
   * at 390 thirteen lines took the stage above the drawer.
   */
  const listShown = $derived(
    listOpen ?? panel >= (browser ? numberOf("--c-graph-stage-min") : 0)
  );
  const uid = $props.id();
  $effect(() => {
    need = laid && edge >= 0 ? Math.ceil(laid.need + edge) : 0;
  });
</script>

<section
  data-slot="stage"
  aria-label={name}
  class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-surface-page timeline-scope-transcript-head"
>
  <!-- The field: the frame holding the stage page fills it; the page is
       its own scroller, its own page and gutter round the drawing. -->
  <div
    data-slot="stage-field"
    class="relative min-h-0 min-w-0 flex-1 bg-surface-page"
    style:--stage-room="{room}px"
    {@attach frameSize(
      (node: HTMLElement) => {
        const own = node.closest<HTMLElement>('[data-slot="stage"]');
        return {
          panel: own?.offsetWidth ?? 0,
          edge: own ? own.offsetWidth - node.clientWidth : 0,
        };
      },
      (measured) => {
        ({ panel, edge } = measured);
      }
    )}
  >
    {@render frame()}
  </div>
  <!-- The scroll edge effect under the panel's head for a drawing this
       document scrolls (a bench's stand-in names the timeline); the stage
       page in its frame is another document and draws its own (STAGE_ROOM). -->
  <HeadFade band="{room}px" tint="bg-surface-page" />
  <!-- The room the panel's head floats over, which the page pads its top
       by: the head's alone, so it never changes. -->
  <div
    aria-hidden="true"
    data-slot="stage-head"
    class="pointer-events-none absolute inset-x-0 top-0 h-(--side-room,0px)"
    {@attach frameSize(
      (node: HTMLElement) => node.offsetHeight,
      (value) => {
        room = value;
      }
    )}
  ></div>
  <!-- What the stage says of itself, floating over the drawing's top as
       glass under the panel's head (The Title Bars Follow Liquid Glass
       Rule): it takes no room, so the drawing stays where it stands.
       Nothing between its glasses takes a press from the drawing. -->
  {#if stale || compare || variant}
    <div
      class="pointer-events-none absolute inset-x-0 top-(--notices-top) z-2 flex min-w-0 flex-col items-start gap-space-2 px-space-3 *:pointer-events-auto"
      data-slot="stage-notices"
      style:--notices-top="calc(var(--side-room, 0px) + var(--space-2))"
    >
      {#if stale}
        <BarGlass form="group" title={words.stale}>
          <p
            role="status"
            class="mark-line m-0 inline-flex min-w-0 items-center gap-space-1 px-space-2 type-label text-status-attn-ink"
            data-slot="stage-stale"
          >
            <IconCloudCross
              aria-hidden="true"
              class="size-icon-md flex-none"
              data-box
            />
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{words.staleShort}</span
            >
          </p>
        </BarGlass>
      {/if}
      {#if compare || variant}
        <BarGlass form="group">
          {#if variant}
            <span class="min-w-0 truncate px-space-2 type-label text-ink-muted"
              >{variant}</span
            >
          {/if}
          {#if compare && beside}
            <span
              class="min-w-0 truncate px-space-2 type-label text-ink-muted"
              data-slot="stage-against">{words.comparedWith(compare.name)}</span
            >
          {:else if compare}
            <BarItem
              data-slot="stage-against"
              form="words"
              label={words.showCompared(compare.name)}
              onclick={onflip}
              pressed={compare.flipped}
              >{compare.flipped
                ? words.showingCompared(compare.name)
                : words.comparedWith(compare.name)}</BarItem
            >
          {/if}
          {#if compare && lines.length > 0}
            <BarItem
              aria-controls="{uid}-differences"
              data-slot="differences-count"
              expanded={listShown}
              form="words"
              label={words.differences}
              onclick={() => {
                listOpen = !listShown;
              }}
              tip={false}
            >
              <span class="mark-line inline-flex items-center gap-space-1">
                {@render countWords()}
              </span>
            </BarItem>
          {:else if compare?.read?.same}
            <span class="min-w-0 truncate px-space-2 type-label text-ink-muted"
              >{words.sameAs(compare.name)}</span
            >
          {/if}
        </BarGlass>
      {/if}
      {#if compare && listShown && lines.length > 0}
        {@render differenceCard()}
      {/if}
    </div>
  {/if}
</section>

<!-- Each difference a line, a link to its ring: one that went shows the
     compared state, where it stood, its ring dashed; one that came in or
     changed, the kept state. -->
{#snippet differenceLines()}
  <ul
    id="{uid}-differences"
    data-slot="differences"
    aria-label={words.differences}
    class="-ms-space-1 m-0 flex list-none flex-col items-start p-0"
  >
    {#each lines as line, at (at)}
      <li class="min-w-0">
        <button
          type="button"
          class="mark-line pointer-hit touch-hit flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2 rounded-sm px-space-1 text-start type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
          data-kind={line.kind}
          data-slot="difference"
          onclick={() => ondifference(at)}
        >
          <span
            aria-hidden="true"
            data-box
            class={[
              "inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring",
              line.kind === "went" && "border-dashed",
            ]}
          ></span>
          <span class="min-w-0 wrap-anywhere">{line.line}</span>
        </button>
      </li>
    {/each}
    {#if found.length > LINES_SHOWN}
      <li class="flex items-center px-space-1 type-meta text-ink-muted num">
        +{figureOf(found.length - LINES_SHOWN, lang)}
      </li>
    {/if}
  </ul>
{/snippet}

<!-- The differences' lines on a card of their own over the drawing, under
     the glass, as the map's card rises over it (floatingSurface). -->
{#snippet differenceCard()}
  <div
    class={[
      floatingSurface({ motion: "pop" }),
      "max-h-80 max-w-c-measure min-w-0 overflow-y-auto overscroll-contain ps-space-3",
    ]}
    data-slot="differences-card"
  >
    {@render differenceLines()}
  </div>
{/snippet}

<!-- The differences' count with its chevron, said in words. -->
{#snippet countWords()}
  <span
    aria-hidden="true"
    data-box
    class="inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring"
  ></span>
  <span class="num"
    >{words.differenceCount(found.length, figureOf(found.length, lang))}</span
  >
  <IconChevronDown
    aria-hidden="true"
    class={[
      "size-icon-sm flex-none text-ink-muted transition-transform duration-(--dur-control) ease-out",
      listShown && "rotate-180",
    ]}
    data-box
  />
{/snippet}
