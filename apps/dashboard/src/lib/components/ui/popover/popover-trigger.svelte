<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: how a control drawn as the trigger moves, only
      with motion: the control's colours and its press, or a chip settling
      to a new state over --dur-panel with its press. */
  export const popoverTriggerVariants = tv({
    variants: {
      motion: {
        press: "motion-safe:transition-control-press",
        settle: "motion-safe:transition-chip-settle",
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
    motion,
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
    popoverTriggerVariants({ motion }),
    className
  )}
  data-slot="popover-trigger"
  bind:ref
  {...restProps}
/>
