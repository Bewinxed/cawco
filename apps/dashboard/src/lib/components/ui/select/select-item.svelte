<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { tickVariants } from "#lib/components/ui/checkbox/checkbox.svelte";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconTick } from "#lib/icons.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

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
  class={cn(
    menuItemVariants(),
    "relative w-full cursor-default select-none whitespace-nowrap pe-space-8 type-label outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-menu-item
  data-slot="select-item"
  {value}
  bind:ref
  {...restProps}
>
  {#snippet children({ selected, highlighted })}
    <span
      class="absolute end-2 flex size-icon-md items-center justify-center"
      data-box
    >
      <IconTick class={tickVariants({ clock: "menu" })} data-on={selected} />
    </span>
    <!-- The item's own words and marks, straight on its mark box. -->
    {#if childrenProp}
      {@render childrenProp({ selected, highlighted })}
    {:else}
      <span>{label || value}</span>
    {/if}
  {/snippet}
</SelectPrimitive.Item>
