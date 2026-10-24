<script lang="ts">
  // The minus, drawn like Plus.svelte (24px grid, 1.5 linear stroke, round caps),
  // a step inside Solar's bare linear `minus`, which reaches the grid's edge.
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
    d="M5 12h14"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
  />
</svg>
