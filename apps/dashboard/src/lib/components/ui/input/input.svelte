<script lang="ts">
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  type InputType = Exclude<HTMLInputTypeAttribute, "file">;

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type"> &
      (
        | { type: "file"; files?: FileList }
        | { type?: InputType; files?: undefined }
      )
  >;

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    class: className,
    "data-slot": dataSlot = "input",
    ...restProps
  }: Props = $props();
</script>

{#if type === "file"}
  <input
    class={cn("rounded-md shadow-xs [transition:var(--transition-control)]", "h-9 w-full min-w-0 border border-[var(--border-control)]", "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]", "text-body outline-none file:inline-flex file:h-7", "file:border-0 file:bg-transparent file:font-medium", "file:text-foreground file:text-label", "placeholder:text-muted-foreground", "disabled:pointer-events-none disabled:cursor-not-allowed", "disabled:opacity-50 aria-invalid:border-destructive", "focus-ring dark:aria-invalid:border-destructive/50", className)}
    data-slot={dataSlot}
    type="file"
    bind:this={ref}
    bind:files
    bind:value
    {...restProps}
  >
{:else}
  <input
    class={cn("rounded-md shadow-xs [transition:var(--transition-control)]", "h-9 w-full min-w-0 border border-[var(--border-control)]", "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]", "text-body outline-none file:inline-flex file:h-7", "file:border-0 file:bg-transparent file:font-medium", "file:text-foreground file:text-label", "placeholder:text-muted-foreground", "disabled:pointer-events-none disabled:cursor-not-allowed", "disabled:opacity-50 aria-invalid:border-destructive", "focus-ring dark:aria-invalid:border-destructive/50", className)}
    data-slot={dataSlot}
    {type}
    bind:this={ref}
    bind:value
    {...restProps}
  >
{/if}
