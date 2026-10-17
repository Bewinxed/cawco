<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a list of things one of which is current
      (`aria-current`, in the strong ink, over a destructive item's ink as
      the list's own rule was) and any of which may be busy (`aria-busy`,
      at half). */
  export const dropdownMenuItemVariants = tv({
    variants: {
      marks: {
        "current-busy":
          "aria-busy:opacity-50 aria-current:text-ink-strong aria-current:data-[variant=destructive]:text-ink-strong aria-current:data-[variant=destructive]:focus:text-ink-strong",
      },
    },
  });

  export type DropdownMenuItemLooks = VariantProps<
    typeof dropdownMenuItemVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    variant = "default",
    marks,
    ...restProps
  }: DropdownMenuPrimitive.ItemProps &
    DropdownMenuItemLooks & {
      inset?: boolean;
      variant?: "default" | "destructive";
    } = $props();
</script>

<DropdownMenuPrimitive.Item
  class={cn(
    "kit-item group/dropdown-menu-item relative flex",
    "cursor-default select-none items-center gap-2.5 text-label",
    "outline-hidden data-disabled:pointer-events-none",
    "data-inset:pl-space-8",
    "data-[variant=destructive]:text-error-9",
    "data-disabled:opacity-50",
    "data-[variant=destructive]:focus:text-error-9",
    "[&_svg:not([class*='size-'])]:size-icon-md",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "px-2.5 data-[variant=destructive]:*:[svg]:text-error-9",
    dropdownMenuItemVariants({ marks }),
    className
  )}
  data-inset={inset}
  data-slot="dropdown-menu-item"
  data-variant={variant}
  bind:ref
  {...restProps}
/>
