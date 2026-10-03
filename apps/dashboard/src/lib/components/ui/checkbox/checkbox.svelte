<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from "bits-ui";
  import { IconMinus, IconTick } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  class={cn(
    "peer relative flex size-4 shrink-0 items-center",
    "justify-center rounded-[var(--radius-xs)] border",
    "touch-hit border-input",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "group-has-disabled/field:opacity-50",
    "aria-invalid:border-destructive",
    "aria-invalid:aria-checked:border-action-solid",
    "data-checked:border-action-solid data-checked:bg-action-solid",
    "data-checked:text-on-action dark:bg-input/30",
    "dark:data-checked:bg-action-solid",
    "dark:aria-invalid:border-destructive/50",
    className
  )}
  data-slot="checkbox"
  bind:checked
  bind:indeterminate
  bind:ref
  {...restProps}
>
  {#snippet children({
    checked,
    indeterminate,
  })}
    <div
      class="[&>svg]:size-3 grid place-content-center text-current transition-none"
      data-slot="checkbox-indicator"
    >
      {#if indeterminate}
        <IconMinus />
      {:else}
        <IconTick class="kit-tick" data-on={checked} />
      {/if}
    </div>
  {/snippet}
</CheckboxPrimitive.Root>
