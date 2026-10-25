<script lang="ts">
  // Solar ships its plug only inside a circle (plug-circle). An icon is the
  // glyph alone (DESIGN.md, The Solar Duotone Rule; the owner, 10-24: "u need
  // to draw similar style icons that are without their containers"), so this
  // is that plug drawn bare at the grid's height, in Solar's grammar: 24px
  // grid, 1.5 strokes with round caps, the body solid at half ink, the prongs
  // and cord at full ink.
  import type { SVGAttributes } from "svelte/elements";

  let { ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-hidden="true"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <path
    d="M6 8.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V11a6 6 0 0 1-12 0z"
    fill="currentColor"
    opacity=".5"
  />
  <path
    d="M9 2.75V7.5M15 2.75V7.5M12 17v4.25"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
