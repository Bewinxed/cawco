<script lang="ts">
  /**
   * A Rings figure ("3h 10m", "back in 2h 10m"): a new reading morphs it
   * (MorphText, as the session rows' figures do); the minute moving on sets
   * it in place.
   */
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { usage } from "./forecast.svelte";

  let { text }: { text: string } = $props();
</script>

<MorphText still={usage.cause === "clock"} {text} />
