<script lang="ts">
  /**
   * The project page's views on a phone (under 640px; the strip holds them
   * wider): one bar docked where a session docks its composer, in the
   * composer's shell (app.css `.kit-dock-shell`), full width less --space-3
   * a side, --space-4 and the safe area above the foot. It arrives with the
   * page and never moves. Left to right:
   *
   * - the view pill, the select trigger's look at the composer's control
   *   height, saying the current view's name. Its list (the kit select) is
   *   the popover recipe on a bottom anchor: it rises from the bar's top
   *   edge, the bar's width, 8px over it, every view in it, Caw's drafts
   *   with their badge and Decisions with the pages waiting on picks. A
   *   pick closes it, the word morphs to the new name (MorphText) and the
   *   pill's width follows it over --dur-morph on --ease-out;
   * - `tools`, the page's: the tasks' filter as its glyph and count while
   *   one stands on a view of the tasks (TaskFilterPopover `compact`; the
   *   head's `⋯` opens it);
   * - Needs you, the page's filter (NeedsYouChip), while something needs you;
   * - New session, the screen's one coral control, on Send's recipe
   *   (app.css `.kit-send`).
   *
   * The pill and "+" press to --press-scale over --dur-toggle.
   */
  import { type Snippet, untrack } from "svelte";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { IconPlus } from "#lib/icons.js";
  import NeedsYouChip from "./NeedsYouChip.svelte";

  export interface BarView {
    /** Decision pages waiting on picks: the Decisions view's number. */
    count: number;
    draft: boolean;
    label: string;
    value: string;
  }

  let {
    views,
    current,
    onchoose,
    needs,
    needsOn,
    ontoggleneeds,
    onnewsession,
    tools,
  }: {
    /** What the page sets after the pill: the tasks' filter while one stands. */
    tools?: Snippet;
    views: BarView[];
    current: string;
    onchoose: (view: string) => void;
    /** How many tasks need you; the chip stands only while it is not 0. */
    needs: number;
    /** The Needs you filter is on. */
    needsOn: boolean;
    ontoggleneeds: () => void;
    /** New session, from the "+" it opens over. */
    onnewsession: (anchor: HTMLElement) => void;
  } = $props();

  let shell = $state<HTMLElement | null>(null);
  let pill = $state<HTMLElement | null>(null);
  let measure = $state<HTMLElement | null>(null);
  const label = $derived(
    views.find((view) => view.value === current)?.label ?? ""
  );

  /** How wide `words` lay out in the pill's face. */
  function wordWidth(words: string): number {
    if (!measure) {
      return 0;
    }
    measure.textContent = words;
    const { width } = measure.getBoundingClientRect();
    measure.textContent = "";
    return width;
  }

  /**
   * The pill's width follows its word: read before the new name is drawn,
   * the pill runs from the width it stood at to the one the new name lays
   * out at, on the morph's clock (--dur-morph, --ease-out), its word
   * clipped inside while the letters cross. The widths are read before the
   * new name is drawn; the run starts after, in the update that starts the
   * word's morph, on its start time. Less motion: the width lands at once.
   */
  let shownLabel = untrack(() => label);
  let follow: { from: number; to: number } | null = null;
  $effect.pre(() => {
    const next = label;
    const was = shownLabel;
    shownLabel = next;
    if (next === was || !pill || !motionOk.current) {
      return;
    }
    const from = pill.getBoundingClientRect().width;
    follow = { from, to: from - wordWidth(was) + wordWidth(next) };
  });
  $effect(() => {
    // Runs after each new name is drawn.
    if (!(label && follow && pill)) {
      return;
    }
    const { from, to } = follow;
    follow = null;
    const run = pill.animate(
      [{ inlineSize: `${from}px` }, { inlineSize: `${to}px` }],
      { duration: dur("--dur-morph"), easing: ease("--ease-out") }
    );
    // The morph's letters start now (morph.ts pins theirs to the timeline's
    // time), not at the next frame as a fresh run would.
    run.startTime = document.timeline.currentTime;
  });
