<script lang="ts">
  /**
   * The first-run row where the fleet board draws it (the detail area on a
   * desk, the home page on a phone), from the hub's facts (first-run.svelte.ts):
   * it stands while the fleet has no project and goes with the first one.
   * The first machine registering while it is on screen is Caw's arrival
   * (FirstRun `arrived`), said once.
   */
  import { untrack } from "svelte";
  import FirstRun from "./FirstRun.svelte";
  import { firstRunActs, firstRunSteps } from "./first-run.svelte";

  const steps = $derived(firstRunSteps());
  /** The first machine came online while the row stood: Caw has just arrived. */
  let arrived = $state(false);
  let before = untrack(() => steps?.machine.state);
  $effect(() => {
    const now = steps?.machine.state;
    if (now === "done" && before !== undefined && before !== "done") {
      arrived = true;
    }
    before = now;
  });
</script>

{#if steps}
  <FirstRun {arrived} {steps} {...firstRunActs} />
{/if}
