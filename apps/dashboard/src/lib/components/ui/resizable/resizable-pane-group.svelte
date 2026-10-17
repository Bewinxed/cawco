<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a group in a column that may shrink below its content. */
  export const resizablePaneGroupVariants = tv({
    variants: { height: { shrink: "min-h-0" } },
  });

  export type ResizablePaneGroupLooks = VariantProps<
    typeof resizablePaneGroupVariants
  >;
</script>

<script lang="ts">
  import { PaneGroup, type PaneGroupProps } from "paneforge";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    this: paneGroup = $bindable(),
    class: className,
    height,
    ...restProps
  }: PaneGroupProps &
    ResizablePaneGroupLooks & {
      this?: PaneGroup;
    } = $props();
</script>

<PaneGroup
  class={cn(
    "flex h-full w-full data-[direction=vertical]:flex-col",
    resizablePaneGroupVariants({ height }),
    className
  )}
  data-slot="resizable-pane-group"
  bind:this={paneGroup}
  bind:ref
  {...restProps}
/>
