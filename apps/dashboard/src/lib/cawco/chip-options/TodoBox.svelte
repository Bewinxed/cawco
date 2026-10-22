<script lang="ts">
  /**
   * The open to-do's glyph the spec asks for (`todo-box`): a rounded square,
   * drawn as the house's own linear glyphs are (Tick.svelte, Plus.svelte):
   * a 24px grid, a 1.5 stroke, round joins. Its ticked partner is Solar's
   * check-square bold duotone.
   */
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
  <rect
    height="16.5"
    rx="4.5"
    stroke="currentColor"
    stroke-linejoin="round"
    stroke-width="1.5"
    width="16.5"
    x="3.75"
    y="3.75"
  />
</svg>
