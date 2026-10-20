<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a card's pick box, shown while its card is in
      reach (under the pointer, focused, picked, its column picking, or under
      a finger), fading over --dur-control. Its hiding and showing hold over
      the kit's disabled dimming, as the board's own rules did: the rest's
      `disabled:` and field-disabled `opacity-0` take the kit's dimming's
      place (the same modifiers, so `cn` keeps only these), and each state
      shows in all four of their combinations, the variant sort never
      choosing between them. */
  export const checkboxVariants = tv({
    variants: {
      reveal: {
        "card-pick":
          "coarse:not-disabled:not-group-data-[disabled=true]/field:opacity-100 opacity-0 transition-[opacity] duration-(--dur-control) ease-out coarse:disabled:not-group-data-[disabled=true]/field:opacity-100 disabled:opacity-0 group-focus-within/card:not-disabled:not-group-data-[disabled=true]/field:opacity-100 group-focus-within/card:disabled:not-group-data-[disabled=true]/field:opacity-100 group-hover/card:not-disabled:not-group-data-[disabled=true]/field:opacity-100 group-hover/card:disabled:not-group-data-[disabled=true]/field:opacity-100 group-data-picked/card:not-disabled:group-data-[disabled=true]/field:opacity-100 group-data-picking/col:not-disabled:group-data-[disabled=true]/field:opacity-100 coarse:not-disabled:group-data-[disabled=true]/field:opacity-100 group-data-[disabled=true]/field:opacity-0 group-data-picked/card:not-disabled:not-group-data-[disabled=true]/field:opacity-100 group-data-picking/col:not-disabled:not-group-data-[disabled=true]/field:opacity-100 group-hover/card:not-disabled:group-data-[disabled=true]/field:opacity-100 group-focus-within/card:not-disabled:group-data-[disabled=true]/field:opacity-100 group-data-picked/card:disabled:group-data-[disabled=true]/field:opacity-100 group-data-picking/col:disabled:group-data-[disabled=true]/field:opacity-100 coarse:disabled:group-data-[disabled=true]/field:opacity-100 group-data-picked/card:disabled:not-group-data-[disabled=true]/field:opacity-100 group-data-picking/col:disabled:not-group-data-[disabled=true]/field:opacity-100 group-hover/card:disabled:group-data-[disabled=true]/field:opacity-100 group-focus-within/card:disabled:group-data-[disabled=true]/field:opacity-100",
      },
    },
  });

  export type CheckboxLooks = VariantProps<typeof checkboxVariants>;

  /**
   * A tick that draws itself (DESIGN.md, Ticks and dots: "a checkbox tick
   * draws itself along its stroke over 160ms (120ms in a menu)"; "With
   * reduced motion both only fade"), the kit's one tick: the checkbox's, a
   * menu item's, a select item's and a button's done check. Its stroke is
   * dashed to the tick's length (Tick.svelte): one 20-unit dash, then a gap
   * longer than the path, offset so that no dash end (and no round cap)
   * sits on the path until it draws. On by `data-on="true"`. Its clock:
   * --dur-toggle in a checkbox, --dur-control in a menu, and in a button's
   * slot the --dur-morph its label crosses on.
   */
  export const tickVariants = tv({
    base: "opacity-0 [--tick-dur:var(--dur-toggle)] [transition:opacity_var(--tick-dur)_var(--ease-out)] data-[on=true]:opacity-100 motion-safe:opacity-100 motion-safe:[transition:none] motion-safe:[&_path]:[stroke-dasharray:20_30] motion-safe:[&_path]:[stroke-dashoffset:22] motion-safe:[&_path]:[transition:stroke-dashoffset_var(--tick-dur)_var(--ease-out)] motion-safe:data-[on=true]:[&_path]:[stroke-dashoffset:0]",
    variants: {
      clock: {
        menu: "[--tick-dur:var(--dur-control)]",
        morph: "[--tick-dur:var(--dur-morph)]",
      },
    },
  });
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
    /* Drawn at 16px: its hit area reaches 44px under a finger and 24px
       under a fine pointer (DESIGN.md, The 44 Touch Rule, The 24 Pointer
       Rule). */
    "touch-hit pointer-hit border-input [--hit-edge:1px]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "group-data-[disabled=true]/field:opacity-50",
    "aria-invalid:border-error-9",
    "aria-invalid:aria-checked:border-action-solid",
    "data-checked:border-action-solid data-checked:bg-action-solid",
    "data-checked:text-on-action dark:not-data-checked:bg-input/30",
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
        <IconTick class={tickVariants()} data-on={checked} />
      {/if}
    </div>
  {/snippet}
</CheckboxPrimitive.Root>
