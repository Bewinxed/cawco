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
      fill: { page: "bg-bg" },
      /** Its line length held to the reading measure (DESIGN.md: running text 60 to 72ch). */
      measure: {
        reading: "max-w-measure",
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
        prose: "min-h-0 px-space-3 py-space-1 control-inline",
        note: "max-h-50 min-h-control-md min-w-0 px-0 py-space-2 leading-lg control-quiet placeholder-shown:truncate",
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
       * own size that carries it, under the field (`hitbox`, whose area stands under its content: the field
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
   * grow-cut): its area, cut at its foot, the field drawing the look and
   * its edge; a note's, its composer's shell, cut at its head.
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
      // Its fill, edge and states are the control surface's (theme.css
      // `control-field`): typed in, its edge steps up, the caret its focus.
      // A note has no edge of its own (the composer's pill is its field).
      // Its area holds its radius, which it takes; without one, its own.
      "control control-field",
      area ? "rounded-inherit" : "rounded-sm",
      "flex min-h-16 w-full resize-none py-2",
      "px-3 text-tx",
      "type-body placeholder:text-tx-2",
      "disabled:cursor-not-allowed",
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
  <FieldArea class={["rounded-sm", className]} field={ref} slot="textarea-area">
    {@render control(undefined)}
  </FieldArea>
{:else}
  {@render control(className)}
{/if}
