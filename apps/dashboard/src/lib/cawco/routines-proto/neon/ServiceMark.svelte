<script lang="ts">
  import { LogoGithub, LogoLinear, LogoSlack } from "@cawco/icons/marks";
  import { IconGlobe } from "#lib/icons.js";
  import type { ServiceKey } from "./routines-data";

  let {
    service,
    size = "md",
  }: {
    service: ServiceKey;
    size?: "sm" | "md";
  } = $props();

  const sizeClass = $derived(size === "sm" ? "size-icon-sm" : "size-icon-md");
</script>

<span
  aria-hidden="true"
  class="inline-flex flex-none items-center justify-center text-ink-muted"
  data-box
>
  {#if service === "github"}
    <LogoGithub class={sizeClass} />
  {:else if service === "slack"}
    <LogoSlack class={sizeClass} />
  {:else if service === "linear"}
    <LogoLinear class={sizeClass} />
  {:else}
    <IconGlobe class={sizeClass} />
  {/if}
</span>
