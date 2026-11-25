<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a width of its own (`regular` as the menu's own
      `regular`, so a submenu and the menu holding the same entries stand
      equally wide), or a least width over the kit's. */
  const dropdownMenuSubContentVariants = tv({
    variants: {
      width: { regular: "w-52", wide: "w-72" },
      min: { compact: "min-w-40" },
    },
  });

  type DropdownMenuSubContentLooks = VariantProps<
    typeof dropdownMenuSubContentVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import FloatingBody from "#lib/components/ui/floating-body.svelte";
  import { submenuSurface } from "#lib/components/ui/menu-surface.svelte.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    width,
    min,
    children,
    /* Off: see popover-content.svelte. */
    preventOverflowTextSelection = false,
    ...restProps
  }: Omit<DropdownMenuPrimitive.SubContentStaticProps, "child"> &
    DropdownMenuSubContentLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof DropdownMenuPortal>
      >;
    } = $props();

  const surface = submenuSurface(() => ref);
</script>

<!-- In the top layer's portal, as every kit floating surface is: inside its
     menu it was cut by the menu's scroll box and placed in the menu's
     coordinates. -->
<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.SubContentStatic
    style="--surface-level: {surface.level}"
    {preventOverflowTextSelection}
    class={cn(
      floatingSurface(),
      "relative w-auto min-w-36 origin-(--kit-origin) overflow-y-auto overflow-x-hidden",
      dropdownMenuSubContentVariants({ width, min }),
      className
    )}
    data-slot="dropdown-menu-sub-content"
    bind:ref
    {...restProps}
  >
    {#snippet child(snippet)}
      <FloatingBody {children} mounted {snippet} wrapper={surface.layer} />
    {/snippet}
  </DropdownMenuPrimitive.SubContentStatic>
</DropdownMenuPortal>
