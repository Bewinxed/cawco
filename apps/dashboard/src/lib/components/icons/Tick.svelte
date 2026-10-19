<script lang="ts">
  // Solar has no bare check — check-read is a double tick, which reads as "read" in a menu or checkbox.
  // Drawn like Plus.svelte: 24px grid, 1.5 linear stroke, round caps.
  import type { SVGAttributes } from "svelte/elements";

  let { ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-hidden="true"
  fill="none"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <path
    d="M5 12.5l4.5 4.5L19 7.5"
    pathLength="1"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
  />
</svg>
