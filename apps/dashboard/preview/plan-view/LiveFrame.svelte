<script lang="ts">
  /**
   * The live frame: the task attempt moving on a beat at a time, so the
   * person sees a sub-step tick, a delegate's step arrive and fold open, a
   * to-do tick and the ring move on, then the run start again. Its caption
   * says the beat it is on, and holds the demo's pause.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_BEATS, livePhase } from "./fixtures";
  import ProposedPlan from "./ProposedPlan.svelte";

  let { loaded }: { loaded: number } = $props();

  const BEAT = 2400;
  let beat = $state(0);
  let playing = $state(true);
  const plan = $derived(livePhase(beat));

  onMount(() => {
    const timer = setInterval(() => {
      if (playing) {
        beat = (beat + 1) % LIVE_BEATS.length;
      }
    }, BEAT);
    return () => clearInterval(timer);
  });
</script>

<figure data-beat={beat} data-slot="live">
  <DeskPlan {plan}>
    <ProposedPlan {loaded} {plan} />
  </DeskPlan>
  <figcaption class="caption">
    <span class="words">
      <span class="on-desk">Desk</span><span class="on-phone">Phone</span> ·
      Live: a sub-step ticks, a delegate's step arrives under the deposit and
      folds open, then the to-do ticks and the ring moves on.
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
  /* The caption's words, then the demo's control on a row of its own. */
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
  /* The frame says where it is drawn: the desk's card, or on a phone's
     page the same card at the phone's width. */
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
