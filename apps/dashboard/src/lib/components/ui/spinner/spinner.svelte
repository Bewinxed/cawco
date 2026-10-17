<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  export const spinnerVariants = tv({
    variants: {
      /** The muted ink; or the live glyph while its run is running. */
      tone: {
        muted: "text-ink-muted",
        "live-running": "group-status-running/time:text-status-live-glyph",
      },
      /** 24px, a page's own wait. */
      box: { large: "size-6" },
      /** In a glyph cell that shows it only while busy (`glyph-busy`),
          fading in and out; held still while hidden. */
      reveal: {
        "glyph-busy":
          "motion-safe:dur-control not-group-glyph-busy:animation-paused opacity-0 group-glyph-busy:opacity-100 motion-safe:transition-opacity motion-safe:ease-out",
      },
    },
  });

  export type SpinnerLooks = VariantProps<typeof spinnerVariants>;
</script>

<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    class: className,
    role = "status",
    "aria-label": ariaLabel = "Loading",
    tone,
    box,
    reveal,
    ...restProps
  }: SVGAttributes<SVGSVGElement> & SpinnerLooks = $props();
</script>

<svg
  aria-label={ariaLabel}
  class={cn(
    "size-icon-md animate-spin",
    spinnerVariants({ tone, box, reveal }),
    className
  )}
  fill="none"
  {role}
  stroke="currentColor"
  viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg"
  {...restProps}
>
  <circle cx="12" cy="12" opacity="0.25" r="9" stroke-width="2.5" />
  <circle
    cx="12"
    cy="12"
    pathLength="100"
    r="9"
    stroke-dasharray="25 100"
    stroke-linecap="round"
    stroke-width="2.5"
  />
</svg>
