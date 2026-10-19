<script lang="ts">
  /**
   * The Usage page's Limits block on a bench: the real block, fed the usage
   * benches' staged forecast with no hub (`usage-relay/stage.ts`). `?n=` 6 |
   * 20 Claude accounts, `?theme=` light | dark, `?stop=1` stops the relay
   * inside the five hours, `?stop=2` puts every account at its limit. The
   * Go plan is at its limit in every one.
   */
  import { onMount } from "svelte";
  import LimitsBlock from "#lib/cawco/usage/LimitsBlock.svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";
  import { stageUsage, unstageUsage } from "../usage-relay/stage";

  const count = $derived(page.url.searchParams.get("n") === "20" ? 20 : 6);
  $effect(() => {
    stageUsage(count, page.url.searchParams.get("stop"));
  });
  $effect(() => {
    theme.set(page.url.searchParams.get("theme") === "dark" ? "dark" : "light");
  });
  onMount(() => unstageUsage);
</script>

<svelte:head><title>Usage limits | CawCo</title></svelte:head>

<main class="mx-auto max-w-wide px-space-4 py-space-6" data-usage-bench>
  <LimitsBlock />
</main>
