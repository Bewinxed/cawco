<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { IconChevronUp } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props();
</script>

<SelectPrimitive.ScrollUpButton
  class={cn("top-0 z-10 flex w-full cursor-default items-center justify-center bg-[var(--surface-raised)] py-1 [&_svg:not([class*='size-'])]:size-4", className)}
  data-slot="select-scroll-up-button"
  bind:ref
  {...restProps}
>
  <IconChevronUp />
</SelectPrimitive.ScrollUpButton>
