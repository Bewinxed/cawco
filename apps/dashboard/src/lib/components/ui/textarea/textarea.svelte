<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    "data-slot": dataSlot = "textarea",
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
  class={cn("rounded-md shadow-xs [transition:var(--transition-control)]", "field-sizing-content flex min-h-16 w-full resize-none py-2", "border border-[var(--border-control)]", "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]", "text-body outline-none placeholder:text-muted-foreground", "disabled:cursor-not-allowed disabled:opacity-50", "aria-invalid:border-destructive", "focus-ring dark:aria-invalid:border-destructive-a50", className)}
  data-slot={dataSlot}
  bind:this={ref}
  bind:value
  {...restProps}
></textarea>
