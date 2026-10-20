<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: the rail's section labels on its rows' inline
      axis; and one with an action at its end, which ends where the rows do
      (no end pad of its own) and whose height is a finger's under one. */
  export const sidebarGroupLabelVariants = tv({
    variants: {
      pad: { rail: "px-2.5" },
      end: { action: "pointer-coarse:h-11 pr-0" },
    },
  });

  export type SidebarGroupLabelLooks = VariantProps<
    typeof sidebarGroupLabelVariants
  >;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    children,
    child,
    class: className,
    pad,
    end,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> &
    SidebarGroupLabelLooks & {
      child?: Snippet<[{ props: Record<string, unknown> }]>;
    } = $props();

  const mergedProps = $derived({
    class: cn(
      "focus-inset flex h-space-8 shrink-0 items-center rounded-sm px-3 text-ink-strong/70 text-label [&>svg]:size-icon-md [&>svg]:shrink-0",
      sidebarGroupLabelVariants({ pad, end }),
      className
    ),
    "data-slot": "sidebar-group-label",
    "data-sidebar": "group-label",
    ...restProps,
  });
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <div bind:this={ref} {...mergedProps}>
    {@render children?.()}
  </div>
{/if}
