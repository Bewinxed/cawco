<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "$lib/utils.js";

  export const toggleVariants = tv({
    base: "group/toggle touch-hit inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-sm font-medium text-[var(--ink-strong)] text-label [transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-[var(--surface-fill)] data-[state=on]:bg-[var(--surface-fill)] motion-safe:active:not-disabled:[transform:scale(var(--press-scale))] [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-[var(--border-control)] bg-transparent",
      },
      size: {
        default:
          "h-9 min-w-9 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 min-w-6 gap-1.5 px-2 text-meta has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] min-w-[30px] px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 min-w-11 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  });

  export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
  export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
  export type ToggleVariants = VariantProps<typeof toggleVariants>;
</script>

<script lang="ts">
  import { Toggle as TogglePrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

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
