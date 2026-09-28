<script lang="ts">
  // Solar has no bare close — every "close" it ships is enclosed in a circle
  // or square, and at a close button's size the ring leaves the X too small
  // to read. This is the missing glyph, drawn to the set's own grammar:
  // 24px grid, 1.5 linear stroke, round caps, 1.2em box like unplugin's.
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
