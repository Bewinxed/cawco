<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconTick } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
  class={cn(
    menuItemVariants(),
    "group/command-item relative cursor-default select-none type-label outline-hidden data-[disabled=true]:pointer-events-none data-selected:text-tx data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0 data-selected:[&>svg]:text-tx",
    className
  )}
  data-menu-item
  data-slot="command-item"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconTick
    class="ml-auto opacity-0 group-data-[checked=true]/command-item:opacity-100"
  />
</CommandPrimitive.Item>
