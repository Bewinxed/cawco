<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, by role, beside the handle's (`look`): each a
      column of its own that may shrink below its content, moving its share
      (paneforge's `flex-grow`) only as its role says. `split`: a page and
      its side surface, whose share slides while the split opens or closes in
      front of the reader (`data-sliding`, on --dur-panel and --ease-in-out;
      opening, `data-opening`, decelerates on the drawer curve). `grid`: a
      group in the pane grid, clipped to its box, whose share tweens at the
      control tier to a step the keyboard takes on its divider (a drag
      tracks the pointer 1:1). With reduced motion every share is taken at
      once. */
  export const resizablePaneVariants = tv({
    variants: {
      look: {
        split:
          "motion-safe:data-sliding:dur-panel flex min-h-0 min-w-0 motion-safe:data-sliding:data-opening:ease-drawer motion-safe:data-sliding:transition-[flex-grow] motion-safe:data-sliding:ease-in-out",
        grid: "motion-safe:pane-keyed:dur-control flex min-h-0 min-w-0 overflow-hidden motion-safe:pane-keyed:transition-[flex-grow] motion-safe:pane-keyed:ease-out",
      },
    },
  });

  export type ResizablePaneLooks = VariantProps<typeof resizablePaneVariants>;
</script>

<script lang="ts">
  import { Pane, type PaneProps } from "paneforge";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    look,
    ...restProps
  }: PaneProps & ResizablePaneLooks = $props();

  let pane = $state<ReturnType<typeof Pane>>();

  /* paneforge's own handle on the pane, for a caller's `bind:this`. */
  export const collapse = () => pane?.collapse();
  export const expand = () => pane?.expand();
  export const resize = (size: number) => pane?.resize(size);
  export const getSize = () => pane?.getSize() ?? 0;
  export const isCollapsed = () => pane?.isCollapsed() ?? false;
  export const isExpanded = () => pane?.isExpanded() ?? false;
  export const getId = () => pane?.getId() ?? "";
</script>

<Pane
  class={cn(resizablePaneVariants({ look }), className)}
  data-slot="resizable-pane"
  bind:ref
  bind:this={pane}
  {...restProps}
/>
