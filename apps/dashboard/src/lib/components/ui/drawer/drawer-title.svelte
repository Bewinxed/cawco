<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** The sheet's name in the title role; read out but not drawn
      (`visible: false`) on a sheet whose content names itself on screen, so
      the dialog keeps its name. */
  export const drawerTitleVariants = tv({
    base: "min-w-0 text-ink-strong text-title",
    variants: { visible: { true: "", false: "sr-only" } },
    defaultVariants: { visible: true },
  });

  export type DrawerTitleLooks = VariantProps<typeof drawerTitleVariants>;
</script>

<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    visible,
    ...restProps
  }: DrawerPrimitive.TitleProps & DrawerTitleLooks = $props();
</script>

<DrawerPrimitive.Title
  class={cn(drawerTitleVariants({ visible }), className)}
  data-slot="drawer-title"
  bind:ref
  {...restProps}
/>
