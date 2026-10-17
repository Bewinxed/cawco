<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  export const selectTriggerVariants = tv({
    variants: {
      /** Sharing a row equally with its siblings, however long its words. */
      measure: { share: "min-w-0 basis-0" },
      tone: { strong: "text-ink-strong" },
      look: {
        /** In a view's bar: it shrinks, and takes the bar's control corner. */
        "in-bar":
          "group-data-bar:min-w-0 group-data-bar:rounded-(--bar-control-radius)",
        /** A plain field: the small corner, the control's edge, field pads. */
        field: "rounded-sm border border-border-control px-space-3 py-space-2",
      },
      /** A filter chip that is on (`data-on`): the selected pair, no edge,
          its ink held over the placeholder's. */
      chosen: {
        selected:
          "data-on:data-placeholder:text-selected-ink data-on:border-transparent data-on:bg-selected-bg data-on:text-selected-ink",
      },
    },
  });

  export type SelectTriggerLooks = VariantProps<typeof selectTriggerVariants>;
</script>

<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { IconChevronDown, IconUnfold } from "#lib/icons.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = "default",
    press = "scale",
    mark = "unfold",
    measure,
    tone,
    look,
    chosen,
    ...restProps
  }: WithoutChild<SelectPrimitive.TriggerProps> &
    SelectTriggerLooks & {
      size?: "sm" | "default";
      /** A trigger stretched wider than a control tints on press instead of
        scaling (app.css, press feedback). */
      press?: "scale" | "tint";
      /** Its trailing mark: the unfold mark, or a chevron that turns over
        --dur-control while the list is open (a list that opens one way). */
      mark?: "unfold" | "chevron";
    } = $props();
</script>

<SelectPrimitive.Trigger
  class={cn(
    "touch-hit rounded-md shadow-xs",
    press === "scale"
      ? "pressable [transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)]"
      : "press-tint [transition:var(--transition-control)]",
    "mark-line flex w-fit data-[size=default]:h-9 data-[size=sm]:h-[30px]",
    "items-center justify-between gap-1.5 whitespace-nowrap",
    "border border-[var(--border-control)] [--hit-edge:1px]",
    "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]",
    "text-body disabled:cursor-not-allowed",
    "disabled:opacity-50 aria-invalid:border-error-9",
    "data-placeholder:text-ink-muted",
    "*:data-[slot=select-value]:line-clamp-1",
    "*:data-[slot=select-value]:flex",
    "*:data-[slot=select-value]:items-center",
    "*:data-[slot=select-value]:gap-1.5",
    "dark:aria-invalid:border-error-9/50",
    "[&_svg:not([class*='size-'])]:size-icon-md",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    selectTriggerVariants({ measure, tone, look, chosen }),
    className
  )}
  data-size={size}
  data-slot="select-trigger"
  bind:ref
  {...restProps}
>
  <!-- Its words in an element, so the mark line centres their x-height on
       the unfold mark's (app.css). -->
  <span class="mark-text">{@render children?.()}</span>
  {#if mark === "chevron"}
    <IconChevronDown
      class="size-icon-md text-ink-muted pointer-events-none motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-(--ease-out) in-data-[state=open]:rotate-180"
      data-mark="chevron"
    />
  {:else}
    <IconUnfold class="size-icon-md text-ink-muted pointer-events-none" />
  {/if}
</SelectPrimitive.Trigger>
