<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const tabsVariants = tv({
    base: "group/tabs flex gap-space-2 data-horizontal:flex-col",
    variants: {
      layout: {
        /** Tabs whose chosen pane scrolls on its own (TabsContent's
            `column`): a column that can shrink below its content. */
        column: "min-h-0",
      },
    },
  });

  type TabsLayout = VariantProps<typeof tabsVariants>["layout"];
</script>

<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(""),
    class: className,
    layout,
    ...restProps
  }: TabsPrimitive.RootProps & { layout?: TabsLayout } = $props();
</script>

<TabsPrimitive.Root
  class={cn(tabsVariants({ layout }), className)}
  data-slot="tabs"
  bind:ref
  bind:value
  {...restProps}
/>
