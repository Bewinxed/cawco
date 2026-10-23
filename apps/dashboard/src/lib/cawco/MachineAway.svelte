<!--
  What a surface says, in place, while an ask of one machine waits for it
  (machine-wait.svelte.ts `MachineWait`, its words `awayWords`): the machine
  by its name, on its way back until the hub's deadline for it passes on this
  clock, offline after, and that the ask runs again by itself once it is
  back. A line of its own, never a refusal: nothing for the reader to press.
  Nothing while no ask waits.
-->
<script lang="ts">
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import type { MachineAwayError } from "./hub-read";
  import { awayWords } from "./machine-wait.svelte";

  let { away }: { away: MachineAwayError | null } = $props();

  /** This clock, moved once at the hub's deadline for the machine's way back. */
  let now = $state(Date.now());

  $effect(() => {
    const until = away?.reconnectingUntil ?? null;
    const at = Date.now();
    now = at;
    if (until === null || until <= at) {
      return;
    }
    const timer = setTimeout(() => {
      now = Date.now();
    }, until - at);
    return () => clearTimeout(timer);
  });
</script>

{#if away}
  <p
    data-slot="machine-away"
    class="type-meta max-w-c-measure text-pretty wrap-anywhere text-ink-muted"
    role="status"
    in:unfold
    out:unfold
  >
    {awayWords(away, now)}
  </p>
{/if}
