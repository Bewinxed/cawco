<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** A sheet's head; read out but not drawn (`visible: false`) on a sheet
      whose content names itself on screen, so the dialog keeps its name. */
  export const sheetHeaderVariants = tv({
    base: "flex flex-col gap-1.5 p-6",
    variants: { visible: { true: "", false: "sr-only" } },
    defaultVariants: { visible: true },
  });

  export type SheetHeaderLooks = VariantProps<typeof sheetHeaderVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    visible,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    SheetHeaderLooks = $props();
</script>

<div
  class={cn(sheetHeaderVariants({ visible }), className)}
  data-slot="sheet-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
