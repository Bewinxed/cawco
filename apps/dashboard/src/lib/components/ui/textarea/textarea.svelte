<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face, a text size, a
      tall editor's least height, the page's fill, and a note written
      straight into a composer (no field of its own). */
  export const textareaVariants = tv({
    variants: {
      face: { mono: "font-mono" },
      text: {
        label: "text-label",
        "pin-field": "group-data-sheet/pin:text-(length:--field-fs)",
      },
      height: { tall: "min-h-80" },
      fill: { page: "bg-surface-page" },
      look: {
        note: "coarse:text-(length:--note-fs) max-phone:text-(length:--note-fs) min-w-0 border-transparent bg-transparent px-0 py-space-2 leading-(--note-leading) shadow-none placeholder-shown:truncate",
      },
    },
  });

  export type TextareaLooks = VariantProps<typeof textareaVariants>;
</script>

<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { autosize } from "#lib/cawco/motion/autosize.svelte.js";
  import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    face,
    text,
    height,
    fill,
    look,
    "data-slot": dataSlot = "textarea",
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> &
    TextareaLooks = $props();
</script>

<textarea
  class={cn(
    "rounded-md shadow-xs [transition:var(--transition-control)] motion-safe:[transition:var(--transition-control),height_var(--dur-control)_var(--ease-out)]",
    "flex min-h-16 w-full resize-none py-2",
    "border border-[var(--border-control)]",
    "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]",
    "text-body placeholder:text-ink-muted",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-invalid:border-error-9",
    "dark:aria-invalid:border-error-9/50",
    textareaVariants({ face, text, height, fill, look }),
    className
  )}
  data-slot={dataSlot}
  bind:this={ref}
  bind:value
  {...restProps}
  {@attach autosize(() => value)}></textarea>
