<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: its glyph and words a menu item's gap apart. */
  export const contextMenuSubTriggerVariants = tv({
    variants: { gap: { item: "gap-2.5" } },
  });

  export type ContextMenuSubTriggerLooks = VariantProps<
    typeof contextMenuSubTriggerVariants
  >;
</script>

<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { IconChevronRight } from "#lib/icons.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    gap,
    children,
    ...restProps
  }: WithoutChild<ContextMenuPrimitive.SubTriggerProps> &
    ContextMenuSubTriggerLooks & {
      inset?: boolean;
    } = $props();
</script>

<ContextMenuPrimitive.SubTrigger
  class={cn(
    "kit-item flex cursor-default select-none items-center px-2.5 text-label outline-hidden data-open:bg-[var(--surface-hover)] data-inset:pl-9.5 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    contextMenuSubTriggerVariants({ gap }),
    className
  )}
  data-inset={inset}
  data-slot="context-menu-sub-trigger"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconChevronRight class="ml-auto" />
</ContextMenuPrimitive.SubTrigger>
