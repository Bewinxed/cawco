<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a card's pick box, shown while its card is in
      reach (under the pointer, focused, picked, its column picking, or under
      a finger), fading over --dur-control. */
  export const checkboxVariants = tv({
    variants: {
      reveal: {
        "card-pick":
          "dur-control coarse:opacity-100 opacity-0 transition-[opacity] ease-out group-focus-within/card:opacity-100 group-hover/card:opacity-100 group-data-picked/card:opacity-100 group-data-picking/col:opacity-100",
      },
    },
  });

  export type CheckboxLooks = VariantProps<typeof checkboxVariants>;
</script>

<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from "bits-ui";
  import { IconMinus, IconTick } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    class: className,
    reveal,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> &
    CheckboxLooks = $props();
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
    "data-checked:border-action-solid data-checked:bg-action-solid",
    "data-checked:text-on-action dark:bg-input/30",
    "dark:data-checked:bg-action-solid",
    "dark:aria-invalid:border-error-9/50",
    checkboxVariants({ reveal }),
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
      data-grid
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
