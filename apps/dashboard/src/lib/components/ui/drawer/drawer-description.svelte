<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DrawerPrimitive.DescriptionProps = $props();
</script>

<DrawerPrimitive.Description
  class={cn("text-label text-muted-foreground", className)}
  data-slot="drawer-description"
  bind:ref
  {...restProps}
/>
