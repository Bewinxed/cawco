<script lang="ts">
  /**
   * The live frame: the task attempt advancing a beat at a time, so the
   * person sees a step arrive, a tick draw, the ring move and a delegate's
   * step fold open, then the whole run start again.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import DeskPlan from "./DeskPlan.svelte";
  import { LIVE_PHASES, livePhase } from "./fixtures";
  import ProposedPlan from "./ProposedPlan.svelte";

  let { loaded }: { loaded: number } = $props();

  const BEAT = 2400;
  let phase = $state(0);
  let playing = $state(true);
  const plan = $derived(livePhase(phase));

  onMount(() => {
    const timer = setInterval(() => {
      if (playing) {
        phase = (phase + 1) % LIVE_PHASES;
      }
    }, BEAT);
    return () => clearInterval(timer);
  });
</script>

<div class="live">
  <DeskPlan {plan}>
    <ProposedPlan {loaded} {plan} />
  </DeskPlan>
  <Button
    onclick={() => {
      playing = !playing;
    }}
    size="sm"
    variant="outline"
    ><span class="both"
      ><span aria-hidden={!playing} class:off={!playing}>Pause</span><span
        aria-hidden={playing}
        class:off={playing}>Play</span
      ></span
    ></Button
  >
</div>

<style>
  .live {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-3);
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
