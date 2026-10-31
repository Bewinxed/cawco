<script lang="ts">
  /**
   * Option 1, the timeline: the states are keyframes on one track at the
   * panel's foot and each move is the gap between two of them. The gap is
   * the scrubber: drag across it to hold the move, let go to land on the
   * nearer state, press its play to run it. A keyframe pressed is kept; one
   * a pointer rests on (or a finger holds) is previewed over the stage with
   * the differences washed, and on a window that holds two production
   * widths it stands beside the kept one instead. The track's sheet drags
   * up past half into the map (the branch's StateGraph): the same states
   * all at once, the stage never moving under it. The live component is one
   * TaskColumn whose args change, so every move is its own motion.
   */
  import { designGraphWords } from "@cawco/core/words/design-graph";
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import { tick } from "svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import GlassGroup from "#lib/cawco/preview/graph/GlassGroup.svelte";
  import StateGraph from "#lib/cawco/preview/graph/StateGraph.svelte";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChat,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconChevronUp,
    IconPause,
    IconPlay,
    IconStructure,
  } from "#lib/icons.js";
  import Adjust from "../shared/Adjust.svelte";
  import Clips from "../shared/Clips.svelte";
  import { FILE, pointAt, SECTION_GRAPH } from "../shared/graph";
  import { Judge } from "../shared/judge.svelte";
  import ProtoBar from "../shared/ProtoBar.svelte";
  import {
    ASK,
    COMPONENT_NAME,
    linkBetween,
    noWayIn,
    SEQUENCE,
    STATES,
    stateOf,
  } from "../shared/review.svelte";
  import Stage from "../shared/Stage.svelte";
  import ViewSettings from "../shared/ViewSettings.svelte";

  let {
    height = 900,
    kept = SEQUENCE[0],
    seeing = "order",
  }: {
    /** The panel's height in this frame. */
    height?: number;
    /** The state the visit opens on. */
    kept?: string;
    /** The way of seeing it opens on: in order, or all at once (the map). */
    seeing?: "order" | "all";
  } = $props();

  // svelte-ignore state_referenced_locally
  const judge = new Judge(kept);

  /** The track's order: the agent's sequence, then the states it leaves out, in file order. */
  const TRACK = [
    ...SEQUENCE,
    ...STATES.map((one) => one.story).filter((one) => !SEQUENCE.includes(one)),
  ];
  /** The track's lanes: each run of one group, its heading once. */
  const LANES = TRACK.reduce<{ group: string; stories: string[] }[]>(
    (lanes, story) => {
      const { group } = stateOf(story);
      const last = lanes.at(-1);
      if (last?.group === group) {
        last.stories.push(story);
      } else {
        lanes.push({ group, stories: [story] });
      }
      return lanes;
    },
    []
  );

  let width = $state(0);
  const phone = $derived(width > 0 && width < 640);
  /** Two production widths and their gutters fit: a held keyframe stands beside the kept one. */
  const twoUp = $derived(width >= 2 * (judge.width + 96) + 64);

  /* --- The sheet: rest, put away, unfolded into the map ------------------ */

  let restH = $state(0);
  /** The sheet's height while the person sized it or unfolded it; null at rest, 0 put away. */
  // svelte-ignore state_referenced_locally
  let sheetH = $state<number | null>(seeing === "all" ? height * 0.66 : null);
  const mapOpen = $derived(sheetH !== null && sheetH > height * 0.45);
  const away = $derived(sheetH === 0);
  const sheetFace = $derived.by(() => {
    if (away) {
      return "away";
    }
    return mapOpen ? "map" : "track";
  });
  let drag: { y: number; from: number; id: number } | null = null;

  const seeAll = (all: boolean) => {
    sheetH = all ? height * 0.66 : null;
  };

  /* --- Holding a keyframe: the preview ----------------------------------- */

  let held = $state<string | null>(null);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    judge.peek = held && held !== judge.kept && !twoUp ? held : null;
  });

  /* --- Scrubbing a gap ---------------------------------------------------- */

  let scrubbing = $state<{ from: string; to: string; f: number } | null>(null);
  const fractionAt = (event: PointerEvent, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  };
  /** Where the thumb stands on a gap: the scrub, or the move playing into the kept state. */
  const thumbOn = (from: string, to: string): number | null => {
    if (scrubbing && scrubbing.from === from && scrubbing.to === to) {
      return scrubbing.f;
    }
    const { move } = judge;
    if (
      move?.from === from &&
      move.to === to &&
      (judge.runner.running || judge.runner.held) &&
      judge.runner.length > 0
    ) {
      return judge.runner.at / judge.runner.length;
    }
    return null;
  };

  let clipsOpen = $state(false);
  let liveRoot = $state<HTMLElement | null>(null);
  let besideRoot = $state<HTMLElement | null>(null);
  let track = $state<HTMLElement | null>(null);

  // The kept keyframe stays in view, centred on a phone (T18).
  $effect(() => {
    const story = judge.kept;
    tick().then(() => {
      track?.querySelector(`[data-keyframe="${story}"]`)?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    });
  });

  const keyed = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [role=slider]")) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === "k") {
      judge.step(1);
    } else if (event.key === "ArrowLeft" || event.key === "j") {
      judge.step(-1);
    } else if (event.key === "Home") {
      judge.end("first");
    } else if (event.key === "End") {
      judge.end("last");
    } else if (event.key === "c") {
      judge.commenting = !judge.commenting;
    } else {
      return;
    }
    event.preventDefault();
  };

  const remarksOn = (story: string) => judge.remarksOn(story).length;
