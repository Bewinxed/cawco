<script lang="ts">
  // The search glyph, in Solar's bold-duotone cut with the detail Solar's
  // own lenses lack. Every lens Solar ships in that cut
  // (`magnifer-bold-duotone`, `magnifier-bold-duotone`, their minimalistic
  // and rounded twins) is a plain half-ink disc and a handle, which beside
  // the bar's other symbols at 20px reads as a solid disc. This keeps
  // `magnifer-bold-duotone`'s disc and handle to the unit and adds a
  // full-ink glint over 70° of the lens's upper left, 1.5 units wide as the
  // set's strokes are, so it carries full-ink detail as the server and the
  // folder do. 24px grid, 1.2em box like unplugin's.
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
    d="M20.313 11.157a9.157 9.157 0 1 1-18.313 0a9.157 9.157 0 0 1 18.313 0"
    fill="currentColor"
    opacity=".5"
  />
  <path
    d="m17.1 18.122l3.666 3.666a.723.723 0 0 0 1.023-1.022L18.122 17.1a9 9 0 0 1-1.022 1.022"
    fill="currentColor"
  />
  <path
    d="M5.741 10.202A5.5 5.5 0 0 1 10.202 5.741"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
