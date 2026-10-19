<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const tabsContentVariants = tv({
    base: "focus-inset flex-1 rounded-lg text-body",
    variants: {
      layout: {
        /** A pane whose own scroller takes its height: a column that can shrink. */
        column: "flex min-h-0 flex-col",
      },
    },
  });

  export type TabsContentLayout = VariantProps<
    typeof tabsContentVariants
  >["layout"];
</script>

<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    layout,
    ...restProps
  }: TabsPrimitive.ContentProps & { layout?: TabsContentLayout } = $props();
</script>

<TabsPrimitive.Content
  class={cn(tabsContentVariants({ layout }), className)}
  data-slot="tabs-content"
  bind:ref
  {...restProps}
/>
