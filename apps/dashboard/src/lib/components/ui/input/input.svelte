<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face for what is
      typed exactly (a path, a command, a key), a text size, a number
      field, and how wide it may run. `box` is what sizes the field in its row (its
      area's, when it has one); `field` is the field's own look. */
  const inputVariants = tv({
    slots: { box: "", field: "" },
    variants: {
      face: { mono: { field: "font-mono" } },
      text: {
        meta: { field: "type-meta" },
        label: { field: "type-label" },
        title: { field: "type-title" },
        code: { field: "type-code" },
      },
      /** A field for a short figure (a share, minutes, thousands of
          tokens): the number field's width, tight pads, and its figure
          centred in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      field: {
        number: {
          box: "w-16",
          field: "px-space-2 text-center tabular-nums",
        },
        /** A figure before its unit, at the field's end (a dial's value). */
        figure: { field: "text-end tabular-nums" },
        /** A colour as written (a dial's value): longer than its field, it
            ends in an ellipsis while the field hasn't the caret. */
        colour: { field: "text-ellipsis" },
      },
      measure: {
        shrink: { box: "min-w-0" },
        "cap-sm": { box: "max-w-64" },
        "cap-md": { box: "max-w-96" },
        /** A key's width in a list of keys and values (a task's own
            fields), its column's. */
        key: { box: "basis-24" },
      },
      /** Its share of a row of code cells (`--code-flex`). */
      flex: { code: { box: "flex-(--code-flex)" } },
      /** A name edited where it stands in a list row (a setup's stage):
          the row's words at rest, with no edge, fill or shadow, and the
          field's edge only while it has the caret (`field-edge-wrap`), as the
          prose textarea's (DESIGN.md, Inputs and fields, Field frame). Its
          hover fill and edge are its own box, never pulled past it by a
          margin into a neighbour or its row's padding (owner's pin,
          onboarding-first-minutes #2); its words stand a row's inset in. */
      look: {
        /** Inside a frame that draws the field (an input group): no
            surface of its own. */
        bare: { box: "min-w-0", field: "bg-transparent" },
        inline: {
          box: "min-w-0",
          field: "control-inline h-control-sm text-ellipsis px-space-3 text-tx",
        },
        /** A field in a list of keys and values (a task's own fields): a
            small button's height and its cell's tighter corner, flat, its
            example in the words' own ink at half strength. */
        cell: {
          box: "rounded-sm",
          field:
            "h-c-btn-h-sm px-space-2 shadow-none placeholder:text-current/50",
        },
        /** A heading's words renamed where they stand (a project's name in
            its page head): the heading's own type, size and ink in a
            hairline box as tall as its line, flat; muted while the rename
            is sent. */
        heading: {
          box: "flex rounded-xs",
          field:
            "block h-auto cursor-text overflow-hidden text-ellipsis px-space-1 text-start font-inherit text-inherit shadow-none read-only:text-ink-muted",
        },
        /** A row's title renamed where it stands (a session in the side
            list): the title's own type and line, in a hairline box that
            keeps the row's height, flat; muted while the rename is sent. */
        "row-title": {
          box: "flex rounded-xs",
          field:
            "block h-auto min-h-space-5 content-center overflow-clip text-ellipsis whitespace-nowrap px-space-1 type-label shadow-none read-only:text-ink-muted",
        },
        /** An address typed exactly (a machine reached over SSH): its words
            a house step in, its error edge whole at night. */
        address: {
          field: "px-space-3 dark:aria-invalid:border-error-9",
        },
      },
      /** A value the person changed from what it was: the edit's ink, as
          the design graph marks a changed timing on itself; `quiet`, a
          row's words muted where the row stands back (a session in
          context but not the one open). */
      tone: {
        edited: { field: "text-selected-ink" },
        quiet: { field: "text-ink-muted" },
      },
      /** Its example (the placeholder) dimmer, under an exact address. */
      hint: { subtle: { field: "placeholder:text-ink-subtle" } },
    },
  });

  type InputLooks = VariantProps<typeof inputVariants>;
