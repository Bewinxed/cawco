<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Its callers' looks. `box`: `none` for a menu over what it wraps (a
   * row, a pane's head, a tab): the trigger draws no box of its own
   * (`display: contents`), so what it wraps keeps its place in its
   * parent's flex or grid and the right click lands on it.
   */
  export const contextMenuTriggerVariants = tv({
    base: "select-none",
    variants: { box: { none: "contents" } },
  });

  export type ContextMenuTriggerLooks = VariantProps<
    typeof contextMenuTriggerVariants
  >;
</script>

<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    box,
    ...restProps
  }: ContextMenuPrimitive.TriggerProps & ContextMenuTriggerLooks = $props();
</script>

<ContextMenuPrimitive.Trigger
  class={cn(contextMenuTriggerVariants({ box }), className)}
  data-slot="context-menu-trigger"
  bind:ref
  {...restProps}
/>
