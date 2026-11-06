<script lang="ts">
  // Solar has no bare close — every "close" it ships is enclosed in a circle
  // or square, and at a close button's size the ring leaves the X too small
  // to read. This is the missing glyph, drawn to the set's own grammar:
  // 24px grid, 1.5 linear stroke, round caps, 1.2em box like unplugin's. It
  // spans 15 of the 24 units, Plus 18 and Solar's lens and refresh 20 (a
  // diagonal's arms run longer than its span), so a bar's symbols read one
  // size; at 12 it stood 10px wide beside a 17px lens.
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
    d="M4.5 4.5l15 15M19.5 4.5l-15 15"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
