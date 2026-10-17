<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a description at the body size. */
  export const drawerDescriptionVariants = tv({
    variants: { text: { body: "text-body" } },
  });

  export type DrawerDescriptionLooks = VariantProps<
    typeof drawerDescriptionVariants
  >;
</script>

<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    text,
    ...restProps
  }: DrawerPrimitive.DescriptionProps & DrawerDescriptionLooks = $props();
</script>

<DrawerPrimitive.Description
  class={cn(
    "text-ink-muted text-label",
    drawerDescriptionVariants({ text }),
    className
  )}
  data-slot="drawer-description"
  bind:ref
  {...restProps}
/>
