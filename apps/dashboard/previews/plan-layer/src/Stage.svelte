<script lang="ts">
  import { frameSize } from "#lib/cawco/frame-observer.js";
  /**
   * The conversation's pane at its tail: the transcript (a stand-in, its
   * words in the body and meta roles, under the pane's head and foot fades,
   * HeadFade and FootFade), the composer's
   * dock with its tray row (one delegate chip, the plan's ring, PlanRing as
   * main draws it) and the pill under it, and the plan open over the
   * transcript's foot in the variant `?v=` names (1, 2 or 3).
   *
   * The dock is Composer.svelte's: absolute over the whole pane, its foot
   * `--space-4` over the bottom, so the plan's room (PlanPane `room`) is
   * measured as it is in the app.
   */
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import FootFade from "#lib/cawco/transcript/FootFade.svelte";
  import HeadFade from "#lib/cawco/transcript/HeadFade.svelte";
  import { sendVariants } from "#lib/components/ui/button/send.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconRocket, IconStop } from "#lib/icons.js";
  import PlanLayer from "./PlanLayer.svelte";
  import StepsInOrder from "./StepsInOrder.svelte";
  import StepsNow from "./StepsNow.svelte";
  import StepsWaitsFirst from "./StepsWaitsFirst.svelte";
  import { DONE, SPEC, STEPS, TOTAL, TRANSCRIPT, UNDER_WAY } from "./sample";

  const params = new URLSearchParams(location.search);
  const variant = ["1", "2", "3"].includes(params.get("v") ?? "")
    ? (params.get("v") as "1" | "2" | "3")
    : "1";
  let open = $state(params.get("open") !== "0");
  const openAt = variant === "2" ? UNDER_WAY : undefined;

  /** A conversation opens at its tail, its latest row over the dock. */
  const atTail = (scroller: HTMLElement) => {
    scroller.scrollTop = scroller.scrollHeight;
    document.fonts.ready.then(() => {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dataset.tail = "";
    });
  };

  /** Composer's `measurePanel`: the composer's own height, the ground's foot. */
  /**
   * The ground under an open layer (the dock's `layer-ground`): the
   * transcript's recess, solid up to the layer's foot, then dissolving over
   * the rest of its height (`space-8`) under the layer.
   */
  /** SessionPane's `--composer-clearance`: the composer and its tray row, a space-4 each side. */
  const CLEARANCE =
    "calc(var(--c-composer-panel) + var(--c-tray-row) + var(--space-4) + var(--space-4))";
  /** It reaches down to the pane's foot, under the dock's own. */
  const GROUND_BOTTOM = "calc(-1 * var(--dock-foot, 0px))";
  /** As tall as the foot, the composer and the step to the layer, and its dissolve. */
  const GROUND_H =
    "calc(var(--dock-foot, 0px) + var(--layer-foot) + var(--space-8))";
  const LAYER_GROUND =
    "linear-gradient(to top, var(--surface-recess) calc(var(--dock-foot, 0px) + var(--layer-foot)), var(--surface-recess-clear))";
  let panel = $state(0);
  const measurePanel = frameSize<HTMLElement>((node) => {
    panel = node.clientHeight;
  });
  /** Composer's `measureRing`: the tray's row stops short of the ring. */
  let ringWidth = $state(0);
  const measureRing = frameSize<HTMLElement>((node) => {
    ringWidth = node.clientWidth;
  });
</script>

<!-- SessionPane's transcript region: the pane's recess, its head fade's
     timeline in scope, the transcript's foot room the session pane's. -->
<div
  data-slot="pane"
  data-variant={variant}
  class="relative isolate h-dvh overflow-clip bg-surface-recess text-ink-strong timeline-scope-transcript-head"
  style:--composer-clearance={CLEARANCE}
