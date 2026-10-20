<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const kbdVariants = tv({
    base: "pointer-events-none inline-flex h-icon-lg w-fit min-w-5 select-none items-center justify-center gap-space-1 rounded-xs bg-surface-recess px-space-1 font-body text-ink-muted text-meta [&_svg:not([class*='size-'])]:size-icon-sm",
    variants: {
      /**
       * A key named in a hint (the default): in a tooltip it takes the
       * tooltip's own ink.
       *
       * An option chip's keycap digit (DESIGN.md, Permission gate: "option
       * chips (30px, 8px radius, keycap digits)"): the code face at the meta
       * size in strong ink (Typography, Code: "code, commands, paths, tool
       * names, keycaps"), on the spacing ladder's 18px; filled vermillion with
       * a white digit when its option is picked (Colors, Chosen option:
       * `chip-chosen-bg`, `chip-chosen-ink`), read off the option it stands
       * in (`group/option`: ui/chip's `option`, every ui/option-group item):
       * checked, pressed or a record of the pick (`data-chosen`). The fill
       * turns over --dur-control where motion is welcome. It shows under
       * every pointer: a finger's option still wears its key.
       */
      look: {
        key: "in-data-[slot=tooltip-content]:bg-on-brand/20 in-data-[slot=tooltip-content]:text-on-brand dark:in-data-[slot=tooltip-content]:bg-surface-page/10",
        keycap:
          "inline-grid h-space-5 min-w-space-5 flex-none place-items-center font-mono text-ink-strong leading-none group-aria-checked/option:bg-chip-chosen-bg group-aria-checked/option:text-chip-chosen-ink group-aria-pressed/option:bg-chip-chosen-bg group-aria-pressed/option:text-chip-chosen-ink group-data-chosen/option:bg-chip-chosen-bg group-data-chosen/option:text-chip-chosen-ink motion-safe:[transition:background-color_var(--dur-control)_var(--ease-out),color_var(--dur-control)_var(--ease-out)]",
      },
      /** Its figures in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      figures: { tabular: "tabular-nums" },
      /** A key hint, drawn only where there is a keyboard to press it: a
          touch screen (a coarse pointer) has none. */
      reach: { keyboard: "coarse:hidden" },
    },
    defaultVariants: { look: "key" },
  });

  export type KbdLooks = VariantProps<typeof kbdVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    look,
    figures,
    reach,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & KbdLooks = $props();
</script>

<kbd
  class={cn(kbdVariants({ look, figures, reach }), className)}
  data-slot="kbd"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</kbd>
