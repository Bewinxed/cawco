<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { tv } from "#lib/utils.js";

  /**
   * The trigger by its role (DESIGN.md, Components). A compact one scales on
   * press, a wide one tints (The Press Rule); its fill and ink are the
   * role's, a state is its attribute.
   * - `chip`: a setting chip (New-session dialog: "Setting chips are 30px
   *   with an 8px radius, a 16px glyph and a 12px chevron"), ui/chip's
   *   `setting` recipe, its press included.
   * - `state`: a state chip that opens what it reports (a rollout's): the
   *   recess, meta words in the muted ink, `data-fail` taking the fail pair,
   *   its fill and ink settling over --duration-panel.
   * - `count`: a count drawn on the kit's Badge (`badge`), a numeral at
   *   meta size (The Earned Count Rule) that opens what it counts.
   * - `strip`, `strip-home`: the usage strip, one control one height
   *   whatever it says, painting its own ground under the pointer or open
   *   (`ring-ground-*`, the dials' reserve notch); `strip-home` on the phone
   *   home's raised card.
   * - `meter`: the composer's context meter, a glyph and its figure;
   *   `warning-9`, `data-critical` and `data-compacting` take their inks.
   * - `mark`: a status mark or badge that opens what it reports
   *   (Configure → CLI tools: Not updated, Failed, Unsupported): the mark
   *   drawn inside it is its whole look, no fill of its own ("Needs you is
   *   a mark, never a surface", DESIGN.md), and it scales on press as a
   *   compact control.
   * - `swatch`: a colour's swatch that opens its picker (the design graph's
   *   colour control): the swatch drawn inside it is its whole look, its
   *   focus ring hugging it.
   */
  export const popoverTriggerVariants = tv({
    variants: {
      look: {
        chip: chipVariants({ variant: "setting" }),
        state:
          "mark-line type-meta inline-flex h-c-btn-h-xs items-center gap-space-1 whitespace-nowrap rounded-sm bg-surface-recess px-space-2 text-ink-muted transition-chip-settle not-data-fail:hover:bg-surface-hover data-fail:bg-status-fail-bg data-fail:text-status-fail-ink motion-safe:pressed:scale-(--press-scale)",
        count:
          "pressable type-meta num h-icon-md min-w-icon-md overflow-visible px-space-1 text-ink-row leading-none",
        strip:
          "press-tint flex h-c-btn-h-lg items-center rounded-sm px-space-3 text-start text-ink-strong transition-[background-color] duration-(--duration-control) ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
        "strip-home":
          "press-tint flex h-14 items-center rounded-md px-space-4 text-start text-ink-strong transition-[background-color] duration-(--duration-control) ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
        mark: "pressable inline-flex rounded-xs",
        swatch:
          "pointer-hit grid place-items-center rounded-xs outline-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-1",
        meter:
          "mark-line flex h-c-bar-item items-center gap-space-2 rounded-sm px-space-2 text-ink-muted type-label tabular-nums transition-[background-color,color] duration-(--duration-control) ease-out hover:bg-surface-hover data-compacting:text-ink-strong data-critical:not-data-compacting:text-error-9 data-warn:not-data-critical:not-data-compacting:text-warning-9",
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
