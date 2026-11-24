<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face, a text size, a
      tall editor's least height, the page's fill, a paragraph edited in
      place (`prose`), and a note written
      straight into a composer (no field of its own: the composer's shell is
      the field, DESIGN.md Inputs and fields, Field frame). A phone's 16px
      floor is the base layer's, for every field. */
  const textareaVariants = tv({
    variants: {
      face: { mono: "font-mono" },
      text: {
        label: "type-label",
        "pin-field": "group-data-sheet/pin:text-(length:--field-fs)",
      },
      height: { tall: "min-h-80" },
      /** An editor's field the reader may also stretch by its corner (a
          rule, a hook's command, a sample to test against), on top of
          growing a line at a time. */
      resize: { block: "resize-y" },
      fill: { page: "bg-surface-page" },
      /** Its line length held to the reading measure (DESIGN.md: running text 60 to 72ch). */
      measure: {
        reading: "max-w-c-measure",
        /** The column's width, its words still at the reading measure
            (design.css `pe-measure`): its box ends where the rows beside
            it end. */
        column: "w-full pe-measure",
      },
      look: {
        /** A paragraph edited where it stands (a setup's description): text
            at rest, its edge only while it has focus. Its hover fill and
            edge are its own box, laid where its container lays it: never
            pulled past it by a margin into a neighbour or the container's
            padding (owner's pin, onboarding-first-minutes #2). Its words
            stand a boxed row's inset in (`c-field-inline-inset`, space-3
            less its edge), on the text column of the rows beside it. */
        prose:
          "min-h-0 border-transparent bg-transparent px-c-field-inline-inset py-space-1 shadow-none hover:bg-surface-hover",
        note: "max-h-c-textarea-max-h min-h-c-composer-field min-w-0 border-transparent bg-transparent px-0 py-space-2 leading-ui shadow-none placeholder-shown:truncate",
      },
    },
  });

  type TextareaLooks = VariantProps<typeof textareaVariants>;
</script>

<script lang="ts">
  import type { ClassValue, HTMLTextareaAttributes } from "svelte/elements";
  import FieldArea from "#lib/components/ui/field-area.svelte";
  import { autosize } from "#lib/platform/motion/autosize.svelte.js";
  import type { GrowTarget } from "#lib/platform/motion/grow-cut.js";
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
    measure,
    area = true,
    shell = null,
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
      /**
       * A note's field (`look="note"`) draws no edge: the composer's shell
       * round it is the field, standing on its foot, so its head is what
       * moves as the note grows a line.
       */
      shell?: HTMLElement | null;
    } = $props();

  /**
   * What each line the field grows or gives up is drawn on (motion/
   * grow-cut): its area, which carries its focus edge, cut at its foot,
   * the field drawing the look; a note's, its composer's shell, cut at its
   * head.
   */
  function grows(): GrowTarget | null {
    if (!ref) {
      return null;
    }
    if (look === "note") {
      // The shell's fill is a material's glass: cut flush.
      return shell
        ? { box: shell, look: shell, side: "head", flush: true }
        : null;
    }
    // Without its area, a frame round it is the control and draws the
    // edge (InputGroup): the frame's site draws what the frame does.
    const box = area ? ref.parentElement : null;
    return box ? { box, look: ref, side: "foot" } : null;
  }
</script>

{#snippet control(placement?: ClassValue | null)}
  <textarea
    class={cn(
      // Its area holds its radius, which it takes; without one, its own.
      area ? "rounded-inherit" : "rounded-md",
      "shadow-xs transition-control",
      "flex min-h-16 w-full resize-none py-2",
      "border border-border-row-outline",
      "bg-surface-raised px-3 text-ink-strong",
      "type-body placeholder:text-ink-muted",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-error-9",
      "dark:aria-invalid:border-error-9/50",
      textareaVariants({ face, text, height, resize, fill, look, measure }),
      placement
    )}
    data-slot={dataSlot}
    bind:this={ref}
    bind:value
    {...restProps}
    {@attach autosize(() => value, { cut: grows })}></textarea>
{/snippet}

{#if area}
  <!-- Typed in, its edge steps up: the caret is its focus, and the area
       draws the edge round it (`field-edge-wrap`). A note has no edge of its
       own (the composer's pill is its field). -->
  <FieldArea
    class={[look !== "note" && "field-edge-wrap", "rounded-md", className]}
    field={ref}
    slot="textarea-area"
  >
    {@render control(undefined)}
  </FieldArea>
{:else}
  {@render control(className)}
{/if}
