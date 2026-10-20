<script lang="ts" module>
  export type FrameKind = "desk" | "phone" | "device" | "delegate";
</script>

<script lang="ts">
  /**
   * The plan panel's fixture for the component canvas: one way of drawing
   * the plan (PlanBody) in the desk's 360px side card or the phone's 390
   * sheet, fed the booking-page plan, standing still or live (a beat every
   * 2.4s). `device` draws the one the reader's own screen would show: the
   * phone's sheet under a finger (`pointer: coarse`), the desk's card under
   * a mouse. `delegate` draws a working delegate's row alone. Everything
   * else (opening a step, pushing its page, ticking a to-do) is the
   * person's to do in the live component. Three values are the person's
   * to tune: the tile's size, the progress line's weight and the sweep's
   * speed.
   *
   * `held` stands every sweep and pulse where its run puts it at that
   * share of a run (0 its start, 1 its end), drawn there with no
   * animation, so a still shows the motion at a stated point.
   */
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import DelegateFrame from "./DelegateFrame.svelte";
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
    held,
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
    /** Every sweep and pulse stood at this share of its run, 0 to 1, not moving. */
    held?: number;
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
  const focus = $derived.by(() => {
    if (scenario === "opened") {
      return "a4";
    }
    return scenario === "commented" || scenario === "acknowledged"
      ? "a2"
      : undefined;
  });
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
  data-held={held === undefined ? undefined : ""}
  data-kind={kind}
  style:--pv-tile="{tileSize}px"
  style:--mark-size="{tileSize}px"
  style:--pv-line="{lineWeight}px"
  style:--pv-sweep="{sweepSeconds}s"
  style:--pv-at={held}
>
  {#if kind === "delegate"}
    <DelegateFrame />
  {:else if kind === "desk"}
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
  /* Held: the progress line's sweep (ProgressLine.svelte, `kit-skeleton-sweep`
     from -100% to 100% of its box) and the line's pulse (Connectors.svelte,
     `pv-pulse`, down its run's length) stand where their run is at that share,
     in full, with no animation. */
  .frame[data-held] :global(.pv-sweep) {
    animation: none;
    translate: calc(-100% + var(--pv-at) * 200%) 0;
  }
  .frame[data-held] :global(.pv-pulse) {
    animation: none;
    opacity: 1;
    translate: 0 calc(var(--pv-at) * var(--len));
  }
</style>
