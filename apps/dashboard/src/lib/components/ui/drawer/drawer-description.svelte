<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a description at the body size; read out but not
      drawn (`visible: false`) on a sheet whose content says it on screen. */
  const drawerDescriptionVariants = tv({
    base: "text-ink-muted text-label",
    variants: {
      text: { body: "text-body" },
      visible: { true: "", false: "sr-only" },
    },
    defaultVariants: { visible: true },
  });

  type DrawerDescriptionLooks = VariantProps<typeof drawerDescriptionVariants>;
</script>

<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    text,
    visible,
    ...restProps
  }: DrawerPrimitive.DescriptionProps & DrawerDescriptionLooks = $props();
</script>

<DrawerPrimitive.Description
  class={cn(drawerDescriptionVariants({ text, visible }), className)}
  data-slot="drawer-description"
  bind:ref
  {...restProps}
/>
