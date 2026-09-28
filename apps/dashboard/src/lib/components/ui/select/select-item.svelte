<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { IconTick } from "$lib/icons";
  import { cn, type WithoutChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    value,
    label,
    children: childrenProp,
    ...restProps
  }: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
  class={cn("kit-item relative flex w-full cursor-default select-none items-center gap-2.5 pr-8 pl-2.5 text-label outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2", className)}
  data-slot="select-item"
  {value}
  bind:ref
  {...restProps}
>
  {#snippet children({ selected, highlighted })}
    <span class="absolute end-2 flex size-4 items-center justify-center">
      {#if selected}
        <IconTick class="cn-select-item-indicator-icon" />
      {/if}
    </span>
    <span class="flex flex-1 gap-2 shrink-0 whitespace-nowrap">
      {#if childrenProp}
        {@render childrenProp({ selected, highlighted })}
      {:else}
        {label || value}
      {/if}
    </span>
  {/snippet}
</SelectPrimitive.Item>
