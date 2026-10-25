<script lang="ts">
  /**
   * The project page's views on a phone (under 640px; the strip holds them
   * wider): one bar docked where a session docks its composer, full width
   * less --space-3 a side, --space-4 and the safe area above the foot, with
   * no ground of its own: its two groups are capsules of the composer's
   * glass. It arrives with the page and never moves. Left to right:
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
   * - Ask Caw (the head's own, which a phone's head has no room for), a
   *   bare "+" in a capsule of its own at the trailing end, off the coral (no
   *   view of a project is for asking him: DESIGN.md, One prominent action,
   *   trailing): it opens Caw's panel on a new thread, the caret in his
   *   composer (work in a project starts by telling Caw).
   *
   * The pill and "+" press to --press-scale over --dur-toggle.
   */
  import { type Snippet, untrack } from "svelte";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
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
    /** Ask Caw: his panel on a new thread. */
    onnewsession: () => void;
  } = $props();

  /**
   * A group of the bar: a capsule of the composer's glass (the panel
   * material at the base blur, its control edge and the tile shadow; the
   * opaque raised surface where transparency is reduced), its controls
   * concentric inside it.
   */
  const glass = (layout: string) =>
    cn(
      "rounded-pill border border-border-control bg-material-panel p-c-composer-inset shadow-tile backdrop-blur-(--material-blur) backdrop-saturate-(--material-saturate) concentric-in r-inset-c-inset-composer r-outer-pill reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none",
      layout
    );

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
     foot, which the page clears by the bar's reach. The bar draws no ground
     of its own; its controls stand in two groups, each a capsule of the
     composer's glass floating over the page (DESIGN.md, No bar ground;
     Floating groups of bare symbols): the view and what filters it leading,
     Ask Caw trailing. Its list rises from the bar's whole width. -->
<div
  class="absolute inset-x-space-3 bottom-(--off-bottom) z-(--layer-dock) phone:hidden"
  style:--off-bottom="calc(var(--space-4) + var(--safe-bottom))"
>
  <div
    data-slot="view-bar"
    class="group flex items-center gap-space-2"
    data-bar
    bind:this={shell}
  >
    <div
      data-slot="view-group"
      class={glass(
        "flex min-w-0 items-center gap-space-2 hit-gap-x-space-2 coarse:gap-space-3 coarse:hit-gap-x-space-3"
      )}
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
          class="group-data-bar:shrink group-data-bar:grow-0 group-data-bar:basis-auto"
          look="in-bar"
          mark="chevron"
          size="composer"
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
          class="touch-hit group-data-bar:h-c-composer-field group-data-bar:concentric-xs"
          count={needs}
          on={needsOn}
          ontoggle={ontoggleneeds}
        />
      {/if}
    </div>
    <span class="flex-auto"></span>
    <div data-slot="ask-group" class={glass("flex flex-none")}>
      <Button
        aria-label="Ask Caw"
        onclick={onnewsession}
        press="pressable"
        shape="inset"
        size="icon-composer"
        title="Ask Caw"
        variant="ghost"
      >
        <IconPlus aria-hidden="true" />
      </Button>
    </div>
  </div>
</div>
