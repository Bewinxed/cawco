<script lang="ts">
  /**
   * A clip's curve drawn small (The Show Don't Tell Rule): its value over
   * its time on a 16 × 10 glyph at 1.5px, a spring past its end where it
   * bounces. Hidden from a reader: the curve's word beside it names it.
   */
  import { type Curve, curvePoints } from "@cawco/core/design-graph";

  let { curve, response = 400 }: { curve: Curve; response?: number } = $props();

  const d = $derived(
    curvePoints(curve, 24, response)
      .map(
        ([x, y], at) =>
          `${at ? "L" : "M"}${(1 + x * 14).toFixed(2)} ${(9 - y * 8).toFixed(2)}`
      )
      .join(" ")
  );
</script>

<svg
  aria-hidden="true"
  class="h-auto w-icon-md flex-none overflow-visible"
  viewBox="0 0 16 10"
>
  <path
    {d}
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
  ></path>
</svg>
