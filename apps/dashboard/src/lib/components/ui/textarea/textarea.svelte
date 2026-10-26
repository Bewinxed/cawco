<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face, a text size, a
      tall editor's least height, the page's fill, and a note written
      straight into a composer (no field of its own: the composer's shell is
      the field, DESIGN.md Inputs and fields, Field frame). A phone's 16px
      floor is the base layer's, for every field. */
  export const textareaVariants = tv({
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

  export type TextareaLooks = VariantProps<typeof textareaVariants>;
</script>

<script lang="ts">
  import type { ClassValue, HTMLTextareaAttributes } from "svelte/elements";
  import { autosize } from "#lib/cawco/motion/autosize.svelte.js";
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
       * own size that carries it, and a press on the area focuses the field.
       * Off where a frame round the field is the control (InputGroup).
       */
      area?: boolean;
    } = $props();

  /** A press on the area beside the field: the field's own focus. */
  function focusField(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      ref?.focus();
    }
  }
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
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: the field's touch area round it; the field itself is the control and takes the focus -->
  <!-- biome-ignore lint/a11y/noStaticElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
  <!-- biome-ignore lint/a11y/useKeyWithClickEvents: a keyboard reaches the field itself; only a finger lands on the area. -->
  <span
    class={cn("touch-hit inline-flex w-full min-w-0", className)}
    data-slot="textarea-area"
    onclick={focusField}
  >
    {@render control(undefined)}
  </span>
{:else}
  {@render control(className)}
{/if}