</script>

<script lang="ts">
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from "svelte/elements";
  import FieldArea from "#lib/components/ui/field-area.svelte";
  import { IconUnfold } from "#lib/icons.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  type InputType = Exclude<HTMLInputTypeAttribute, "file">;

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type" | "size"> &
      InputLooks &
      (
        | { type: "file"; files?: FileList }
        | { type?: InputType; files?: undefined }
      ) & {
        /**
         * The field's own touch area (DESIGN.md, The 44 Touch Rule): an
         * `<input>` draws no `::after`, so the field stands in a box of its
         * own size that carries it, under the field (`touch-hit`, whose area stands under its content: the field
         * takes its own presses, its caret and its words' selection), and
         * a press on the area round it focuses the field. Off where a frame round the field is the control and
         * carries the area (InputGroup).
         */
        area?: boolean;
      }
  >;

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    class: className,
    face,
    text,
    field: kind,
    measure,
    flex,
    look,
    tone,
    hint,
    area = true,
    "data-slot": dataSlot = "input",
    ...restProps
  }: Props = $props();
  const looks = $derived(
    inputVariants({ face, text, field: kind, measure, flex, look, tone, hint })
  );
  /** The field's own look, the same for a file picker and a text field.
      Typed in, its edge steps up: the caret is its focus. Its area draws
      that edge (`field-edge-wrap`) and holds its radius, which the field
      takes; without one, its frame draws it (InputGroup). */
  const own = $derived([
    area ? "rounded-inherit" : "rounded-md",
    "shadow-xs transition-control",
    "h-c-input-h w-full min-w-0 border border-border-row-outline",
    "bg-surface-raised px-3 text-ink-strong",
    "type-body file:inline-flex file:h-7",
    "file:border-0 file:bg-transparent file:font-medium",
    "file:text-tx file:type-label",
    "placeholder:text-tx-2",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "disabled:opacity-50 aria-invalid:border-error-9",
    "dark:aria-invalid:border-error-9/50",
  ]);
  /**
   * A field with suggestions (a `list`, its datalist) shows the house's
   * sort-vertical glyph at its end, as a select does (DESIGN.md, Inputs and
   * fields, Select trigger), never an engine's own arrow: Blink's
   * `::-webkit-calendar-picker-indicator` and WebKit's `::-webkit-list-button`
   * (WebCore html.css) are left unpainted where they stand (Blink takes an
   * author `opacity` there but not `display`), so a press on them still
   * opens the list; Gecko draws none. The field keeps the glyph's room
   * itself (`pe-space-8`), so typed text stops before it in every engine.
   */
  const suggests = $derived(!!restProps.list);
  /** Its classes: with an area, the caller's placement sizes the area and
      the field fills it; without one, they are the field's. */
  const fieldClasses = $derived(
    area
      ? cn(
          own,
          looks.field(),
          suggests &&
            "pe-space-8 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-list-button]:opacity-0"
        )
      : cn(own, looks.box(), looks.field(), className)
  );

  /** A press on the area beside the field: the field's own focus. */
</script>

{#snippet control()}
  {#if type === "file"}
    <input
      class={fieldClasses}
      data-slot={dataSlot}
      type="file"
      bind:this={ref}
      bind:files
      bind:value
      {...restProps}
    />
  {:else}
    <input
      class={fieldClasses}
      data-slot={dataSlot}
      {type}
      bind:this={ref}
      bind:value
      {...restProps}
    />
  {/if}
{/snippet}

{#if area}
  <FieldArea
    class={[
      "field-edge-wrap rounded-md",
      suggests && "relative",
      looks.box(),
      className,
    ]}
    field={ref}
    slot="input-area"
  >
    {@render control()}
    {#if suggests}
      <IconUnfold
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-space-3 size-icon-md -translate-y-1/2 text-tx-2"
        data-slot="input-suggests"
      />
    {/if}
  </FieldArea>
{:else}
  {@render control()}
{/if}
