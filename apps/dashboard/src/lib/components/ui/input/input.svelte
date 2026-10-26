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
        meta: { field: "text-meta" },
        label: { field: "text-label" },
        title: { field: "text-title" },
      },
      /** A field for a short figure (a share, minutes, thousands of
          tokens): the number field's width, tight pads, and its figure
          centred in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      field: {
        number: {
          box: "w-c-number-field-w",
          field: "px-space-2 text-center tabular-nums",
        },
      },
      measure: {
        shrink: { box: "min-w-0" },
        "cap-sm": { box: "max-w-64" },
        "cap-md": { box: "max-w-96" },
      },
      /** Its share of a row of code cells (`--code-flex`). */
      flex: { code: { box: "flex-(--code-flex)" } },
    },
  });

  type InputLooks = VariantProps<typeof inputVariants>;
</script>

<script lang="ts">
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from "svelte/elements";
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
         * own size that carries it, under the field (`hit-under`: the field
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
    area = true,
    "data-slot": dataSlot = "input",
    ...restProps
  }: Props = $props();
  const looks = $derived(
    inputVariants({ face, text, field: kind, measure, flex })
  );
  /** The field's own look, the same for a file picker and a text field.
      Typed in, its edge steps up (`field-edge`): the caret is its focus. */
  const own = [
    "field-edge rounded-md shadow-xs transition-control",
    "h-c-input-h w-full min-w-0 border border-border-control",
    "bg-surface-raised px-3 text-ink-strong",
    "text-body file:inline-flex file:h-7",
    "file:border-0 file:bg-transparent file:font-medium",
    "file:text-ink-strong file:text-label",
    "placeholder:text-ink-muted",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "disabled:opacity-50 aria-invalid:border-error-9",
    "dark:aria-invalid:border-error-9/50",
  ];
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
  const fieldClass = $derived(
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
  function focusField(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      ref?.focus();
    }
  }
</script>

{#snippet control()}
  {#if type === "file"}
    <input
      class={fieldClass}
      data-slot={dataSlot}
      type="file"
      bind:this={ref}
      bind:files
      bind:value
      {...restProps}
    />
  {:else}
    <input
      class={fieldClass}
      data-slot={dataSlot}
      {type}
      bind:this={ref}
      bind:value
      {...restProps}
    />
  {/if}
{/snippet}

{#if area}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: the field's touch area round it; the field itself is the control and takes the focus -->
  <!-- biome-ignore lint/a11y/noStaticElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the field's touch area round it; the field itself is the control and takes the focus. -->
  <!-- biome-ignore lint/a11y/useKeyWithClickEvents: a keyboard reaches the field itself; only a finger lands on the area. -->
  <span
    class={cn(
      "touch-hit hit-under inline-flex w-full min-w-0",
      suggests && "relative",
      looks.box(),
      className
    )}
    data-slot="input-area"
    onclick={focusField}
  >
    {@render control()}
    {#if suggests}
      <IconUnfold
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-space-3 size-icon-md -translate-y-1/2 text-ink-muted"
        data-slot="input-suggests"
      />
    {/if}
  </span>
{:else}
  {@render control()}
{/if}
