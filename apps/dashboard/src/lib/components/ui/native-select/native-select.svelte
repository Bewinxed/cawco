<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { IconUnfold } from "$lib/icons";
  import { cn, type WithElementRef } from "$lib/utils.js";

  type NativeSelectProps = Omit<
    WithElementRef<HTMLSelectAttributes>,
    "size"
  > & {
    size?: "sm" | "default";
  };

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size = "default",
    children,
    ...restProps
  }: NativeSelectProps = $props();
</script>

<div
  class={cn(
		"cn-native-select-wrapper group/native-select relative w-fit has-[select:disabled]:opacity-50",
		className
	)}
  data-size={size}
  data-slot="native-select-wrapper"
>
  <select
    class="rounded-md shadow-xs [transition:var(--transition-control)] h-9 data-[size=sm]:h-[30px] w-full min-w-0 appearance-none border border-[var(--border-control)] bg-[var(--surface-raised)] text-[var(--ink-strong)] pr-8 pl-3 text-body select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 outline-none disabled:pointer-events-none disabled:cursor-not-allowed focus-ring"
    data-size={size}
    data-slot="native-select"
    bind:this={ref}
    bind:value
    {...restProps}
  >
    {@render children?.()}
  </select>
  <IconUnfold
    aria-hidden="true"
    class="top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none absolute select-none"
    data-slot="native-select-icon"
  />
</div>
