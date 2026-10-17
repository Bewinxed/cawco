<script lang="ts">
  /**
   * The Usage page's Limits block on a bench: the real block, fed the usage
   * benches' staged forecast with no hub (`usage-relay/stage.ts`). `?n=` 6 |
   * 20 Claude accounts, `?theme=` light | dark, `?stop=1` stops the relay
   * inside the five hours, `?stop=2` puts every account at its limit. The
   * Go plan is at its limit in every one.
   */
  import { onMount } from "svelte";
  import { usage } from "#lib/cawco/usage/forecast.svelte.js";
  import LimitsBlock from "#lib/cawco/usage/LimitsBlock.svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";
  import { stageUsage } from "../usage-relay/stage";

  const count = $derived(page.url.searchParams.get("n") === "20" ? 20 : 6);
  $effect(() => {
    stageUsage(count, page.url.searchParams.get("stop"));
  });
  $effect(() => {
    theme.set(page.url.searchParams.get("theme") === "dark" ? "dark" : "light");
  });
  onMount(() => () => usage.stage(null));
</script>

<svelte:head><title>Usage limits | CawCo</title></svelte:head>

<!-- literal: 72rem -->
<main
  class="mx-auto max-w-(--measure) px-space-4 py-space-6"
  data-usage-bench
  style:--measure="72rem"
>
  <LimitsBlock />
</main>
