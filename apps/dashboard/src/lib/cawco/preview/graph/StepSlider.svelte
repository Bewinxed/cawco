<script lang="ts">
  /**
   * The step slider over a component canvas's page (the primitives spec
   * §1.2): a track with one named stop per step, the kept stop filled, a
   * knob that scrubs the sequence. Between two stops it holds the move into
   * the next at that fraction, so a drag reads as the flow playing under the
   * finger; a stop whose story plays no move snaps at the midpoint, and a
   * let-go lands on the nearer stop. A hover on a stop (a held press under
   * a finger) previews it on the page; a press keeps it. ← and → (J and K)
   * step, Home and End go to the ends. The words are the states' names
   * only (pin 21). On a phone, past what fits, the track scrolls sideways
   * with the kept stop centred and the house edge fade at the end with
   * more (call 4), or its stops fold to dots with the kept name alone; call
   * 1's other side is a segmented control of the names, which cannot scrub.
   */
  import type { StagePoint, StepState } from "@cawco/core/design-graph";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur, motionOk, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import { graphOptions } from "./options.svelte";
  import { RING } from "./symbol";

  let {
    graph,
    phone = false,
    trailing,
  }: {
    graph: DesignGraph;
    /** A phone's pane: past what fits, the track scrolls or folds to dots (call 4). */
    phone?: boolean;
    /** What stands at the bar's end: the Steps | Graph switch, where call 2 puts it. */
    trailing?: Snippet;
  } = $props();

  const steps = $derived(graph.steps);
  const count = $derived(steps.length);
  /** Where the knob stands, in stops from the first: held, where the finger is; else the kept stop. */
  const place = $derived(graph.scrubAt ?? graph.at);
  const keptName = $derived(graph.at >= 0 ? steps[graph.at]?.name : null);

  let scroller = $state<HTMLElement>();
  let width = $state(0);
  /** Every stop's share at its least: past it the track runs wider than the bar. */
  const overflows = $derived(
    count * numberOf("--c-steps-stop-min-w") > width + 0.5
  );
  /** Call 4's other side: a phone's stops past what fits fold to dots, the kept name alone under them. */
  const dots = $derived(
    phone && overflows && graphOptions.sides.phoneSteps === "dots"
  );
  /** A stop's dot: filled while kept, dashed where its story isn't in the file, else hollow and lit by a hover. */
  const dotOf = (kept: boolean, missing: boolean | undefined) => {
    if (kept) {
      return "scale-125 border-ink-strong bg-ink-strong";
    }
    return missing
      ? "border-dashed border-border-control-strong bg-transparent"
      : "border-border-control-strong bg-surface-raised group-hover/stop:border-ink-strong";
  };
  /** A stop's name: the kept one strong, a missing one struck through, the rest muted until hovered. */
  const nameOf = (kept: boolean, missing: boolean | undefined) => {
    if (kept) {
      return "font-medium text-ink-strong";
    }
    return missing
      ? "text-ink-subtle line-through"
      : "text-ink-muted group-hover/stop:text-ink-row";
  };
  /** A stop's centre along the track, as a share of its width. */
  const centre = (at: number) => `${((at + 0.5) / Math.max(1, count)) * 100}%`;

  // The kept stop centred in a track that scrolls (call 4: the scroll). The track's own scroll alone: scrollIntoView
  // scrolls every scrollable ancestor too, the page and a same-site frame around it among them.
  $effect(() => {
    const { at } = graph;
    if (!(scroller && overflows && !dots) || at < 0) {
      return;
    }
    const stop = scroller.querySelector<HTMLElement>(`[data-stop="${at}"]`);
    if (!stop) {
      return;
    }
    const box = scroller.getBoundingClientRect();
    const one = stop.getBoundingClientRect();
    scroller.scrollTo({
      left:
        scroller.scrollLeft +
        (one.left + one.width / 2) -
        (box.left + box.width / 2),
      behavior: motionOk.current ? "smooth" : "instant",
    });
  });

  /* --- The hand: a drag scrubs, a press keeps, a hover or a held press previews --- */

  let track = $state<HTMLElement>();
  /** Stops from the first at a pointer's x over the track. */
  const placeAt = (clientX: number): number => {
    const box = track?.getBoundingClientRect();
    if (!box || box.width <= 0) {
      return 0;
    }
    return ((clientX - box.left) / box.width) * count - 0.5;
  };
  let press: {
    id: number;
    x: number;
    y: number;
    dragging: boolean;
    shown: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null = null;
  /** The click a drag or a held press ends in keeps nothing. */
  let swallow = false;

  function down(event: PointerEvent, point: StagePoint | null): void {
    if (event.button !== 0 || count < 2) {
      return;
    }
    swallow = false;
    const one: NonNullable<typeof press> = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      shown: false,
      timer: undefined,
    };
    if (event.pointerType !== "mouse" && point) {
      one.timer = setTimeout(() => {
        one.shown = true;
        graph.preview(point);
      }, dur("--dur-press-hold"));
    }
    press = one;
  }
  function move(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    const dx = event.clientX - press.x;
    if (!press.dragging) {
      // A sideways drag scrubs; one that goes up or down first is the page's scroll.
      if (
        Math.abs(dx) < 4 ||
        Math.abs(dx) < Math.abs(event.clientY - press.y)
      ) {
        return;
      }
      press.dragging = true;
      clearTimeout(press.timer);
      if (press.shown) {
        graph.preview(null);
      }
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    graph.scrub(placeAt(event.clientX));
  }
  function up(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    clearTimeout(press.timer);
    swallow = press.dragging || press.shown;
    if (press.shown) {
      graph.preview(null);
    }
    if (press.dragging) {
      graph.release();
    }
    press = null;
  }
  function pressed(step: StepState): void {
    if (swallow) {
      swallow = false;
      return;
    }
    if (!step.missing) {
      graph.keepAt(step.point);
    }
  }
  function key(event: KeyboardEvent): void {
    const to = {
      ArrowLeft: -1,
      ArrowRight: 1,
      j: -1,
      k: 1,
      J: -1,
      K: 1,
    }[event.key] as -1 | 1 | undefined;
    if (to) {
      event.preventDefault();
      graph.stepBy(to);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      graph.stepTo(event.key === "Home" ? "first" : "last");
    }
  }
</script>

{#if count > 0}
  <div
    class="relative flex h-c-steps-bar-h min-w-0 items-center gap-space-2 rounded-panel ps-space-2 pe-space-1 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none"
    data-step-slider={graphOptions.sides.slider}
  >
    {#if graphOptions.sides.slider === "segments"}
      <!-- Call 1's other side: the states' names as one segmented control; a press keeps, nothing scrubs. -->
      <div class="flex min-w-0 flex-1 justify-center">
        <Tabs
          onValueChange={(story) => {
            const step = steps.find((one) => one.point.story === story);
            if (step && !step.missing) {
              graph.keepAt(step.point);
            }
          }}
          size="compact"
          value={graph.keptHere?.story}
        >
          <TabsList aria-label={words.slider} scrollable>
            {#each steps as step (step.point.story)}
              <TabItem
                aria-disabled={step.missing || undefined}
                label={step.name}
                value={step.point.story}
              />
            {/each}
          </TabsList>
        </Tabs>
      </div>
    {:else}
      <div
        bind:this={scroller}
        {@attach frameSize((node: HTMLElement) => {
          width = node.clientWidth;
        })}
        class={[
          "min-w-0 flex-1 self-stretch",
          overflows &&
            !dots &&
            "kit-edge-fade no-scrollbar overflow-x-auto overscroll-x-contain",
        ]}
        data-overflows={overflows || undefined}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={track}
          class={[
            "relative flex h-full touch-pan-y select-none",
            overflows && !dots && "w-max min-w-full",
          ]}
          data-track
          onpointercancel={up}
          onpointerdown={(event) => down(event, null)}
          onpointermove={move}
          onpointerup={up}
          style:--n={count}
        >
          <!-- The track runs from the first stop's centre to the last's; the fill up to the knob. -->
          <span
            aria-hidden="true"
            class="pointer-events-none absolute start-(--from) end-(--from) top-space-4 h-space-1 -translate-y-1/2 rounded-pill bg-surface-fill-strong"
            style:--from={`${50 / Math.max(1, count)}%`}
          ></span>
          {#if place >= 0}
            <span
              aria-hidden="true"
              class="pointer-events-none absolute start-(--from) top-space-4 h-space-1 w-(--fill) -translate-y-1/2 rounded-pill bg-ink-strong"
              style:--fill={`${(place / Math.max(1, count)) * 100}%`}
              style:--from={`${50 / Math.max(1, count)}%`}
            ></span>
          {/if}
          {#each steps as step, at (step.point.story)}
            {@const kept = at === graph.at}
            <button
              aria-current={kept || undefined}
              aria-label={step.missing
                ? words.stepMissing(step.name)
                : step.name}
              class={[
                "group/stop relative flex min-w-0 flex-col items-center justify-start gap-space-1 pt-space-3 touch-hit rounded-sm",
                overflows && !dots
                  ? "w-c-steps-stop-min-w flex-none"
                  : "flex-1",
                RING,
              ]}
              data-kept={kept || undefined}
              data-missing={step.missing || undefined}
              data-stop={at}
              onclick={() => pressed(step)}
              onpointerdown={(event) => {
                event.stopPropagation();
                down(event, step.missing ? null : step.point);
              }}
              onpointerenter={(event) => {
                if (event.pointerType !== "touch" && !step.missing && !press) {
                  graph.preview(step.point);
                }
              }}
              onpointerleave={(event) => {
                if (event.pointerType !== "touch" && !press) {
                  graph.preview(null);
                }
              }}
              onpointermove={move}
              onpointerup={up}
              tabindex="-1"
              title={step.missing ? words.stepMissing(step.name) : step.name}
              type="button"
            >
              <!-- A stop: hollow, filled while kept, dashed where its story isn't in the file. -->
              <i
                aria-hidden="true"
                class={[
                  "relative z-1 size-space-2 rounded-pill border transition-[background-color,border-color,scale] duration-(--dur-control) ease-out motion-reduce:transition-[background-color,border-color]",
                  dotOf(kept, step.missing),
                ]}
              ></i>
              {#if !dots}
                <span
                  class={[
                    "max-w-full truncate px-space-1 type-meta",
                    nameOf(kept, step.missing),
                  ]}>{step.name}</span
                >
              {/if}
            </button>
          {/each}
          {#if place >= 0 && count > 1}
            <!-- The knob: the house slider's, the slider's one keyboard stop. -->
            <span
              aria-label={words.slider}
              aria-valuemax={count}
              aria-valuemin={1}
              aria-valuenow={Math.round(place) + 1}
              aria-valuetext={keptName ?? undefined}
              class={[
                "absolute top-space-4 start-(--at) z-2 size-icon-md -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-pill border border-border-control bg-surface-lift shadow-knob",
                graph.scrubAt === null &&
                  "transition-[inset-inline-start] duration-(--dur-control) ease-out motion-reduce:transition-none",
                RING,
              ]}
              data-knob
              onkeydown={key}
              onpointercancel={up}
              onpointerdown={(event) => {
                event.stopPropagation();
                down(event, null);
                if (press) {
                  press.dragging = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onpointermove={move}
              onpointerup={up}
              role="slider"
              style:--at={centre(place)}
              tabindex="0"
            ></span>
          {/if}
        </div>
      </div>
      {#if dots && keptName}
        <!-- Call 4's other side: the kept stop's name alone, beside its dots. -->
        <span
          class="max-w-2/5 flex-none truncate type-label text-ink-strong"
          data-kept-name>{keptName}</span
        >
      {/if}
    {/if}
    {@render trailing?.()}
  </div>
{/if}
