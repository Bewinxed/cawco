<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { segmentedVariants } from "#lib/components/ui/fluid-tabs/thumb.js";
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
   *   its fill and ink settling over --duration-slow.
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
   * - `segment`: a segment of a segmented group that opens what the group
   *   has no room for (the repository picker's "+N" owners): the kit's
   *   segment (fluid-tabs/thumb), pressed with the tint as a toggle item is, its
   *   groove hover held while it is open, its words numerals;
   *   `segment-compact` on the compact segment, beside compact toggle
   *   items.
   */
  export const popoverTriggerVariants = tv({
    variants: {
      look: {
        chip: chipVariants({ variant: "setting" }),
        state:
          "mark-line type-meta inline-flex h-space-6 items-center gap-space-1 whitespace-nowrap rounded-sm bg-bg-2 px-space-2 text-tx-2 transition-chip-settle not-data-fail:hover:bg-ui data-fail:bg-bg-2 data-fail:text-red motion-safe:pressed:scale-(--press-scale)",
        count:
          "pressable type-meta num h-icon-md min-w-icon-md overflow-visible px-space-1 text-tx leading-none",
        strip:
          "press-tint flex h-control-lg items-center rounded-sm px-space-3 text-start text-tx transition-[background-color] duration-(--duration-fast) ease-out hover:bg-ui hover:ring-ground-ui aria-expanded:bg-ui aria-expanded:ring-ground-ui",
        "strip-home":
          "press-tint flex h-14 items-center rounded-sm px-space-4 text-start text-tx transition-[background-color] duration-(--duration-fast) ease-out hover:bg-ui hover:ring-ground-ui aria-expanded:bg-ui aria-expanded:ring-ground-ui",
        mark: "pressable inline-flex rounded-xs",
        swatch:
          "pointer-hit grid place-items-center rounded-xs outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-1",
        segment: `${segmentedVariants().segment()} num press-tint focus-inset shrink-0 aria-expanded:bg-ui-2`,
        "segment-compact": `${segmentedVariants({ compact: true }).segment()} num press-tint focus-inset shrink-0 aria-expanded:bg-ui-2`,
        meter:
          "mark-line flex h-row-compact items-center gap-space-2 rounded-sm px-space-2 text-tx-2 type-label tabular-nums transition-[background-color,color] duration-(--duration-fast) ease-out hover:bg-ui data-compacting:text-tx data-critical:not-data-compacting:text-red data-warn:not-data-critical:not-data-compacting:text-orange",
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
