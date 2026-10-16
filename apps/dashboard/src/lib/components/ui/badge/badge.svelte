<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const badgeVariants = tv({
    base: "group/badge mark-line inline-flex h-icon-lg w-fit shrink-0 items-center justify-center gap-space-1 overflow-hidden whitespace-nowrap rounded-xs bg-[var(--surface-recess)] px-1.5 text-[var(--ink-strong)] text-label leading-none transition-colors has-data-[icon=inline-end]:pr-space-1 has-data-[icon=inline-start]:pl-space-1 [&>svg]:pointer-events-none [&>svg]:size-icon-sm!",
    variants: {
      variant: {
        default: "",
        secondary: "text-[var(--ink-muted)]",
        outline: "",
        ghost: "bg-transparent text-[var(--ink-muted)]",
        destructive: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
        live: "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]",
        attn: "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]",
        done: "bg-[var(--status-done-bg)] text-[var(--status-done-ink)]",
        fail: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
        link: "bg-transparent text-link-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    href,
    class: className,
    variant = "default",
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> & {
    variant?: BadgeVariant;
  } = $props();
</script>

<svelte:element
  this={href ? "a" : "span"}
  class={cn(badgeVariants({ variant }), className)}
  data-slot="badge"
  {href}
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</svelte:element>
