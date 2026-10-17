<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a body of sections a step and a half apart. */
  export const cardContentVariants = tv({
    variants: { gap: { section: "gap-space-4" } },
  });

  export type CardContentLooks = VariantProps<typeof cardContentVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    gap,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    CardContentLooks = $props();
</script>

<div
  class={cn("px-(--card-spacing)", cardContentVariants({ gap }), className)}
  data-slot="card-content"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
