<script lang="ts">
  import { frameSize } from "#lib/cawco/frame-observer.js";
  /**
   * The conversation's pane at the foot: the transcript's last rows (a
   * stand-in, the transcript's own words in the body role), the composer's
   * dock with its tray row (one delegate chip, the plan's ring, PlanRing as
   * main draws it) and the pill under it, and the plan open over the
   * transcript's foot in the variant `?v=` names (1, 2 or 3).
   *
   * The dock is Composer.svelte's: absolute over the whole pane, its foot
   * `--space-4` over the bottom, so the plan's room (PlanPane `room`) is
   * measured as it is in the app.
   */
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import { sendVariants } from "#lib/components/ui/button/send.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconRocket, IconStop } from "#lib/icons.js";
  import PlanLayer from "./PlanLayer.svelte";
  import StepsInOrder from "./StepsInOrder.svelte";
  import StepsNow from "./StepsNow.svelte";
  import StepsWaitsFirst from "./StepsWaitsFirst.svelte";
  import { DONE, SPEC, STEPS, TOTAL, UNDER_WAY } from "./sample";

  const params = new URLSearchParams(location.search);
  const variant = ["1", "2", "3"].includes(params.get("v") ?? "")
    ? (params.get("v") as "1" | "2" | "3")
    : "1";
  let open = $state(params.get("open") !== "0");
  const openAt = variant === "2" ? UNDER_WAY : undefined;

  /** Composer's `measureRing`: the tray's row stops short of the ring. */
  let ringWidth = $state(0);
  const measureRing = frameSize<HTMLElement>((node) => {
    ringWidth = node.clientWidth;
  });
</script>

<div
  data-slot="pane"
  data-variant={variant}
  class="relative h-dvh overflow-clip bg-surface-page text-ink-strong"
>
  <div
    data-slot="scroller"
    class="absolute inset-0 overflow-y-auto overscroll-contain flex flex-col items-center"
  >
    <div
      data-slot="rows"
      class="mt-auto w-c-composer-w max-desk:w-auto max-desk:self-stretch max-desk:mx-space-3 flex flex-col gap-space-4 pbs-space-8 pbe-(--foot-room) [--foot-room:calc(var(--space-8)*3)]"
    >
      <p class="m-0 type-body text-ink-strong" data-row>
        The hub already keeps a step's wait: <code>waitsOn</code> holds the decision
        page and its card, and it survives the session's writes by id. PlanTree never
        reads it, so a step waiting on you looks like any other step to do.
      </p>
      <p class="m-0 type-meta text-ink-muted" data-row>
        Edited apps/dashboard/src/lib/cawco/plan/PlanTree.svelte
      </p>
      <p class="m-0 type-body text-ink-strong" data-row>
        I've carried the wait into each row and named the card it opens. Next
        I'm drawing Waiting on you on its step. Before I fold finished steps,
        I've asked you how the plan should read when it opens.
      </p>
    </div>
  </div>

  <div
    data-slot="dock"
    class="group/dock absolute inset-x-0 top-0 bottom-(--dock-foot) z-(--layer-dock) flex flex-col justify-end items-center pointer-events-none"
    style:--dock-foot="calc(var(--space-4) + var(--safe-bottom, 0px))"
  >
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
