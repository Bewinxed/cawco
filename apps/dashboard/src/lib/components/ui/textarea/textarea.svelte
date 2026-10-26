<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face, a text size, a
      tall editor's least height, the page's fill, and a note written
      straight into a composer (no field of its own: the composer's shell is
      the field, DESIGN.md Inputs and fields, Field frame). A phone's 16px
      floor is the base layer's, for every field. */
  const textareaVariants = tv({
    variants: {
      face: { mono: "font-mono" },
      text: {
        label: "text-label",
        "pin-field": "group-data-sheet/pin:text-(length:--field-fs)",
      },
      height: { tall: "min-h-80" },
      /** An editor's field the reader may also stretch by its corner (a
          rule, a hook's command, a sample to test against), on top of
          growing a line at a time. */
      resize: { block: "resize-y" },
      fill: { page: "bg-surface-page" },
      look: {
        note: "max-h-c-textarea-max-h min-h-c-composer-field min-w-0 border-transparent bg-transparent px-0 py-space-2 leading-ui shadow-none placeholder-shown:truncate",
      },
    },
  });

  type TextareaLooks = VariantProps<typeof textareaVariants>;
</script>

<script lang="ts">
  import type { ClassValue, HTMLTextareaAttributes } from "svelte/elements";
  import { autosize } from "#lib/cawco/motion/autosize.svelte.js";
  import FieldArea from "#lib/components/ui/field-area.svelte";
  import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    face,
    text,
    height,
    resize,
    fill,
    look,
    area = true,
    "data-slot": dataSlot = "textarea",
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> &
    TextareaLooks & {
      /**
       * The field's own touch area (DESIGN.md, The 44 Touch Rule): a
       * `<textarea>` draws no `::after`, so the field stands in a box of its
       * own size that carries it, under the field (`hit-under`: the field
       * takes its own presses, its caret and its words' selection), and a
       * press on the area round it focuses the field.
       * Off where a frame round the field is the control (InputGroup).
       */
      area?: boolean;
    } = $props();

  /** A press on the area beside the field: the field's own focus. */
</script>

{#snippet control(placement?: ClassValue | null)}
  <textarea
    class={cn(
      "rounded-md shadow-xs transition-control motion-safe:transition-control-grow",
      "flex min-h-16 w-full resize-none py-2",
      "border border-border-control",
      // Typed in, its edge steps up: the caret is its focus. A note has no
      // edge of its own (the composer's pill is its field).
      look !== "note" && "field-edge",
      "bg-surface-raised px-3 text-ink-strong",
      "text-body placeholder:text-ink-muted",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-error-9",
      "dark:aria-invalid:border-error-9/50",
      textareaVariants({ face, text, height, resize, fill, look }),
      placement
    )}
    data-slot={dataSlot}
    bind:this={ref}
    bind:value
    {...restProps}
    {@attach autosize(() => value)}></textarea>
{/snippet}

{#if area}
  <FieldArea class={className} field={ref} slot="textarea-area">
    {@render control(undefined)}
  </FieldArea>
{:else}
  {@render control(className)}
{/if}
