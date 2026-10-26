<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const dropdownMenuLabelVariants = tv({
    base: "px-3 py-2.5 text-ink-muted text-meta data-inset:pl-space-8",
    variants: {
      /** A line of words standing as the menu's first row, never an item:
          the meta role, wrapping anywhere and evenly (an artifact menu's
          line when the bar has no room for it). */
      kind: { line: "type-meta wrap-anywhere text-pretty" },
    },
  });

  type DropdownMenuLabelLooks = VariantProps<typeof dropdownMenuLabelVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    kind,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    DropdownMenuLabelLooks & {
      inset?: boolean;
    } = $props();
</script>

<div
  class={cn(dropdownMenuLabelVariants({ kind }), className)}
  data-inset={inset}
  data-slot="dropdown-menu-label"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
