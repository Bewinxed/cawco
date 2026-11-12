<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: the rail's section labels on its rows' inline
      axis; one with an action at its end, which ends where the rows do
      (no end pad of its own) and whose height is a finger's under one; and
      a section's head (Recent, Projects): a straight hairline seam (no
      corner rounding to bend its ends) and room above it, its name in
      strong ink. */
  const sidebarGroupLabelVariants = tv({
    variants: {
      pad: { rail: "px-2.5" },
      end: { action: "pointer-coarse:h-11 pr-0" },
      seam: {
        section:
          "mt-space-2 h-auto min-h-space-8 rounded-none border-t border-t-border-hairline pt-space-2 text-ink-strong",
      },
    },
  });

  type SidebarGroupLabelLooks = VariantProps<typeof sidebarGroupLabelVariants>;
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
    seam,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> &
    SidebarGroupLabelLooks & {
      child?: Snippet<[{ props: Record<string, unknown> }]>;
    } = $props();

  const mergedProps = $derived({
    class: cn(
      "focus-inset flex h-space-8 shrink-0 items-center rounded-sm px-3 text-ink-strong/70 type-label [&>svg]:size-icon-md [&>svg]:shrink-0",
      sidebarGroupLabelVariants({ pad, end, seam }),
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
