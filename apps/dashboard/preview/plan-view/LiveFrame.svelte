<script lang="ts">
  /**
   * A variation live: the plan moving on a beat at a time, so the person
   * sees a sub-step tick and the next start, a delegate's line fill and its
   * sweep stop, a to-do tick and the ring move on, and the step that waited
   * on two others start. Its caption says the beat it is on and holds the
   * demo's pause.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_BEATS, livePlan } from "./fixtures";
  import PlanBody, { type Variation } from "./PlanBody.svelte";

  let {
    loaded,
    variation,
    what,
  }: {
    loaded: number;
    variation: Variation;
    /** What this variation adds to the motion, said in the caption. */
    what: string;
  } = $props();

  const BEAT = 2400;
  let beat = $state(0);
  let playing = $state(true);
  const plan = $derived(livePlan(beat));

  onMount(() => {
    const timer = setInterval(() => {
      if (playing) {
        beat = (beat + 1) % LIVE_BEATS.length;
      }
    }, BEAT);
    return () => clearInterval(timer);
  });
</script>

<figure data-beat={beat} data-kind="live" data-slot="live">
  <DeskPlan {plan}>
    <PlanBody {loaded} open={["a2"]} {plan} {variation} />
  </DeskPlan>
  <figcaption class="caption">
    <span class="words">
      <span class="on-desk">Desk</span><span class="on-phone">Phone</span> ·
      Live: steps move on by themselves. {what}
      <span class="now" aria-live="polite"
        >Beat {beat + 1} of {LIVE_BEATS.length}: {LIVE_BEATS[beat]}</span
      >
    </span>
    <Button
      onclick={() => {
        playing = !playing;
      }}
      size="sm"
      variant="outline"
      ><span class="both"
        ><span aria-hidden={!playing} class:off={!playing}>Pause the demo</span
        ><span aria-hidden={playing} class:off={playing}>Play the demo</span
        ></span
      ></Button
    >
  </figcaption>
</figure>

<style>
  figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    max-inline-size: 100%;
    margin: 0;
  }
  .caption {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-2);
    max-inline-size: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .words {
    min-inline-size: 0;
    text-wrap: pretty;
  }
  .now {
    display: block;
    margin-block-start: var(--space-1);
    color: var(--ink-strong);
  }
  .on-phone {
    display: none;
  }
  @media (width < 700px) {
    .caption {
      padding-inline: var(--space-4);
    }
    .on-desk {
      display: none;
    }
    .on-phone {
      display: inline;
    }
  }
  /* Both words stand in one cell as wide as the wider, so the button never
     changes width (DESIGN.md, The Steady Swap Rule). */
  .both {
    display: inline-grid;

    & > span {
      grid-area: 1 / 1;
      transition: opacity var(--dur-morph) var(--ease-out);
    }
    & > .off {
      opacity: 0;
    }
  }
</style>
