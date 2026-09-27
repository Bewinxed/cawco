<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "$lib/utils.js";

  export const sidebarMenuButtonVariants = tv({
    base: "peer/menu-button group/menu-button focus-ring flex w-full items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] px-3 py-2 text-left text-label outline-hidden ring-sidebar-ring transition-[width,height,padding,color,background-color,transform] duration-[160ms] ease-[var(--ease-out)] hover:text-sidebar-accent-foreground active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:font-medium data-active:text-sidebar-accent-foreground data-open:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! active:[transform:scale(var(--press-scale))] [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
    variants: {
      variant: {
        default: "hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-[var(--c-nav-h)] text-label",
        sm: "h-8 text-meta",
        lg: "h-14 px-3 text-label group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  export type SidebarMenuButtonVariant = VariantProps<
    typeof sidebarMenuButtonVariants
  >["variant"];
  export type SidebarMenuButtonSize = VariantProps<
    typeof sidebarMenuButtonVariants
  >["size"];
</script>

<script lang="ts">
  import { mergeProps } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    cn,
    type WithElementRef,
    type WithoutChildrenOrChild,
  } from "$lib/utils.js";
  import { useSidebar } from "./context.svelte.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    child,
    variant = "default",
    size = "default",
    isActive = false,
    tooltipContent,
    tooltipContentProps,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
    isActive?: boolean;
    variant?: SidebarMenuButtonVariant;
    size?: SidebarMenuButtonSize;
    tooltipContent?: Snippet | string;
    tooltipContentProps?: WithoutChildrenOrChild<
      ComponentProps<typeof Tooltip.Content>
    >;
    child?: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  const sidebar = useSidebar();

  const buttonProps = $derived({
    class: cn(sidebarMenuButtonVariants({ variant, size }), className),
    "data-slot": "sidebar-menu-button",
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-active": isActive,
    ...restProps,
  });
</script>

{#snippet Button({ props }: { props?: Record<string, unknown> })}
  {@const mergedProps = mergeProps(buttonProps, props)}
  {#if child}
    {@render child({ props: mergedProps })}
  {:else}
    <button type="button" bind:this={ref} {...mergedProps}>
      {@render children?.()}
    </button>
  {/if}
{/snippet}

{#if !tooltipContent}
  {@render Button({})}
{:else}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        {@render Button({ props })}
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content
      align="center"
      hidden={sidebar.state !== "collapsed" || sidebar.isMobile}
      side="right"
      {...tooltipContentProps}
    >
      {#if typeof tooltipContent === "string"}
        {tooltipContent}
      {:else if tooltipContent}
        {@render tooltipContent()}
      {/if}
    </Tooltip.Content>
  </Tooltip.Root>
{/if}
