<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import { badgeVariants } from "#lib/components/ui/badge/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    badge = false,
    ...restProps
  }: PopoverPrimitive.TriggerProps & {
    /** A trigger drawn as the kit's Badge. */
    badge?: boolean;
  } = $props();
</script>

<PopoverPrimitive.Trigger
  class={cn("touch-hit", badge && badgeVariants(), className)}
  data-slot="popover-trigger"
  bind:ref
  {...restProps}
/>
