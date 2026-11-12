<script lang="ts" module>
  /** A radio item's dot (DESIGN.md, Ticks and dots: "A radio dot grows from
      0.6 as it fades in. With reduced motion both only fade"), the dropdown's
      and the context menu's. */
  export const radioDot =
    "block size-1.5 rounded-pill bg-current opacity-0 transition-opacity duration-(--duration-control) ease-out data-[on=true]:opacity-100 motion-safe:scale-60 motion-safe:transition-[opacity,scale] motion-safe:data-[on=true]:scale-100";
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children: childrenProp,
    tile = false,
    row,
    ...restProps
  }: WithoutChild<DropdownMenuPrimitive.RadioItemProps> & {
    /**
     * A choice drawn as itself rather than named (a glyph, a swatch): a
     * square of the small control's size, its mark centred, no dot; chosen,
     * it takes the selected wash; under a finger it is the touch square
     * (`c-btn-h-lg`). It names itself for a screen reader by `aria-label`.
     * Several stand in a grid of the caller's.
     */
    tile?: boolean;
    /**
     * A row of a list it chooses from. `artifact` (the artifacts menu: each a
     * glyph, two lines of name and an age), at that list's height; busy
     * (`aria-busy`) while it is being removed. `described` (the design
     * graph's states: a name over what was written of it, on up to two
     * lines): that list's height at least, padded so one choice's words
     * never run into the next's.
     */
    row?: "artifact" | "described";
  } = $props();
</script>

<DropdownMenuPrimitive.RadioItem
  class={cn(
    menuItemVariants(),
    "relative flex cursor-default select-none items-center gap-2.5 pr-space-8 pl-2.5 text-label outline-hidden data-[disabled]:pointer-events-none data-inset:pl-9.5 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    row === "artifact" && "min-h-c-artifact-row-h aria-busy:opacity-50",
    row === "described" && "min-h-c-artifact-row-h py-space-2",
    tile &&
      "size-c-btn-h-sm min-h-c-btn-h-sm justify-center p-0 coarse:size-c-btn-h-lg aria-checked:bg-selected-bg aria-checked:text-selected-ink",
    className
  )}
  data-menu-item
  data-slot="dropdown-menu-radio-item"
  bind:ref
  {...restProps}
>
  {#snippet children({ checked })}
    {#if !tile}
      <span
        class="absolute right-2 flex size-icon-md items-center justify-center pointer-events-none"
        data-box
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <span class={radioDot} data-on={checked}></span>
      </span>
    {/if}
    {@render childrenProp?.({ checked })}
  {/snippet}
</DropdownMenuPrimitive.RadioItem>
