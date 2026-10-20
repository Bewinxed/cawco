<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The trigger by its role (DESIGN.md, Components). A compact one scales on
   * press, a wide one tints (The Press Rule); its fill and ink are the
   * role's, a state is its attribute.
   * - `chip`: a setting chip (New-session dialog: "Setting chips are 30px
   *   with an 8px radius, a 16px glyph and a 12px chevron"), the option
   *   chip's recipe (`kit-chip`).
   * - `state`: a state chip that opens what it reports (a rollout's): the
   *   recess, meta words in the muted ink, `data-fail` taking the fail pair,
   *   its fill and ink settling over --dur-panel.
   * - `count`: a count drawn on the kit's Badge (`badge`), a numeral at
   *   meta size (The Earned Count Rule) that opens what it counts.
   * - `strip`, `strip-home`: the usage strip, one control one height
   *   whatever it says, painting its own ground under the pointer or open
   *   (`ring-ground-*`, the dials' reserve notch); `strip-home` on the phone
   *   home's raised card.
   * - `meter`: the composer's context meter, a glyph and its figure;
   *   `data-warn`, `data-critical` and `data-compacting` take their inks.
   */
  export const popoverTriggerVariants = tv({
    variants: {
      look: {
        chip: "kit-chip motion-safe:transition-control-press motion-safe:pressed:scale-(--press-scale)",
        state:
          "mark-line inline-flex h-c-btn-h-xs items-center gap-space-1 rounded-sm bg-surface-recess px-space-2 type-meta whitespace-nowrap text-ink-muted transition-chip-settle not-data-fail:hover:bg-surface-hover data-fail:bg-status-fail-bg data-fail:text-status-fail-ink motion-safe:pressed:scale-(--press-scale)",
        count:
          "pressable h-icon-md min-w-icon-md cursor-pointer overflow-visible px-space-1 text-ink-row type-meta leading-none num",
        strip:
          "press-tint flex h-c-btn-h-lg cursor-pointer items-center rounded-sm px-space-3 text-start text-ink-strong transition-[background-color] dur-control ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
        "strip-home":
          "press-tint flex h-c-usage-strip-home-h cursor-pointer items-center rounded-md px-space-4 text-start text-ink-strong transition-[background-color] dur-control ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
        meter:
          "mark-line flex h-c-bar-item items-center gap-space-2 rounded-sm px-space-2 text-label tabular-nums text-ink-muted transition-[background-color,color] dur-control ease-out hover:bg-surface-hover data-warn:not-data-critical:not-data-compacting:text-warning-9 data-critical:not-data-compacting:text-error-9 data-compacting:text-ink-strong",
      },
    },
  });

  export type PopoverTriggerLooks = VariantProps<typeof popoverTriggerVariants>;
</script>

<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import { badgeVariants } from "#lib/components/ui/badge/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    badge = false,
    look,
    ...restProps
  }: PopoverPrimitive.TriggerProps &
    PopoverTriggerLooks & {
      /** A trigger drawn as the kit's Badge. */
      badge?: boolean;
    } = $props();
</script>

<PopoverPrimitive.Trigger
  class={cn(
    "touch-hit",
    badge && badgeVariants(),
    popoverTriggerVariants({ look }),
    className
  )}
  data-slot="popover-trigger"
  bind:ref
  {...restProps}
/>
