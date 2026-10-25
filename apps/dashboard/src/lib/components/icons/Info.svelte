<script lang="ts">
  // Solar ships info only in a circle or a square (info-circle, info-square).
  // An icon is the glyph alone (DESIGN.md, The Solar Duotone Rule; the owner,
  // 10-24: "u need to draw similar style icons that are without their
  // containers"), so this is the bare "i" the way Solar unwraps its own
  // danger-circle into exclamation-mark: that glyph turned over, on the 24px
  // grid, its 1.5 stem at half ink and its dot at full ink.
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
    d="M12 8.667V22"
    fill="none"
    opacity=".5"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
  <circle cx="12" cy="2" fill="currentColor" r=".75" />
</svg>
