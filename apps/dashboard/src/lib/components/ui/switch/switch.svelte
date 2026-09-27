<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    checked = $bindable(false),
    size = "default",
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
    size?: "sm" | "default";
  } = $props();
</script>

<SwitchPrimitive.Root
  class={cn("peer group/switch relative inline-flex shrink-0 items-center", "rounded-[var(--radius-pill)] border border-transparent", "touch-hit outline-none transition-colors", "aria-invalid:border-destructive aria-invalid:ring-[3px]", "aria-invalid:ring-destructive/20", "data-[size=default]:h-[18.4px] data-[size=sm]:h-[14px]", "data-[size=default]:w-[32px] data-[size=sm]:w-[24px]", "data-disabled:cursor-not-allowed data-checked:bg-primary", "data-unchecked:bg-input data-disabled:opacity-50", "dark:data-unchecked:bg-input/80", "dark:aria-invalid:border-destructive/50", "focus-ring dark:aria-invalid:ring-destructive/40", className)}
  data-size={size}
  data-slot="switch"
  bind:checked
  bind:ref
  {...restProps}
>
  <SwitchPrimitive.Thumb
    class="rounded-[var(--radius-pill)] bg-background group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground pointer-events-none block ring-0 transition-transform rtl:data-[state=checked]:translate-x-[calc(-100%)]"
    data-slot="switch-thumb"
  />
</SwitchPrimitive.Root>
