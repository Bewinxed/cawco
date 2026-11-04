<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { SHEET_CLOSE } from "#lib/components/ui/drawer/sheet-head.js";
  import { tv } from "#lib/utils.js";

  /**
   * A sheet's Close, its look the kit's. `head`: the sheet's own header's
   * (DESIGN.md, Drawer: a 28px ghost with a 16px glyph, 44px under a
   * finger). `row`: drawn by a sheet whose content names it from its own
   * first row (Sheet Content `titleHidden`), that row's icon button's twin:
   * the nav row's height and its 20px glyph.
   */
  export const sheetCloseVariants = tv({
    base: SHEET_CLOSE,
    variants: {
      size: {
        head: "",
        row: "focus-inset size-c-nav-h border-none [&_svg]:size-space-5",
      },
    },
    defaultVariants: { size: "head" },
  });

  export type SheetCloseSize = VariantProps<typeof sheetCloseVariants>["size"];
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { IconClose } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    size = "head",
    class: className,
    ...restProps
  }: Omit<SheetPrimitive.CloseProps, "children" | "child"> & {
    size?: SheetCloseSize;
  } = $props();
</script>

<SheetPrimitive.Close
  aria-label="Close"
  bind:ref
  class={cn(sheetCloseVariants({ size }), className)}
  data-slot="sheet-close"
  title="Close"
  {...restProps}
>
  <IconClose aria-hidden="true" />
</SheetPrimitive.Close>
