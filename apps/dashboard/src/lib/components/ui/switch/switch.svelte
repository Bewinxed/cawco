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
  class={cn("peer group/switch relative inline-flex shrink-0 items-center", "rounded-[var(--radius-pill)] border border-transparent", "kit-switch touch-hit pointer-hit", "aria-invalid:border-destructive","data-[size=default]:h-[18.4px] data-[size=sm]:h-[14px]", "data-[size=default]:w-[32px] data-[size=sm]:w-[24px]", "data-disabled:cursor-not-allowed data-checked:bg-action-solid", "data-unchecked:bg-input data-disabled:opacity-50", "dark:data-unchecked:bg-input/80", "dark:aria-invalid:border-destructive/50", className)}
  data-size={size}
  data-slot="switch"
  bind:checked
  bind:ref
  {...restProps}
>
  <SwitchPrimitive.Thumb
    class="rounded-[var(--radius-pill)] bg-background group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-on-action group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground kit-switch-thumb pointer-events-none block ring-0 rtl:data-[state=checked]:translate-x-[calc(-100%)]"
    data-slot="switch-thumb"
  />
</SwitchPrimitive.Root>
