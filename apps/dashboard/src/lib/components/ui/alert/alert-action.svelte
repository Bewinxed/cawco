<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: an action that stands the alert's full height. */
  export const alertActionVariants = tv({
    variants: { place: { "full-height": "inset-y-0" } },
  });

  export type AlertActionLooks = VariantProps<typeof alertActionVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    place,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    AlertActionLooks = $props();
</script>

<div
  class={cn(
    "absolute top-2.5 right-3",
    alertActionVariants({ place }),
    className
  )}
  data-slot="alert-action"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
