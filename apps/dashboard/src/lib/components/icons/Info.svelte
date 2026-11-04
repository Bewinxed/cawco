<script lang="ts">
  // Solar ships info only in a circle or a square (info-circle, info-square).
  // An icon is the glyph alone (DESIGN.md, The Solar Duotone Rule; the owner,
  // 10-24: "u need to draw similar style icons that are without their
  // containers"), so this is the bare "i" the way Solar unwraps its own
  // danger-circle into exclamation-mark: that glyph turned over, on the 24px
  // grid, its stem at half ink and its dot at full ink.
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
  <!-- Bold, as Solar's bold-duotone glyphs are drawn: a filled stem at
       half ink under a full-ink dot, sized to read beside its siblings at
       16px (a 1.5 stroke under a 0.75 dot drew a bare grey line). -->
  <rect
    fill="currentColor"
    height="10.5"
    opacity=".5"
    rx="1.75"
    width="3.5"
    x="10.25"
    y="9.5"
  />
  <circle cx="12" cy="5.5" fill="currentColor" r="2" />
</svg>
