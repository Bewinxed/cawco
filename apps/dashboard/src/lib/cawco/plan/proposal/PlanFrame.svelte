<script lang="ts" module>
  export type FrameKind = "desk" | "phone";
</script>

<script lang="ts">
  /**
   * The plan panel's fixture for the component canvas: one way of drawing
   * the plan (PlanBody) in the desk's 360px side card or the phone's 390
   * sheet, fed the booking-page plan, standing still or live (a beat every
   * 2.4s). Everything else (opening a step, pushing its page, ticking a
   * to-do) is the person's to do in the live component. Three values are
   * the person's to tune: the tile's size, the progress line's weight and
   * the sweep's speed.
   */
  import { onMount } from "svelte";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_BEATS, livePlan, plan as still } from "./fixtures";
  import PhonePlan from "./PhonePlan.svelte";
  import PlanBody, { type Variation } from "./PlanBody.svelte";
  import type { Scenario } from "./view.svelte";

  let {
    variation,
    frame = "desk",
    live = false,
    scenario = "rest",
    tileSize = 18,
    lineWeight = 4,
    sweepSeconds = 1.2,
  }: {
    /** Which way the plan is drawn. */
    variation: Variation;
    frame?: FrameKind;
    /** Steps move on by themselves, a beat every 2.4s. */
    live?: boolean;
    /** At rest, or one change already made: a step reworded, commented on, answered. */
    scenario?: Scenario;
    /** The step tile's side, px (DESIGN.md's tree mark: 18). */
    tileSize?: number;
    /** The progress line's weight, px (the usage strip's bar: 4). */
    lineWeight?: number;
    /** One crossing of the sweep, and one run of the pulse, in seconds (--dur-loop: 1.2). */
    sweepSeconds?: number;
  } = $props();

  const loaded = Date.now();
  /** A story that opens a step stands its frame scrolled to that step. */
  const focus = $derived(
    scenario === "commented" || scenario === "acknowledged" ? "a2" : undefined
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

<div
  class="frame"
  data-beat={live ? beat : undefined}
  style:--pv-tile="{tileSize}px"
  style:--mark-size="{tileSize}px"
  style:--pv-line="{lineWeight}px"
  style:--pv-sweep="{sweepSeconds}s"
>
  {#if frame === "desk"}
    <DeskPlan {focus} {plan}>
      <PlanBody {loaded} {plan} {scenario} {variation} />
    </DeskPlan>
  {:else}
    <PhonePlan {focus} {plan}>
      <PlanBody {loaded} phone {plan} {scenario} {variation} />
    </PhonePlan>
  {/if}
</div>

<style>
  .frame {
    display: flex;
    inline-size: max-content;
    max-inline-size: 100%;
  }
</style>
