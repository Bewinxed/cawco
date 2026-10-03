<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { IconChevronDown } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps> = $props();
</script>

<SelectPrimitive.ScrollDownButton
  class={cn(
    "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-[var(--surface-raised)] py-1 [&_svg:not([class*='size-'])]:size-4",
    className
  )}
  data-slot="select-scroll-down-button"
  bind:ref
  {...restProps}
>
  <IconChevronDown />
</SelectPrimitive.ScrollDownButton>
