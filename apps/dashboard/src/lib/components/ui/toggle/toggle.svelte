<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const toggleVariants = tv({
    base: "control control-toggle group/toggle mark-box hitbox pointer-coarse:hitbox:touch-area inline-flex items-center justify-center whitespace-nowrap rounded-sm glass-item:concentric-at text-tx type-label [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default: "control-quiet",
        outline: "control-outline [--hit-edge:1px]",
      },
      size: {
        default: "h-control-md min-w-control-md mark-h-control-md",
        xs: "h-space-6 min-w-space-6 mark-h-space-6 type-meta [--mark-size:var(--spacing-icon-sm)] [&_svg:not([class*='size-'])]:size-icon-sm",
        sm: "h-control-sm min-w-control-sm mark-h-control-sm glass-item:h-row-compact glass-item:min-w-row-compact glass-item:mark-h-row-compact glass-item:[--mark-size:--spacing(4.5)] glass-item:[&_svg:not([class*='size-'])]:size-4.5",
        lg: "h-control-lg min-w-control-lg mark-h-control-lg",
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
