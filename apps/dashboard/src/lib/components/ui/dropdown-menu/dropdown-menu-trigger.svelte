<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import {
    type ButtonSize,
    type ButtonVariant,
    buttonVariants,
  } from "#lib/components/ui/button/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    size,
    ...restProps
  }: DropdownMenuPrimitive.TriggerProps & {
    /** A trigger drawn as a kit Button of this variant and size. */
    variant?: ButtonVariant;
    size?: ButtonSize;
  } = $props();
</script>

<DropdownMenuPrimitive.Trigger
  class={cn(
    "touch-hit",
    (variant || size) && buttonVariants({ variant, size }),
    className
  )}
  data-slot="dropdown-menu-trigger"
  bind:ref
  {...restProps}
/>
