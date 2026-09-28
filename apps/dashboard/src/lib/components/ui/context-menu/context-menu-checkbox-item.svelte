<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import { IconTick } from "$lib/icons";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    inset,
    children: childrenProp,
    ...restProps
  }: WithoutChildrenOrChild<ContextMenuPrimitive.CheckboxItemProps> & {
    inset?: boolean;
    children?: Snippet;
  } = $props();
</script>

<ContextMenuPrimitive.CheckboxItem
  class={cn("kit-item relative flex cursor-default select-none items-center gap-2 pr-8 pl-2.5 text-label outline-hidden data-disabled:pointer-events-none data-inset:pl-9.5 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
  data-inset={inset}
  data-slot="context-menu-checkbox-item"
  bind:checked
  bind:indeterminate
  bind:ref
  {...restProps}
>
  {#snippet children({ checked })}
    <span class="absolute right-2 pointer-events-none">
      <IconTick class="kit-tick" data-on={checked} />
    </span>
    {@render childrenProp?.()}
  {/snippet}
</ContextMenuPrimitive.CheckboxItem>
