<script lang="ts">
  /**
   * The stage's panel (the design graph's spec, The stage): the kept
   * state's name at its head, and under it the frame that holds the stage
   * page (stage-host canvas stage.ts), where the real component stands in
   * that state, live, at 1:1, on the page it lives on with the page's
   * gutter round it, in the scheme and at the width he picked. The page
   * lives on the stage's origin, so the panel draws only what surrounds
   * it; what the drawing needs across, the page says (`laid`), and the
   * split gives the stage that and no more.
   *
   * One panel, as the room beside it is one: the same corner and edge,
   * the two sharing a top and a foot, and a head that floats over what it
   * heads, on the head line the room's faces stand on. The page runs to
   * the panel's top beneath the head and pads its top by the head's room
   * (`room`, which the graph tells the page: STAGE_ROOM), drawing its own
   * scroll edge effect under it; no hairline cuts the drawing off. The
   * head's inset is the page's gutter, so the name and the drawing share
   * one leading edge. What acts on the stage stands on its head: the
   * components' menu leading (`lead`, where the ask names several) and
   * one glass group of bare symbols trailing (`tools`: Compare, the view,
   * and the room's one switch).
   *
   * While comparing, the head names the state compared with: a press that
   * shows it in the kept one's place (the flip), or its name alone where
   * the page stands the two side by side. Under it what differs, led by its
   * count, a press that shows or folds the lines (open on a stage a desk's
   * least wide or wider, folded on a phone's, until he chooses); each line
   * a link to its ring on the stage, its mark the ring's own, solid for
   * what came in or changed, dashed for what went. Two states that don't
   * differ say so in one line.
   */
  import type { StageDifferences, StageLaid } from "@cawco/core/stage-graph";
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconChevronDown } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { browser } from "$app/env";
  import { figureOf } from "./figures";

  let {
    name,
    scale = null,
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
    lead,
    tools,
  }: {
    /** The kept state's name. */
    name: string;
    /** The variant's name, when it is not the state as written. */
    variant?: string | null;
    /** How the drawing is scaled down to stand whole, in words ("Scaled to 54%"); null at 1:1. */
    scale?: string | null;
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
    /** The room the floating head takes over the field's top, px: the page pads its top by it. */
    room?: number;
    /** What leads the head before the state's name: the components' menu, where the ask names several. */
    lead?: Snippet;
    /** What trails the head: the stage's glass of bare symbols. */
    tools?: Snippet;
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
  class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-page shadow-tile timeline-scope-transcript-head"
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
  <!-- The scroll edge effect under the head for a drawing this document
       scrolls (a bench's stand-in names the timeline); the stage page in its
       frame is another document and draws its own (STAGE_ROOM). -->
  <HeadFade band="{room}px" tint="bg-surface-page" />
  <!-- Its head floats over the field as every bar does (DESIGN.md, The
       Title Bars Follow Liquid Glass Rule): no ground and no hairline, the
       page running to the panel's top beneath it and taking its room
       (`room`, STAGE_ROOM), the page's own scroll edge effect under it. The
       name, the glass, and while comparing what differs; nothing between
       its parts takes a press from the drawing. -->
  <div
    data-slot="stage-head"
    class="pointer-events-none absolute inset-x-0 top-0 z-1 flex min-w-0 flex-col px-space-4"
    {@attach frameSize(
      (node: HTMLElement) => node.offsetHeight,
      (value) => {
        room = value;
      }
    )}
  >
    <!-- Unclipped: the glass's focus ring and the view card's join stand
         out past its box. -->
    <header
      class="flex h-c-head-room min-w-0 items-center gap-x-space-3 *:pointer-events-auto"
      data-slot="stage-bar"
    >
      {@render lead?.()}
      <h2 class="m-0 min-w-0 shrink type-title text-ink-strong">
        <span class="block truncate">{name}</span>
      </h2>
      {#if variant}
        <span class="min-w-0 truncate type-label text-ink-muted">{variant}</span
        >
      {/if}
      {#if compare && beside}
        <span
          class="min-w-0 truncate type-label text-ink-muted"
          data-slot="stage-against">{words.comparedWith(compare.name)}</span
        >
      {:else if compare}
        <!-- The state it is compared with, a press that shows it in the
             kept one's place, rings where its gone parts stood, and back. -->
        <button
          type="button"
          aria-pressed={compare.flipped}
          class="pointer-hit touch-hit min-w-0 truncate rounded-sm px-space-1 type-label text-ink-muted transition-control aria-pressed:bg-selected-bg aria-pressed:text-selected-ink aria-pressed-false:can-hover:hover:bg-surface-hover"
          data-slot="stage-against"
          onclick={onflip}
          title={words.showCompared(compare.name)}
          >{compare.flipped
            ? words.showingCompared(compare.name)
            : words.comparedWith(compare.name)}</button
        >
      {/if}
      {#if scale || tools}
        <div
          class="-me-space-2 ms-auto flex flex-none items-center gap-x-space-3"
        >
          {#if scale}
            <!-- Not 1:1: what the person judges is scaled, and says so. -->
            <span
              class="flex-none type-meta text-ink-muted num"
              data-slot="stage-scale">{scale}</span
            >
          {/if}
          {@render tools?.()}
        </div>
      {/if}
    </header>
    {#if stale}
      <p
        data-slot="stage-stale"
        role="status"
        class="m-0 pb-space-3 type-meta text-status-attn-ink"
      >
        {words.stale}
      </p>
    {/if}
    {#if compare && lines.length > 0}
      <!-- What differs: led by its count, a press that shows or folds the
           lines (folded where the stage is a phone's, so the drawing
           stands in sight under the head); each line's mark the ring's own,
           solid for came in or changed, dashed for went. -->
      <button
        type="button"
        aria-controls="{uid}-differences"
        aria-expanded={listShown}
        class="pointer-events-auto mark-line pointer-hit touch-hit -ms-space-1 mb-space-2 flex h-c-btn-h-sm items-center gap-space-1 self-start rounded-sm px-space-1 type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
        data-slot="differences-count"
        onclick={() => {
          listOpen = !listShown;
        }}
      >
        <span
          aria-hidden="true"
          data-box
          class="inline-block size-space-3 flex-none rounded-xs border-(length:--c-change-ring-width) border-c-change-ring"
        ></span>
        <span class="num"
          >{words.differenceCount(
            found.length,
            figureOf(found.length, lang)
          )}</span
        >
        <IconChevronDown
          aria-hidden="true"
          class={[
            "size-icon-md flex-none text-ink-muted transition-transform duration-(--dur-control) ease-out",
            listShown && "rotate-180",
          ]}
          data-box
        />
      </button>
      {#if listShown}
        <ul
          id="{uid}-differences"
          data-slot="differences"
          aria-label={words.differences}
          class="pointer-events-auto -ms-space-1 m-0 flex list-none flex-col items-start p-0 pb-space-2"
        >
          {#each lines as line, at (at)}
            <li class="min-w-0">
              <!-- Each line a link to its ring: one that went shows the
                   compared state, where it stood, its ring dashed; one
                   that came in or changed, the kept state. -->
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
            <li
              class="flex items-center px-space-1 type-meta text-ink-muted num"
            >
              +{figureOf(found.length - LINES_SHOWN, lang)}
            </li>
          {/if}
        </ul>
      {/if}
    {:else if compare?.read?.same}
      <p
        class="m-0 pb-space-3 type-label text-ink-muted"
        data-slot="differences-none"
      >
        {words.sameAs(compare.name)}
      </p>
    {/if}
  </div>
</section>
