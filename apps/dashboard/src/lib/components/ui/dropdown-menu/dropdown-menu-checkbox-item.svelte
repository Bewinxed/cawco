<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import { IconMinus, IconTick } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    children: childrenProp,
    ...restProps
  }: WithoutChildrenOrChild<DropdownMenuPrimitive.CheckboxItemProps> & {
    children?: Snippet;
  } = $props();
</script>

<DropdownMenuPrimitive.CheckboxItem
  class={cn("kit-item relative flex cursor-default select-none items-center gap-2.5 pr-8 pl-2.5 text-label outline-hidden data-[disabled]:pointer-events-none data-inset:pl-9.5 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
  data-slot="dropdown-menu-checkbox-item"
  bind:checked
  bind:indeterminate
  bind:ref
  {...restProps}
>
  {#snippet children({ checked, indeterminate })}
    <span
      class="absolute right-2 flex items-center justify-center pointer-events-none"
      data-slot="dropdown-menu-checkbox-item-indicator"
    >
      {#if indeterminate}
        <IconMinus />
      {:else}
        <IconTick class="kit-tick" data-on={checked} />
      {/if}
    </span>
    {@render childrenProp?.()}
  {/snippet}
</DropdownMenuPrimitive.CheckboxItem>
