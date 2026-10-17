<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  export const sidebarMenuSubButtonVariants = tv({
    variants: {
      /** A row under a project that stands on a compact session row's axes
          (`--row-compact-*`); tall (`data-tall`), on the space ladder. */
      row: {
        compact:
          "gap-(--row-compact-gap) pr-(--row-compact-pad-end) pl-(--row-compact-gap)",
        "compact-tall":
          "gap-(--row-compact-gap) pr-(--row-compact-pad-end) pl-(--row-compact-gap) data-tall:gap-space-2 data-tall:pr-space-3 data-tall:pl-space-3",
      },
      tone: { muted: "text-ink-muted" },
    },
  });

  export type SidebarMenuSubButtonLooks = VariantProps<
    typeof sidebarMenuSubButtonVariants
  >;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    children,
    child,
    class: className,
    size = "md",
    isActive = false,
    row,
    tone,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> &
    SidebarMenuSubButtonLooks & {
      child?: Snippet<[{ props: Record<string, unknown> }]>;
      size?: "sm" | "md";
      isActive?: boolean;
    } = $props();

  const mergedProps = $derived({
    class: cn(
      "mark-line focus-inset flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] px-2 text-ink-strong hover:text-ink-strong active:text-ink-strong disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-label data-[size=sm]:text-meta data-active:text-selected-ink group-data-[collapsible=icon]:hidden [&>span:last-child]:min-w-0 [&>span:last-child]:overflow-clip [&>span:last-child]:text-ellipsis [&>span:last-child]:whitespace-nowrap [&>svg]:size-icon-md [&>svg]:shrink-0 [&>svg]:text-ink-strong",
      sidebarMenuSubButtonVariants({ row, tone }),
      className
    ),
    "data-slot": "sidebar-menu-sub-button",
    "data-sidebar": "menu-sub-button",
    /* One selector for every row the rail's hover ghost lands on. */
    "data-rail-row": "",
    "data-size": size,
    "data-active": isActive,
    ...restProps,
  });
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <!-- biome-ignore lint/a11y/useValidAnchor: href comes from restProps, supplied by the consumer of this generic wrapper -->
  <a bind:this={ref} {...mergedProps}> {@render children?.()} </a>
{/if}
