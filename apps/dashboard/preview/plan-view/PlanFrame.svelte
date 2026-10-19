<script lang="ts" module>
  export type FrameKind = "desk" | "phone";
</script>

<script lang="ts">
  /**
   * The plan panel's fixture for the sheet: one variation of the plan's body
   * (PlanBody) in the desk's 360px side card or the phone's 390 sheet, fed
   * the booking-page plan and standing at one state (which rows are open,
   * which page the phone has pushed, which row it is scrolled to), or live,
   * moving a beat at a time. Today draws the panel as it is now. Three
   * values are the person's to tune: the tile's size, the progress line's
   * weight and the sweep's speed.
   */
  import { onMount } from "svelte";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_BEATS, livePlan, plan as still } from "./fixtures";
  import PhonePlan from "./PhonePlan.svelte";
  import Pick from "./Pick.svelte";
  import PlanBody, { type Variation } from "./PlanBody.svelte";
  import TodayPlan from "./TodayPlan.svelte";

  let {
    variation,
    frame = "desk",
    open = [],
    pushed,
    focus,
    live = false,
    pick = false,
    tileSize = 18,
    lineWeight = 4,
    sweepSeconds = 1.2,
  }: {
    /** Which way the plan is drawn; "today" is the panel as it ships. */
    variation: Variation | "today";
    frame?: FrameKind;
    /** Rows standing open, by id. */
    open?: string[];
    /** The step or delegate whose page the phone stands on. */
    pushed?: string;
    /** The row the card or sheet stands scrolled to. */
    focus?: string;
    /** Steps move on by themselves, a beat every 2.4s. */
    live?: boolean;
    /** The variation's Pick and notes under the frame. */
    pick?: boolean;
    /** The step tile's side, px (DESIGN.md's tree mark: 18). */
    tileSize?: number;
    /** The progress line's weight, px (the usage strip's bar: 4). */
    lineWeight?: number;
    /** One crossing of the sweep, and one run of the pulse, in seconds (--dur-loop: 1.2). */
    sweepSeconds?: number;
  } = $props();

  const loaded = Date.now();
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

  const NAMES = { a: "One ledger", b: "Lanes", c: "Crew first" };
  const LINES = {
    a: "The least new: one list, delegates nested under their to-do, dependencies as a chip.",
    b: "Draws the dependencies: two lanes and lines between steps, pulsing to a working delegate.",
    c: "Your stack: which delegate is on which problem, with its progress, above a quiet to-do list.",
  };
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
    <DeskPlan bare {focus} {plan} today={variation === "today"}>
      {#if variation === "today"}
        <TodayPlan {plan} />
      {:else}
        <PlanBody {loaded} {open} {plan} {variation} />
      {/if}
    </DeskPlan>
  {:else}
    <PhonePlan {focus} {plan} today={variation === "today"}>
      {#if variation === "today"}
        <TodayPlan {plan} sheet />
      {:else}
        <PlanBody {loaded} {open} phone {plan} {pushed} {variation} />
      {/if}
    </PhonePlan>
  {/if}
  {#if live}
    <p class="beat" aria-live="polite">
      Beat {beat + 1} of {LIVE_BEATS.length}: {LIVE_BEATS[beat]}
    </p>
  {/if}
  {#if pick && variation !== "today"}
    <div data-cawco-choice="plan-variation" class="choice">
      <Pick
        line={LINES[variation]}
        name={NAMES[variation]}
        names={NAMES}
        option={variation}
        recommended={variation === "c"}
      />
    </div>
  {/if}
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: max-content;
    max-inline-size: 100%;
  }
  .beat {
    max-inline-size: 360px;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .choice {
    max-inline-size: 390px;

    & :global(.pick) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
