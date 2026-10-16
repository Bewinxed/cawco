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
    "peer relative flex size-icon-md shrink-0 items-center",
    "justify-center rounded-[var(--radius-xs)] border",
    "touch-hit border-input [--hit-edge:1px]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "group-data-[disabled=true]/field:opacity-50",
    "aria-invalid:border-error-9",
    "aria-invalid:aria-checked:border-action-solid",
    "state-checked:border-action-solid state-checked:bg-action-solid",
    "state-checked:text-on-action dark:bg-input/30",
    "dark:state-checked:bg-action-solid",
    "dark:aria-invalid:border-error-9/50",
    className
  )}
  data-slot="checkbox"
  bind:checked
  bind:indeterminate
  bind:ref
  {...restProps}
>
  {#snippet children({ checked, indeterminate })}
    <div
      class="[&>svg]:size-icon-sm grid place-content-center text-current transition-none"
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
