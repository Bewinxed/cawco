<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: how wide it may run, shrinking below its words
      or up to a field's cap. */
  const nativeSelectVariants = tv({
    variants: { measure: { shrink: "min-w-0", "cap-md": "max-w-96" } },
  });

  type NativeSelectLooks = VariantProps<typeof nativeSelectVariants>;
</script>

<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { IconUnfold } from "#lib/icons.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  type NativeSelectProps = Omit<WithElementRef<HTMLSelectAttributes>, "size"> &
    NativeSelectLooks;

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    measure,
    children,
    ...restProps
  }: NativeSelectProps = $props();
</script>

<!-- The field (DESIGN.md, Inputs and fields, Select trigger: the input's
     look with a sort-vertical glyph, never the browser's caret) is drawn by
     its frame (`::before`). A select is a control, not text entry: keyboard
     focus on it draws the house ring on the frame's own box (inset), never
     on the select, so the select itself can be the field's touch area (The 44 Touch Rule): a
     `<select>` draws no `::after`, and only a press on the select opens its
     list. Under a finger it stands 44px tall, its overhang taken back by
     equal negative margins (stopping at the midpoint to a neighbour that
     sets `--hit-gap-y`), so the drawn field and the layout stay as they
     are. Its top stands half a pixel lower than that, as a touch-hit area
     does (app.css, touch-hit): Blink takes a press half a pixel above where
     a box is laid out. A choice longer than the field is cut with an
     ellipsis, never mid-letter at its edge. -->
<div
  class={cn(
    "group/native-select relative isolate w-fit rounded-sm has-[select:disabled]:opacity-50",
    "has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent has-[select:focus-visible]:outline-solid has-[select:focus-visible]:-outline-offset-2",
    "before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:ring before:ring-ui-3 before:bg-bg before:shadow-sm before:transition-control",
    "has-[select[aria-invalid=true]]:before:ring-red dark:has-[select[aria-invalid=true]]:before:ring-red/50",
    nativeSelectVariants({ measure }),
    className
  )}
  data-slot="native-select-wrapper"
>
  <select
    class="h-(--select-h) w-full focus-visible:outline-off min-w-0 overflow-hidden text-ellipsis whitespace-nowrap select-none appearance-none rounded-sm border border-transparent bg-transparent pr-space-8 pl-3 type-body text-tx [--select-h:var(--spacing-control-md)] [--select-reach:max(calc((var(--select-h)-var(--spacing-control-lg))/2),calc(var(--hit-gap-y,var(--spacing-control-lg))/-2))] selection:bg-accent selection:text-on-accent placeholder:text-tx-2 disabled:pointer-events-none disabled:cursor-not-allowed coarse:mt-(--select-reach) coarse:mb-(--select-reach) coarse:h-[calc(var(--select-h)-2*var(--select-reach))]"
    data-slot="native-select"
    bind:this={ref}
    bind:value
    {...restProps}
  >
    {@render children?.()}
  </select>
  <IconUnfold
    aria-hidden="true"
    class="pointer-events-none absolute top-1/2 right-space-4 size-icon-md -translate-y-1/2 select-none text-tx-2"
    data-slot="native-select-icon"
  />
</div>
