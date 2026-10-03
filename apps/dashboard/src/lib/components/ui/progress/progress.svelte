<script lang="ts">
  import { Progress as ProgressPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    max = 100,
    value,
    ...restProps
  }: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
</script>

<ProgressPrimitive.Root
  class={cn(
    "relative flex h-1.5 w-full items-center overflow-x-hidden rounded-[var(--radius-pill)] bg-[var(--surface-recess-deep)]",
    className
  )}
  data-slot="progress"
  {max}
  {value}
  bind:ref
  {...restProps}
>
  <div
    class="size-full flex-1 bg-[var(--brand-solid)] transition-transform duration-[var(--dur-panel)] ease-out"
    data-slot="progress-indicator"
    style="transform: translateX(-{100 - (100 * (value ?? 0)) / (max ?? 1)}%)"
  ></div>
</ProgressPrimitive.Root>
