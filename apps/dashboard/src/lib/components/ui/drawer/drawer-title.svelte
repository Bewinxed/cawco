<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DrawerPrimitive.TitleProps = $props();
</script>

<DrawerPrimitive.Title
  class={cn("min-w-0 text-[var(--ink-strong)] text-title", className)}
  data-slot="drawer-title"
  bind:ref
  {...restProps}
/>