>
  <div
    data-slot="scroller"
    class="absolute inset-0 overflow-y-auto overscroll-contain scroll-timeline-transcript-head flex flex-col items-center"
    {@attach atTail}
  >
    <div
      data-slot="rows"
      class="mt-auto w-c-composer-w max-desk:w-auto max-desk:self-stretch max-desk:mx-space-3 flex flex-col gap-space-4 pbs-space-8"
    >
      {#each TRANSCRIPT as row, i (i)}
        {#if row.kind === "said"}
          <p class="m-0 type-body text-ink-strong" data-row>{row.text}</p>
        {:else}
          <p class="m-0 type-meta text-ink-muted" data-row>{row.text}</p>
        {/if}
      {/each}
    </div>
    <!-- Transcript's `foot`: the room the dock stands in. -->
    <div
      aria-hidden="true"
      class="flex-none h-[max(calc(var(--space-8)*3),var(--composer-clearance))]"
      data-slot="foot"
    ></div>
  </div>
  <HeadFade />
  <!-- SessionPane's foot fade over its transcript. -->
  <FootFade />
  <div
    data-slot="dock"
    class="group/dock absolute inset-x-0 top-0 bottom-(--dock-foot) z-(--layer-dock) flex flex-col justify-end items-center pointer-events-none"
    style:--dock-foot="calc(var(--space-4) + var(--safe-bottom, 0px))"
    style:--layer-foot="calc({panel}px + var(--c-tray-row) + var(--space-2))"
  >
    <!-- Composer's ground under an open layer, as main draws it. -->
    <div
      data-slot="layer-ground"
      aria-hidden="true"
      class="absolute inset-x-0 bottom-(--ground-bottom) -z-1 h-(--ground-h) pointer-events-none bg-(image:--layer-ground-image) opacity-0 invisible transition-fade-hide group-has-slot-plan/dock:opacity-100 group-has-slot-plan/dock:visible group-has-slot-plan/dock:transition-fade-show group-has-slot-shelf/dock:opacity-100 group-has-slot-shelf/dock:visible group-has-slot-shelf/dock:transition-fade-show"
      style:--layer-ground-image={LAYER_GROUND}
      style:--ground-bottom={GROUND_BOTTOM}
      style:--ground-h={GROUND_H}
    ></div>
    <!-- Composer's `lift`: the tray row on the composer's width, the
         plan's slot over it and the tray's slot under, in that order. -->
    <div
      data-slot="lift"
      class="relative flex-none w-c-composer-w pointer-events-none max-desk:self-stretch max-desk:mx-space-3 max-desk:w-auto"
    >
      <div
        data-slot="progress-slot"
        class="absolute bottom-0 inset-x-0 z-1 flex justify-end items-end h-c-tray-row pb-c-tray-gap pointer-events-none"
      >
        <div class="flex pointer-events-auto" {@attach measureRing}>
          <PlanRing
            done={DONE}
            onopen={() => {
              open = !open;
            }}
            {open}
            total={TOTAL}
          />
        </div>
        {#if open}
          <PlanLayer
            {openAt}
            onclose={() => {
              open = false;
            }}
            spec={SPEC}
          >
            {#snippet steps()}
              {#if variant === "1"}
                <StepsNow steps={STEPS} />
              {:else if variant === "2"}
                <StepsInOrder steps={STEPS} />
              {:else}
                <StepsWaitsFirst steps={STEPS} />
              {/if}
            {/snippet}
          </PlanLayer>
        {/if}
      </div>
      <div
        data-slot="tray-slot"
        class="relative grid grid-cols-1 items-box-end min-h-c-tray-row"
        style:--ring-room="calc({ringWidth}px + var(--space-2))"
      >
        <div data-slot="tray" class="row-start-1 col-start-1">
          <!-- DelegateTray's host and row, one working delegate's chip. -->
          <div
            data-slot="host"
            class="pointer-events-none pe-(--host-end)"
            style:--host-end="var(--ring-room, 0px)"
          >
            <div class="relative pb-c-tray-gap">
              <!-- biome-ignore lint/a11y/useSemanticElements: DelegateTray's row, its role as DelegateTray gives it for one chip (group; a toolbar from three). -->
              <div
                aria-label="Delegates"
                class="flex flex-nowrap items-center gap-space-2 overflow-visible"
                data-slot="row"
                role="group"
              >
                <button
                  aria-label="Draw the same plan in the iOS app, working"
                  class={chipVariants({
                    variant: "tray",
                    class:
                      "group/chip touch-hit flex-initial min-w-c-tray-chip-min max-w-c-tray-chip-max",
                  })}
                  data-status="running"
                  data-tray-chip
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    class="flex-none size-c-row-mark rounded-xs grid place-items-center bg-mark-overlay bg-(--mark-bg)"
                    data-box
                    data-slot="mark"
                    style:--mark-bg="var(--mark-4)"
                    ><IconRocket
                      class="size-icon-sm block text-mark-glyph"
                    /></span
                  >
                  <span
                    aria-hidden="true"
                    class="mark-line min-w-0 flex items-baseline gap-c-pill-gap"
                    data-box
                    data-chip-words
                  >
                    <span
                      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                      data-slot="title">Draw the same plan in the iOS app</span
                    >
                  </span>
                  <span
                    aria-hidden="true"
                    class="flex-none size-icon-md grid place-items-center group-status-running/chip:text-ink-muted"
                    data-box
                    data-chip-slot
                  >
                    <span
                      class="size-space-1 rounded-pill bg-status-live-glyph"
                      data-slot="dot"
                    ></span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      data-slot="composer"
      class="relative flex-none w-c-composer-w flex flex-col gap-space-3 pointer-events-none max-desk:self-stretch max-desk:mx-space-3 max-desk:w-auto"
      {@attach measurePanel}
    >
      <form
        aria-label="Message the agent"
        class="reduced-transparency:backdrop-filter-none rounded-lg border border-border-control bg-material-panel shadow-tile backdrop-blur-(--material-blur) backdrop-saturate-(--material-saturate) concentric-in r-inset-c-inset-composer r-outer-lg reduced-transparency:bg-surface-raised relative z-2 py-(--cin-pad) pr-(--cin-pad) pl-space-3 flex items-end gap-space-2 pointer-events-auto"
        data-slot="cin"
        onsubmit={(event) => event.preventDefault()}
        style:--cin-pad="var(--c-composer-inset)"
      >
        <span
          class="flex-auto min-w-0 min-h-c-composer-field flex items-center type-body text-ink-subtle overflow-clip text-ellipsis whitespace-nowrap"
          >Message the agent… / for commands, @ to mention</span
        >
        <button
          aria-label="Stop the agent"
          class={sendVariants({ class: "group/stop select-none touch-hit" })}
          data-slot="stop"
          type="button"><IconStop /></button
        >
      </form>
    </div>
  </div>
</div>
