<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";

  /**
   * vaul's own keyboard handling is off for every sheet: it writes a height
   * and a bottom on the sheet without reading where the visual viewport
   * starts, which iOS Safari moves, so a sheet ends up half its size with its
   * top above the screen (emilkowalski/vaul#619). `drawer-content` places a
   * sheet in the visible viewport instead.
   */
  let {
    shouldScaleBackground = true,
    repositionInputs = false,
    open = $bindable(false),
    activeSnapPoint = $bindable(null),
    ...restProps
  }: DrawerPrimitive.RootProps = $props();
</script>

<DrawerPrimitive.Root
  {repositionInputs}
  {shouldScaleBackground}
  bind:activeSnapPoint
  bind:open
  {...restProps}
/>
