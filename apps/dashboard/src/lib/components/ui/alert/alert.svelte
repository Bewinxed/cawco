<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const alertVariants = tv({
    base: "group/alert relative grid w-full gap-0.5 rounded-md px-3 py-2.5 text-left text-body has-data-[slot=alert-action]:relative has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 has-data-[slot=alert-action]:pr-18 *:[svg:not([class*='size-'])]:size-4 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current",
    variants: {
      variant: {
        default: "bg-[var(--surface-recess)] text-[var(--ink-strong)]",
        destructive: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
        warning: "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]",
        success: "bg-[var(--status-done-bg)] text-[var(--status-done-ink)]",
        info: "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant = "default",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    variant?: AlertVariant;
  } = $props();
</script>

<div
  class={cn(alertVariants({ variant }), className)}
  data-slot="alert"
  role="alert"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
