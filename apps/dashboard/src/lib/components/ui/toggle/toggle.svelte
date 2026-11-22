<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const toggleVariants = tv({
    base: "group/toggle mark-line touch-hit inline-flex items-center justify-center gap-space-1 whitespace-nowrap rounded-sm glass-item:concentric-at text-ink-strong type-label transition-control-press not-aria-pressed:hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-surface-pressed motion-safe:active:not-disabled:not-glass-item:[transform:scale(var(--press-scale))] glass-item:press-tint [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-border-control bg-transparent [--hit-edge:1px]",
      },
      size: {
        default:
          "h-control-md min-w-control-md px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-control-xs min-w-control-xs gap-1.5 px-2 type-meta has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-icon-sm",
        sm: "h-control-sm min-w-control-sm glass-item:h-row-compact glass-item:min-w-row-compact px-2.5 glass-item:px-space-1 glass-item:[&_svg:not([class*='size-'])]:size-4.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-control-lg min-w-control-lg px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
  type ToggleSize = VariantProps<typeof toggleVariants>["size"];
</script>

<script lang="ts">
  import { Toggle as TogglePrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    pressed = $bindable(false),
    class: className,
    size = "default",
    variant = "default",
    ...restProps
  }: TogglePrimitive.RootProps & {
    variant?: ToggleVariant;
    size?: ToggleSize;
  } = $props();
</script>

<TogglePrimitive.Root
  class={cn(toggleVariants({ variant, size }), className)}
  data-slot="toggle"
  bind:pressed
  bind:ref
  {...restProps}
/>
