<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from "bits-ui";
  import { IconMinus, IconTick } from "$lib/icons";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  class={cn("peer relative flex size-4 shrink-0 items-center", "justify-center rounded-[var(--radius-xs)] border", "touch-hit border-input outline-none transition-shadow", "disabled:cursor-not-allowed disabled:opacity-50", "group-has-disabled/field:opacity-50", "aria-invalid:border-destructive aria-invalid:ring-[3px]", "aria-invalid:ring-destructive-a20", "aria-invalid:aria-checked:border-primary", "data-checked:border-primary data-checked:bg-primary", "data-checked:text-primary-foreground dark:bg-input-a30", "dark:data-checked:bg-primary", "dark:aria-invalid:border-destructive-a50", "focus-ring dark:aria-invalid:ring-destructive-a40", className)}
  data-slot="checkbox"
  bind:checked
  bind:indeterminate
  bind:ref
  {...restProps}
>
  {#snippet children({ checked, indeterminate })}
    <div
      class="[&>svg]:size-3.5 grid place-content-center text-current transition-none"
      data-slot="checkbox-indicator"
    >
      {#if checked}
        <IconTick />
      {:else if indeterminate}
        <IconMinus />
      {/if}
    </div>
  {/snippet}
</CheckboxPrimitive.Root>
