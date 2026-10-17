<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it: the mono face for what is
      typed exactly (a path, a command, a key), a text size, tight pads for
      a short figure, and how wide it may run. */
  export const inputVariants = tv({
    variants: {
      face: { mono: "font-mono" },
      text: { meta: "text-meta", label: "text-label", title: "text-title" },
      pad: { tight: "px-space-2" },
      measure: {
        shrink: "min-w-0",
        "cap-sm": "max-w-64",
        "cap-md": "max-w-96",
      },
      /** Its share of a row of code cells (`--code-flex`). */
      flex: { code: "flex-(--code-flex)" },
    },
  });

  export type InputLooks = VariantProps<typeof inputVariants>;
</script>

<script lang="ts">
  import type {
    HTMLInputAttributes,
    HTMLInputTypeAttribute,
  } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  type InputType = Exclude<HTMLInputTypeAttribute, "file">;

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type"> &
      InputLooks &
      (
        | { type: "file"; files?: FileList }
        | { type?: InputType; files?: undefined }
      )
  >;

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    class: className,
    face,
    text,
    pad,
    measure,
    flex,
    "data-slot": dataSlot = "input",
    ...restProps
  }: Props = $props();
  const looks = $derived(inputVariants({ face, text, pad, measure, flex }));
</script>

{#if type === "file"}
  <input
    class={cn(
      "rounded-md shadow-xs [transition:var(--transition-control)]",
      "h-9 w-full min-w-0 border border-[var(--border-control)]",
      "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]",
      "text-body file:inline-flex file:h-7",
      "file:border-0 file:bg-transparent file:font-medium",
      "file:text-ink-strong file:text-label",
      "placeholder:text-ink-muted",
      "disabled:pointer-events-none disabled:cursor-not-allowed",
      "disabled:opacity-50 aria-invalid:border-error-9",
      "dark:aria-invalid:border-error-9/50",
      looks,
      className
    )}
    data-slot={dataSlot}
    type="file"
    bind:this={ref}
    bind:files
    bind:value
    {...restProps}
  />
{:else}
  <input
    class={cn(
      "rounded-md shadow-xs [transition:var(--transition-control)]",
      "h-9 w-full min-w-0 border border-[var(--border-control)]",
      "bg-[var(--surface-raised)] px-3 text-[var(--ink-strong)]",
      "text-body file:inline-flex file:h-7",
      "file:border-0 file:bg-transparent file:font-medium",
      "file:text-ink-strong file:text-label",
      "placeholder:text-ink-muted",
      "disabled:pointer-events-none disabled:cursor-not-allowed",
      "disabled:opacity-50 aria-invalid:border-error-9",
      "dark:aria-invalid:border-error-9/50",
      looks,
      className
    )}
    data-slot={dataSlot}
    {type}
    bind:this={ref}
    bind:value
    {...restProps}
  />
{/if}
