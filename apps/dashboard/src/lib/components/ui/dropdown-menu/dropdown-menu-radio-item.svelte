<script lang="ts" module>
  /** A radio item's dot (DESIGN.md, Ticks and dots: "A radio dot grows from
      0.6 as it fades in. With reduced motion both only fade"), the dropdown's
      and the context menu's. */
  export const radioDot =
    "block size-1.5 rounded-pill bg-current opacity-0 transition-opacity duration-(--dur-control) ease-out data-[on=true]:opacity-100 motion-safe:scale-60 motion-safe:transition-[opacity,scale] motion-safe:data-[on=true]:scale-100";
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children: childrenProp,
    ...restProps
  }: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
  class={cn(
    "kit-item relative flex cursor-default select-none items-center gap-2.5 pr-space-8 pl-2.5 text-label outline-hidden data-[disabled]:pointer-events-none data-inset:pl-9.5 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-slot="dropdown-menu-radio-item"
  bind:ref
  {...restProps}
>
  {#snippet children({ checked })}
    <span
      class="absolute right-2 flex size-icon-md items-center justify-center pointer-events-none"
      data-box
      data-slot="dropdown-menu-radio-item-indicator"
    >
      <span class={radioDot} data-on={checked}></span>
    </span>
    {@render childrenProp?.({ checked })}
  {/snippet}
</DropdownMenuPrimitive.RadioItem>
