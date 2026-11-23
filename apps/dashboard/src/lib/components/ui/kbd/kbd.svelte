<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const kbdVariants = tv({
    base: "pointer-events-none inline-flex h-icon-lg w-fit min-w-5 select-none items-center justify-center gap-space-1 rounded-xs bg-bg-2 px-space-1 text-tx-2 type-meta [&_svg:not([class*='size-'])]:size-icon-sm",
    variants: {
      /**
       * A key named in a hint (the default): in a tooltip it takes the
       * tooltip's own ink; in a primary button (ui/button `default`, its
       * `data-variant`) the button's `on-action` ink straight on the coral,
       * the measured fill (DESIGN.md, The White On Coral Rule: white on that
       * ink at 20% over the coral read 3.33:1), the key drawn by an edge of
       * that ink at 20% inside it, read off its button as the keycap reads
       * its option, so a button that turns primary turns its keys with it.
       *
       * An option chip's keycap digit (DESIGN.md, Option chip: "option
       * chips (30px, 8px radius, keycap digits)"): the code face at the meta
       * size in strong ink (Typography, Code: "code, commands, paths, tool
       * names, keycaps"), on the spacing ladder's 18px; filled vermillion with
       * a white digit when its option is picked (Colors, Chosen option:
       * `action-solid`, `chip-chosen-ink`), read off the option it stands
       * in (`group/option`: ui/chip's `option`, every ui/option-group item):
       * checked, pressed or a record of the pick (`data-chosen`). The fill
       * turns over --duration-fast where motion is welcome. Under a finger
       * an option that names its key with `reach="keyboard"` wears none
       * (the decision host's options, as its Send).
       */
      look: {
        key: "in-data-[slot=tooltip-content]:bg-on-accent/20 in-data-[slot=tooltip-content]:text-on-accent group-data-[variant=default]/button:bg-transparent group-data-[variant=default]/button:text-on-accent group-data-[variant=default]/button:inset-ring group-data-[variant=default]/button:inset-ring-on-accent/20 dark:in-data-[slot=tooltip-content]:bg-bg/10",
        keycap:
          "inline-grid h-space-4 min-w-space-4 flex-none place-items-center font-mono text-tx leading-none group-aria-checked/option:bg-accent group-aria-checked/option:text-on-accent group-aria-pressed/option:bg-accent group-aria-pressed/option:text-on-accent group-data-chosen/option:bg-accent group-data-chosen/option:text-on-accent motion-safe:[transition:background-color_var(--duration-fast)_var(--ease-out),color_var(--duration-fast)_var(--ease-out)]",
      },
      /** Its figures in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      figures: { tabular: "tabular-nums" },
      /** A key hint, drawn only where there is a keyboard to press it: a
          touch screen (a coarse pointer) has none. */
      reach: { keyboard: "coarse:hidden" },
    },
    defaultVariants: { look: "key" },
  });

  type KbdLooks = VariantProps<typeof kbdVariants>;
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
