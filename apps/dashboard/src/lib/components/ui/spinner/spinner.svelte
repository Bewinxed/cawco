<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    class: className,
    role = "status",
    "aria-label": ariaLabel = "Loading",
    ...restProps
  }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-label={ariaLabel}
  class={cn("size-4 animate-spin", className)}
  fill="none"
  {role}
  stroke="currentColor"
  viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg"
  {...restProps}
>
  <circle cx="12" cy="12" opacity="0.25" r="9" stroke-width="2.5" />
  <circle
    cx="12"
    cy="12"
    pathLength="100"
    r="9"
    stroke-dasharray="25 100"
    stroke-linecap="round"
    stroke-width="2.5"
  />
</svg>
