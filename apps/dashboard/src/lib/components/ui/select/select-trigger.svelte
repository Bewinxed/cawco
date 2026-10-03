<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { IconUnfold } from "#lib/icons.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = "default",
    press = "scale",
    ...restProps
  }: WithoutChild<SelectPrimitive.TriggerProps> & {
    size?: "sm" | "default";
    /** A trigger stretched wider than a control tints on press instead of
        scaling (app.css, press feedback). */
    press?: "scale" | "tint";
  } = $props();
</script>

<SelectPrimitive.Trigger
  class={cn(
    "touch-hit rounded-md shadow-xs",
    press === "scale"
      ? "pressable [transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)]"
      : "press-tint [transition:var(--transition-control)]",
    "flex w-fit data-[size=default]:h-9 data-[size=sm]:h-[30px]",
    "items-center justify-between gap-1.5 whitespace-nowrap",
    "border border-[var(--border-control)]",
    "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]",
    "text-body disabled:cursor-not-allowed",
    "disabled:opacity-50 aria-invalid:border-destructive",
    "data-placeholder:text-muted-foreground",
    "*:data-[slot=select-value]:line-clamp-1",
    "*:data-[slot=select-value]:flex",
    "*:data-[slot=select-value]:items-center",
    "*:data-[slot=select-value]:gap-1.5",
    "dark:aria-invalid:border-destructive/50",
    "[&_svg:not([class*='size-'])]:size-4",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-size={size}
  data-slot="select-trigger"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconUnfold class="size-4 text-muted-foreground pointer-events-none" />
</SelectPrimitive.Trigger>
