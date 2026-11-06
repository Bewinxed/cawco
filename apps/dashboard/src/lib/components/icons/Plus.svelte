<script lang="ts">
  // Solar has no bare plus — every "add" it ships is enclosed in a circle or
  // square, which double-encloses inside pill buttons and reads small on a
  // 32px row. This is the missing glyph, drawn to the set's own grammar:
  // 24px grid, 1.5 linear stroke, round caps, 1.2em box like unplugin's. It
  // spans 18 of the 24 units, Solar's lens and refresh 20, so a bar's symbols
  // read one size (Close.svelte).
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
    d="M12 3v18M3 12h18"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