</script>

<!-- Where a session docks its composer (Composer `.dock`): over the page's
     foot, which the page clears by the bar's reach. -->
<div
  class="absolute inset-x-space-3 bottom-(--off-bottom) z-20 phone:hidden"
  style:--off-bottom="calc(var(--space-4) + var(--safe-bottom))"
>
  <!-- literal: 10px -->
  <div
    data-slot="view-bar"
    class="group kit-dock-shell flex items-center gap-space-2 p-c-composer-inset coarse:gap-(--coarse-gap)"
    data-bar
    style:--bar-control-radius="calc(var(--radius-lg) - var(--c-composer-inset))"
    style:--coarse-gap="10px"
    bind:this={shell}
  >
    <Select.Root
      onValueChange={(value) => {
        if (value) {
          onchoose(value);
        }
      }}
      type="single"
      value={current}
    >
      <Select.Trigger
        aria-label="View: {label}"
        class="group-data-bar:h-c-composer-field group-data-bar:min-w-0 group-data-bar:shrink group-data-bar:grow-0 group-data-bar:basis-auto group-data-bar:overflow-clip group-data-bar:rounded-(--bar-control-radius)"
        mark="chevron"
        bind:ref={pill}
      >
        <MorphText text={label} />
        <span
          aria-hidden="true"
          class="pointer-events-none invisible absolute whitespace-pre"
          bind:this={measure}
        ></span>
      </Select.Trigger>
      <Select.Content
        data-view-list
        align="start"
        class="max-w-(--list-max)"
        style="--list-max: calc(100vw - 2 * var(--space-3))"
        collisionPadding={8}
        customAnchor={shell}
        side="top"
        sideOffset={8}
      >
        {#each views as view (view.value)}
          <Select.Item label={view.label} value={view.value}>
            {#snippet children()}
              <span>{view.label}</span>
              {#if view.draft}
                <Badge variant="secondary"><span>draft</span></Badge>
              {:else if view.count > 0}
                <span
                  data-slot="count"
                  class="type-meta ms-auto text-ink-muted tabular-nums"
                  >{view.count}</span
                >
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    {@render tools?.()}
    {#if needs > 0}
      <NeedsYouChip
        class="touch-hit group-data-bar:h-c-composer-field group-data-bar:rounded-(--bar-control-radius)"
        count={needs}
        on={needsOn}
        ontoggle={ontoggleneeds}
      />
    {/if}
    <span class="flex-auto"></span>
    <button
      aria-label="New session"
      class="kit-send touch-hit pressable"
      style:--kit-send-press="var(--dur-toggle)"
      onclick={(event) => onnewsession(event.currentTarget)}
      type="button"
    >
      <IconPlus aria-hidden="true" />
    </button>
  </div>
</div>

<style>
  /* residual: unmapped */
  /* The shell's 7px inset all round; its controls at the composer's field
     height, concentric with it. On a coarse pointer the gap opens to 10px,
     so each control's touch area reaches 44px before its neighbour's. */
  [data-slot="view-bar"] {
    --hit-gap-x: var(--space-2);
  }
  @media (pointer: coarse) {
    [data-slot="view-bar"] {
      --hit-gap-x: var(--coarse-gap);
    }
  }
  /* residual: foreign-dom */
  /* The word gives way to the chevron while the width runs; a name longer
     than the bar has room for ends in an ellipsis (the list and the pill's
     name say it whole). */
  [data-slot="view-bar"] > :global([data-slot="select-trigger"] > .mark-text) {
    position: relative;
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The filter's glyph and count, at the bar's control height. */
  [data-slot="view-bar"] > :global([data-filter-trigger]) {
    flex: none;
    min-inline-size: var(--c-composer-field);
    inline-size: auto;
    block-size: var(--c-composer-field);
    border-radius: var(--bar-control-radius);
  }
</style>
