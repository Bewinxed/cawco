<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
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
  class={cn("group/command-item kit-item relative flex cursor-default select-none items-center gap-2 px-2.5 text-label outline-hidden data-[disabled=true]:pointer-events-none data-selected:text-foreground data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-selected:*:[svg]:text-foreground", className)}
  data-slot="command-item"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconTick
    class="cn-command-item-indicator ml-auto opacity-0 group-has-[[data-slot=command-shortcut]]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"
  />
</CommandPrimitive.Item>
