<script lang="ts">
  /**
   * A Rings figure ("3h 10m", "back in 2h 10m"): a new reading morphs it
   * (TextMorph at --dur-morph, as the session rows' figures do); the minute
   * moving on sets it in place. The server draws plain text.
   */
  import { TextMorph } from "torph/svelte";
  import { CURVE, morphMs, motionOk } from "../motion/curves.svelte";
  import { usage } from "./forecast.svelte";

  let { text }: { text: string } = $props();

  let ms = $state(0);
  $effect(() => {
    ms = morphMs();
  });
</script>

{#if ms}
  <TextMorph
    as="span"
    duration={usage.cause === "clock" || !motionOk.current ? 0 : ms}
    ease={CURVE.out}
    {text}
  />
{:else}
  <span>{text}</span>
{/if}
