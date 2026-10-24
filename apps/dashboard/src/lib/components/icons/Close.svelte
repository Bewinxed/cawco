<script lang="ts">
  // The close X, drawn to Solar's own grammar (24px grid, 1.5 linear stroke,
  // round caps, 1.2em box like unplugin's), a step inside Solar's bare linear
  // `close`, whose arms reach the grid's edge.
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
    d="M6 6l12 12M18 6L6 18"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
