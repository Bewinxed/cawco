<script lang="ts" module>
  export type FrameKind = "desk" | "phone" | "device" | "delegate" | "step";
</script>

<script lang="ts">
  /**
   * The plan panel's fixture for the component canvas: one way of drawing
   * the plan (PlanBody) in the desk's 360px side card or the phone's 390
   * sheet, fed the booking-page plan, standing still or live (a beat every
   * 2.4s). `device` draws the one the reader's own screen would show: the
   * phone's sheet under a finger (`pointer: coarse`), the desk's card under
   * a mouse. `delegate` draws a working delegate's line at three held
   * moments of its pulse (DelegateFrame), `step` the to-do that became a
   * task alone (StepFrame). Everything else (opening a step, pushing its
   * page, ticking a to-do) is the person's to do in the live component.
   * Three values are the person's to tune: the tile's size, the progress
   * line's weight and the sweep's speed.
   *
   * `whole` stands the card or the sheet as tall as its plan (whole.ts):
   * a decision page's drawing, judged and never scrolled, shows every row.
   */
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import DelegateFrame from "./DelegateFrame.svelte";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_BEATS, livePlan, plan as still } from "./fixtures";
  import PhonePlan from "./PhonePlan.svelte";
  import PlanBody, { type Variation } from "./PlanBody.svelte";
  import StepFrame from "./StepFrame.svelte";
  import type { Scenario } from "./view.svelte";

  let {
    variation,
    frame = "desk",
    live = false,
    scenario = "rest",
    whole = false,
    tileSize = 18,
    lineWeight = 4,
    sweepSeconds = 1.2,
  }: {
    /** Which way the plan is drawn. */
    variation: Variation;
    frame?: FrameKind;
    /** Steps move on by themselves, a beat every 2.4s. */
    live?: boolean;
    /** At rest, a step open, or one change already made: a step reworded, commented on, answered. */
    scenario?: Scenario;
    /** Show the whole plan, every row, the frame as tall as it is (a decision page's drawing). */
    whole?: boolean;
    /** The step tile's side, px (DESIGN.md's tree mark: 18). */
    tileSize?: number;
    /** The progress line's weight, px (the usage strip's bar: 4). */
    lineWeight?: number;
    /** One crossing of the sweep, and one run of the pulse, in seconds (--dur-loop: 1.2). */
    sweepSeconds?: number;
  } = $props();

  const finger = new MediaQuery("(pointer: coarse)");
  const kind = $derived.by(() => {
    if (frame !== "device") {
      return frame;
    }
    return finger.current ? "phone" : "desk";
  });

  const loaded = Date.now();
  /** A story that opens a step stands its frame scrolled to that step. */
  const focus = $derived(
    scenario === "rest" || scenario === "edited" ? undefined : "a2"
  );
  let beat = $state(0);
  const plan = $derived(live ? livePlan(beat) : still);

  onMount(() => {
    if (!live) {
      return;
    }
    const timer = setInterval(() => {
      beat = (beat + 1) % LIVE_BEATS.length;
    }, 2400);
    return () => clearInterval(timer);
  });
</script>

<!-- The values every row is drawn from, worked out once here from the
     three the person tunes, and read by the rows as custom properties: the
     tile's cell (one line box tall, or the tile's side, whichever is more),
     its glyph (two thirds of the tile), the words' column after it, a row's
     columns, a progress line's longest share of its row, and the gap
     between nested rows. -->
<div
  class="flex w-max max-w-full"
  data-beat={live ? beat : undefined}
  data-kind={kind}
  data-slot="plan-frame"
  style:--pv-tile="{tileSize}px"
  style:--mark-size="{tileSize}px"
  style:--pv-line="{lineWeight}px"
  style:--pv-sweep="{sweepSeconds}s"
  style:--pv-lead-h="max(1lh, var(--pv-tile))"
  style:--pv-glyph="calc(var(--pv-tile) * 2 / 3)"
  style:--pv-tile-in="calc(var(--pv-tile) + var(--space-2))"
  style:--words-in="calc(var(--pv-tile) + var(--space-2))"
  style:--pv-cols="var(--pv-tile) minmax(0, 1fr) auto"
  style:--pv-cols-narrow="var(--pv-tile) minmax(0, 1fr)"
  style:--pv-line-max="max(var(--c-plan-line-min), 32%)"
  style:--tree-gap="var(--space-row)"
>
  {#if kind === "delegate"}
    <DelegateFrame />
  {:else if kind === "step"}
    <StepFrame />
  {:else if kind === "desk"}
    <DeskPlan {focus} {plan} {whole}>
      <PlanBody {loaded} {plan} {scenario} {variation} />
    </DeskPlan>
  {:else}
    <PhonePlan {focus} {plan} {whole}>
      <PlanBody {loaded} phone {plan} {scenario} {variation} />
    </PhonePlan>
  {/if}
</div>
