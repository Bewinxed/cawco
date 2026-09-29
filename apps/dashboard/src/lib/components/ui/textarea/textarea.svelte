<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";
  import { autosize } from "$lib/whiffle/motion/autosize.svelte";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    "data-slot": dataSlot = "textarea",
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
  class={cn("rounded-md shadow-xs [transition:var(--transition-control)] motion-safe:[transition:var(--transition-control),height_var(--dur-control)_var(--ease-out)]", "flex min-h-16 w-full resize-none py-2", "border border-[var(--border-control)]", "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]", "text-body placeholder:text-muted-foreground", "disabled:cursor-not-allowed disabled:opacity-50", "aria-invalid:border-destructive", "dark:aria-invalid:border-destructive/50", className)}
  data-slot={dataSlot}
  bind:this={ref}
  bind:value
  {...restProps}
  {@attach autosize(() => value)}
></textarea>
