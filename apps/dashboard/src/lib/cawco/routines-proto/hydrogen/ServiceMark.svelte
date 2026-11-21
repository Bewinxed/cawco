<script lang="ts">
  import { LogoGithub, LogoLinear, LogoSlack } from "@cawco/icons/marks";
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { IconGlobe } from "#lib/icons.js";
  import type { ServiceKey } from "./routines-data";

  const SERVICE_MARKS: Record<
    ServiceKey,
    Component<SVGAttributes<SVGSVGElement>>
  > = {
    github: LogoGithub,
    slack: LogoSlack,
    linear: LogoLinear,
    cloudflare: IconGlobe,
  };

  let {
    service,
    size = "md",
  }: {
    service: ServiceKey;
    size?: "sm" | "md";
  } = $props();

  const Mark = $derived(SERVICE_MARKS[service]);
  const iconClass = $derived(size === "sm" ? "size-icon-sm" : "size-icon-md");
</script>

<span
  aria-hidden="true"
  class="inline-flex flex-none items-center justify-center text-ink-muted"
  data-box
>
  <Mark class={iconClass} />
</span>
