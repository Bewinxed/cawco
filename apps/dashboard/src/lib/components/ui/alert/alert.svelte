<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const alertVariants = tv({
    base: "group/alert relative grid w-full grid-cols-[1fr] gap-0.5 rounded-sm px-3 py-2.5 text-left type-body has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 has-data-[slot=alert-action]:gap-x-2.5 [&>:not(svg,[data-slot=alert-action])]:col-start-[-2] [&>svg:not([class*='size-'])]:size-icon-md [&>svg]:row-span-2 [&>svg]:translate-y-0.5 [&>svg]:text-current",
    variants: {
      variant: {
        default: "bg-bg-2 text-tx",
        destructive: "bg-bg-2 text-red",
        warning: "bg-bg-2 text-orange",
        success: "bg-bg-2 text-green",
        info: "bg-bg-2 text-cyan",
      },
      /** A notice on a card: the raised surface, the control's edge, the
          card's corner and its tile shadow. */
      surface: {
        card: "rounded-lg border border-ui-2 bg-bg shadow-sm",
      },
      /** A one-line notice beside its action (DESIGN.md, Alert: "a compact
          tinted row"): its words centred on the action, not hung from the
          row's top. */
      layout: { row: "items-center" },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  type AlertVariant = VariantProps<typeof alertVariants>["variant"];
  type AlertSurface = VariantProps<typeof alertVariants>["surface"];
  type AlertLayout = VariantProps<typeof alertVariants>["layout"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant = "default",
    surface,
    layout,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    variant?: AlertVariant;
    surface?: AlertSurface;
    layout?: AlertLayout;
  } = $props();
</script>

<div
  class={cn(alertVariants({ variant, surface, layout }), className)}
  data-slot="alert"
  role="alert"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
