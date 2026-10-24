<script lang="ts">
  // The plus, drawn to Solar's own grammar (24px grid, 1.5 linear stroke,
  // round caps, 1.2em box like unplugin's), a step inside Solar's bare linear
  // `add`, whose arms reach the grid's edge.
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
    d="M12 5v14M5 12h14"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