</script>

{#snippet keyframe(story: string)}
  {@const state = stateOf(story)}
  {@const isKept = judge.kept === story}
  {@const count = remarksOn(story)}
  <button
    aria-current={isKept ? "step" : undefined}
    class={[
      "relative flex min-h-c-btn-h-sm flex-none flex-col items-start justify-center gap-space-row rounded-md px-space-2 py-space-1 text-start touch-hit transition-[background-color,box-shadow] duration-(--dur-control) ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)",
      isKept
        ? "w-c-graph-node-w bg-selected-bg text-selected-ink inset-ring-2 inset-ring-brand-solid"
        : "min-w-c-steps-stop-min-w bg-surface-raised text-ink-strong inset-ring inset-ring-border-hairline hover:bg-surface-hover",
      held === story && !isKept && "bg-surface-hover",
    ]}
    data-keyframe={story}
    onclick={() => {
      held = null;
      judge.go(story);
    }}
    onpointerdown={(event) => {
      if (event.pointerType !== "mouse") {
        holdTimer = setTimeout(() => {
          held = story;
        }, dur("--dur-press-hold"));
      }
    }}
    onpointerenter={(event) => {
      if (event.pointerType === "mouse") {
        held = story;
      }
    }}
    onpointerleave={() => {
      clearTimeout(holdTimer);
      held = null;
    }}
    onpointerup={() => clearTimeout(holdTimer)}
    type="button"
  >
    <span class="flex w-full items-center gap-space-1">
      <span class="min-w-0 flex-1 truncate type-label">{state.name}</span>
      {#if count > 0}
        <span
          aria-label={words.openRemarks(count)}
          role="img"
          class="flex flex-none items-center gap-px type-meta tabular-nums"
          ><IconChat class="size-icon-sm" />{count}</span
        >
      {/if}
    </span>
    {#if isKept}
      <span class="line-clamp-2 type-meta">{state.note}</span>
    {/if}
    {#if noWayIn(story)}
      <span class="type-meta text-ink-subtle">{words.noWayIn}</span>
    {/if}
  </button>
{/snippet}

{#snippet gap(from: string, to: string)}
  {@const link = linkBetween(from, to)}
  {#if link?.kind === "move"}
    {@const thumb = thumbOn(from, to)}
    {@const length = judge.lengthOf(from, to)}
    <div
      class="relative flex h-c-btn-h-sm w-[calc(2*var(--c-steps-stop-min-w))] flex-none flex-col items-center justify-center self-start"
      data-gap="{from}>{to}"
    >
      <div
        aria-label={words.holdMove(stateOf(from).name, stateOf(to).name)}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round((thumb ?? (judge.kept === to ? 1 : 0)) * 100)}
        class="relative h-c-btn-h-sm w-full cursor-ew-resize touch-none rounded-pill focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
        onkeydown={async (event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const f = Math.max(
              0,
              Math.min(
                1,
                (thumb ?? 0) + (event.key === "ArrowRight" ? 0.1 : -0.1)
              )
            );
            if (!scrubbing) {
              scrubbing = { from, to, f };
              await judge.scrubStart(from, to);
            }
            scrubbing = { from, to, f };
            judge.scrub(f);
          } else if (event.key === "Enter" && scrubbing) {
            const { f } = scrubbing;
            scrubbing = null;
            await judge.scrubEnd(f);
          }
        }}
        onpointerdown={async (event) => {
          const el = event.currentTarget;
          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            // A pointer the browser no longer tracks: the gesture carries on uncaptured.
          }
          const f = fractionAt(event, el);
          scrubbing = { from, to, f };
          await judge.scrubStart(from, to);
          if (scrubbing) {
            judge.scrub(scrubbing.f);
          }
        }}
        onpointermove={(event) => {
          if (scrubbing && scrubbing.from === from && scrubbing.to === to) {
            const f = fractionAt(event, event.currentTarget);
            scrubbing = { from, to, f };
            judge.scrub(f);
          }
        }}
        onpointerup={async () => {
          if (scrubbing) {
            const { f } = scrubbing;
            scrubbing = null;
            await judge.scrubEnd(f);
          }
        }}
        role="slider"
        tabindex="0"
      >
        <!-- The move's double line: told from a link's single one (T5). -->
        <span
          class={[
            "absolute inset-x-0 top-1/2 h-[calc(3*var(--c-graph-edge))] -translate-y-1/2 border-y-(length:--c-graph-edge)",
            judge.kept === to
              ? "border-(color:--c-graph-edge-chosen)"
              : "border-(color:--c-graph-edge-ink)",
          ]}
        ></span>
        {#if thumb !== null}
          <span
            class="absolute top-1/2 h-c-btn-h-xs w-px -translate-y-1/2 bg-ink-strong"
            style:left="{thumb * 100}%"
          ></span>
        {/if}
      </div>
      <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <button
          aria-label={words.playMove(stateOf(from).name, stateOf(to).name)}
          class={[SYMBOL, "bg-surface-raised shadow-xs"]}
          onclick={() => judge.play(from, to)}
          title={words.playMove(stateOf(from).name, stateOf(to).name)}
          type="button"><IconPlay /></button
        >
      </span>
      <span class="absolute top-full type-meta text-ink-subtle tabular-nums"
        >{length === null ? words.notMeasured : words.ms(length)}</span
      >
    </div>
  {:else if link}
    <div
      class="relative flex h-c-btn-h-sm w-[calc(2*var(--c-steps-stop-min-w))] flex-none items-center self-start"
      data-gap="{from}>{to}"
    >
      <span class="h-px w-full bg-(--c-graph-edge-ink)"></span>
      <span
        class="absolute top-full w-full truncate text-center type-meta text-ink-subtle"
        >{link.label}</span
      >
    </div>
  {:else}
    <span aria-hidden="true" class="w-space-6 flex-none"></span>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the surface's keys (← → step, C comments) answer wherever focus stands inside it, as an application region's do. -->
<div
  bind:clientWidth={width}
  class="relative flex flex-col overflow-hidden bg-surface-recess text-ink-strong"
  data-proto="timeline"
  onkeydown={keyed}
  role="application"
  aria-label={COMPONENT_NAME}
  style:height="{height}px"
>
  <ProtoBar compact={phone} {judge}>
    {#snippet centre()}
      {#if !phone}
        <GlassGroup label={words.waysOfSeeing}>
          <Tabs
            onValueChange={(value) => seeAll(value === "all")}
            size="compact"
            value={mapOpen ? "all" : "order"}
          >
            <TabsList aria-label={words.waysOfSeeing}>
              <TabItem label={words.inOrder} value="order" />
              <TabItem label={words.allAtOnce} value="all" />
            </TabsList>
          </Tabs>
        </GlassGroup>
      {/if}
    {/snippet}
  </ProtoBar>
  <p class="m-0 flex-none px-space-4 pb-space-2 type-body text-ink-strong">
    {ASK}
  </p>

  <!-- The stage: it holds still while the sheet over it rises, rests or goes (T14). -->
  <div
    class="min-h-0 flex-1 overflow-auto px-space-4 pt-space-2"
    style:padding-bottom="calc({away ? 0 : restH}px + var(--space-4))"
  >
    <div class="relative mx-auto w-max">
      <Stage
        bind:root={liveRoot}
        {judge}
        live
        marking={twoUp && held && held !== judge.kept ? "went" : null}
        peek={judge.peek}
        story={judge.kept}
        against={besideRoot}
      />
      {#if twoUp && held && held !== judge.kept}
        <!-- A wide window: the held state stands beside the kept one at its own production width (T4, the owner's pick). -->
        <div class="absolute top-0 left-full ms-space-6" data-beside>
          <p class="m-0 mb-space-1 type-meta text-ink-muted">
            {words.held(stateOf(held).name)}
          </p>
          <Stage
            bind:root={besideRoot}
            against={liveRoot}
            {judge}
            marking="came"
            pins={false}
            story={held}
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- The track's sheet: a sheet over the stage, its top edge its size (DESIGN.md, Dialog, sheet and drawer). -->
  <section
    aria-label={words.inOrder}
    class="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-panel border-t border-border-control bg-surface-raised shadow-drawer"
    data-sheet={sheetFace}
    style:height={sheetH === null ? undefined : `${Math.max(sheetH, 0)}px`}
  >
    <button
      aria-label={away ? words.showStates : words.resizeStates}
      class="mx-auto flex h-space-5 w-c-grabber-w flex-none cursor-ns-resize touch-none items-center justify-center rounded-pill focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
      data-grabber
      ondblclick={() => seeAll(!mapOpen)}
      onpointerdown={(event) => {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the gesture carries on uncaptured.
        }
        drag = {
          y: event.clientY,
          from: sheetH ?? restH,
          id: event.pointerId,
        };
      }}
      onpointermove={(event) => {
        if (drag) {
          sheetH = Math.max(
            0,
            Math.min(height - 120, drag.from + drag.y - event.clientY)
          );
        }
      }}
      onpointerup={(event) => {
        if (!drag) {
          return;
        }
        const moved = Math.abs(drag.y - event.clientY);
        drag = null;
        const h = sheetH ?? restH;
        if (moved < 4) {
          sheetH = away ? null : sheetH;
          return;
        }
        if (h < restH * 0.5) {
          sheetH = 0;
        } else if (h < height * 0.45) {
          sheetH = null;
        }
      }}
      type="button"
    >
      <span class="h-c-grabber-h w-full rounded-pill bg-ink-subtle/40"></span>
    </button>

    {#if !away}
      <div
        bind:offsetHeight={
          () => restH,
          (value) => {
            if (sheetH === null) {
              restH = value;
            }
          }
        }
        class={[
          "flex min-h-0 flex-col gap-space-2 px-space-3 pb-space-3",
          mapOpen && "flex-1",
        ]}
      >
        {#if mapOpen}
          <!-- All at once: the track unfolded into the map (the branch's StateGraph, dagre-laid). -->
          <div class="flex min-h-0 flex-1 flex-col">
            <StateGraph
              file={FILE}
              graph={SECTION_GRAPH}
              height={Math.max(160, (sheetH ?? 0) - 72)}
              kept={pointAt(judge.kept)}
              onkeep={(point) => judge.go(point.story)}
              onpreview={(point) => {
                held = point?.story ?? null;
              }}
              peek={held ? pointAt(held) : null}
              sectionName={COMPONENT_NAME}
            />
          </div>
        {:else}
          <!-- In order: one track, the keyframes and the moves between them. -->
          <div
            bind:this={track}
            class="flex snap-x gap-0 overflow-x-auto overscroll-x-contain pt-space-1 pb-space-5"
            data-track
          >
            {#each LANES as lane, index (lane.group)}
              <div
                class="flex flex-none flex-col gap-space-1"
                data-lane={lane.group}
              >
                <span
                  class="sticky start-0 w-max ps-space-1 type-caps text-ink-subtle"
                  >{lane.group}</span
                >
                <div class="flex items-start">
                  {#each lane.stories as story, at (story)}
                    {@render keyframe(story)}
                    {#if at < lane.stories.length - 1}
                      {@render gap(story, lane.stories[at + 1] as string)}
                    {/if}
                  {/each}
                  {#if index < LANES.length - 1}
                    {@render gap(
                      lane.stories.at(-1) as string,
                      LANES[index + 1]?.stories[0] as string
                    )}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
          {#if clipsOpen}
            <div
              class="max-h-[calc(8*var(--c-row-h))] overflow-y-auto border-t border-border-hairline pt-space-2"
            >
              <Clips {judge} />
            </div>
          {/if}
        {/if}

        <!-- The transport: ends, one step, the position, Play the steps; then the clips, folded. -->
        <div class="flex flex-wrap items-center gap-space-2">
          <GlassGroup label={designGraphWords.slider}>
            <button
              aria-label={words.firstStep}
              class={[SYMBOL, "grid-flow-col"]}
              disabled={judge.at <= 0}
              onclick={() => judge.end("first")}
              title={words.firstStep}
              type="button"
              ><IconChevronLeft /><IconChevronLeft
                class="-ms-space-3"
              /></button
            >
            <button
              aria-label={designGraphWords.previousStep}
              class={SYMBOL}
              disabled={judge.at <= 0}
              onclick={() => judge.step(-1)}
              title={designGraphWords.previousStep}
              type="button"><IconChevronLeft /></button
            >
            <span
              class="relative min-w-c-steps-stop-min-w px-space-1 text-center type-label tabular-nums"
              >{judge.at >= 0
                ? designGraphWords.stepOf(judge.at + 1, SEQUENCE.length)
                : stateOf(judge.kept).name}</span
            >
            <button
              aria-label={designGraphWords.nextStep}
              class={SYMBOL}
              disabled={judge.at >= SEQUENCE.length - 1}
              onclick={() => judge.step(1)}
              title={designGraphWords.nextStep}
              type="button"><IconChevronRight /></button
            >
            <button
              aria-label={words.lastStep}
              class={[SYMBOL, "grid-flow-col"]}
              disabled={judge.at === SEQUENCE.length - 1}
              onclick={() => judge.end("last")}
              title={words.lastStep}
              type="button"
              ><IconChevronRight /><IconChevronRight
                class="-ms-space-3"
              /></button
            >
          </GlassGroup>
          <GlassGroup>
            <button
              aria-label={judge.walking ? words.pause : words.playSteps}
              class={[SYMBOL, "w-auto grid-flow-col gap-space-1 px-space-2"]}
              onclick={() =>
                judge.walking ? judge.stopWalk() : judge.walkAll()}
              type="button"
              >{#if judge.walking}<IconPause />{:else}<IconPlay />{/if}<span
                class="type-label"
                >{judge.walking ? words.pause : words.playSteps}</span
              ></button
            >
          </GlassGroup>
          <span class="flex-1"></span>
          {#if phone}
            <GlassGroup>
              <ViewSettings {judge} />
              <Adjust {judge} />
              <button
                aria-label={words.allAtOnce}
                aria-pressed={mapOpen}
                class={SYMBOL}
                onclick={() => seeAll(!mapOpen)}
                title={words.allAtOnce}
                type="button"><IconStructure /></button
              >
            </GlassGroup>
          {/if}
          {#if !mapOpen && judge.move}
            <GlassGroup>
              <button
                aria-expanded={clipsOpen}
                class={[SYMBOL, "w-auto grid-flow-col gap-space-1 px-space-2"]}
                onclick={() => {
                  clipsOpen = !clipsOpen;
                }}
                type="button"
                ><span class="type-label"
                  >{words.clips(judge.runner.clips.length)}</span
                >{#if clipsOpen}<IconChevronDown />{:else}<IconChevronUp
                  />{/if}</button
              >
            </GlassGroup>
          {/if}
        </div>
      </div>
    {:else}
      <button
        class="mx-auto mb-space-2 type-label text-ink-muted hover:text-ink-strong"
        onclick={() => {
          sheetH = null;
        }}
        type="button">{words.showStates}</button
      >
    {/if}
  </section>
</div>
