<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: how wide it may run, shrinking below its words
      or up to a field's cap. */
  export const nativeSelectVariants = tv({
    variants: { measure: { shrink: "min-w-0", "cap-md": "max-w-96" } },
  });

  export type NativeSelectLooks = VariantProps<typeof nativeSelectVariants>;
</script>

<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { IconUnfold } from "#lib/icons.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  type NativeSelectProps = Omit<WithElementRef<HTMLSelectAttributes>, "size"> &
    NativeSelectLooks & {
      size?: "sm" | "default";
    };

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size = "default",
    measure,
    children,
    ...restProps
  }: NativeSelectProps = $props();
</script>

<div
  class={cn(
    "group/native-select relative w-fit has-[select:disabled]:opacity-50",
    nativeSelectVariants({ measure }),
    className
  )}
  data-size={size}
  data-slot="native-select-wrapper"
>
  <select
    class="rounded-md shadow-xs [transition:var(--transition-control)] h-9 data-[size=sm]:h-[30px] w-full min-w-0 appearance-none border border-[var(--border-control)] bg-[var(--surface-raised)] text-[var(--ink-strong)] pr-space-8 pl-3 text-body select-none selection:bg-action-solid selection:text-on-action placeholder:text-ink-muted aria-invalid:border-error-9 dark:aria-invalid:border-error-9/50 disabled:pointer-events-none disabled:cursor-not-allowed"
    data-size={size}
    data-slot="native-select"
    bind:this={ref}
    bind:value
    {...restProps}
  >
    {@render children?.()}
  </select>
  <IconUnfold
    aria-hidden="true"
    class="top-1/2 right-space-4 size-icon-md -translate-y-1/2 text-ink-muted pointer-events-none absolute select-none"
    data-slot="native-select-icon"
  />
</div>
