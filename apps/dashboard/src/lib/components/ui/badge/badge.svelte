<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const badgeVariants = tv({
    base: "group/badge mark-box mark-h-icon-lg [--mark-size:var(--spacing-icon-sm)] inline-flex h-icon-lg w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-xs bg-ui text-tx type-meta font-medium leading-none transition-colors [&>svg]:pointer-events-none",
    variants: {
      variant: {
        default: "",
        /* A badge on a recessed ground (the page's own, behind a card, as
           an offered row stands on it): the raised surface, where the
           recess would melt into that ground. */
        raised: "bg-bg",
        secondary: "bg-ui text-tx-2",
        outline: "",
        ghost: "bg-transparent text-tx-2",
        destructive: "bg-danger-wash text-danger",
        live: "bg-live-wash text-live",
        /* Needs you: the caution wash under its ink, its Status dot before
           its word (the dot drawn before its children) unless a glyph
           leads it. Every status badge is its ink on that ink's wash
           (owner, 2026-11-24: "colored badges with matching text color"). */
        attn: "bg-caution-wash text-caution",
        done: "bg-success-wash text-success",
        fail: "bg-danger-wash text-danger",
        /* A release note's section (Caw's panel's surface brief, Update notice: "New in
           `note-new-*` with stars, Improved in `note-improved-*` with a
           rising graph, Fixed in `note-fixed-*` with a bug; each ink holds
           4.5:1 on its fill in both themes"). */
        "note-new": "bg-success-wash text-success",
        "note-improved": "bg-live-wash text-live",
        "note-fixed": "bg-caution-wash text-caution",
        link: "bg-transparent text-accent underline-offset-4 hover:underline",
        /* A count of what is set in its control's own hue (a filter's
           active count): the brand wash under brand ink. A count, so in
           tabular figures (The Tabular Figure Rule) and at least square. */
        brand:
          "min-w-icon-lg bg-accent-wash px-space-1 text-accent tabular-nums",
        /* A count of what waits on the person (a settings section's
           faults): the attention pair, filled, for a figure with no word to
           carry the Status dot. */
        "attn-count":
          "min-w-icon-lg bg-caution-wash px-space-1 text-caution tabular-nums",
      },
      /* The looks its callers draw over a variant, each as they drew it. */
      /**
       * A cell's chip: at least 24px tall, wider pads; or with room above and
       * below for its words, which wrap and grow it line by line from the
       * start (an update's long status). A tab's count (the work tabs' surface brief, Work tab
       * count): its numeral in the meta role and tabular figures, and a press
       * on it is a press on its tab. In a head that is short of room (the
       * head's inherited `--tight`, a length above 0 while its words are
       * squeezed) the count's pads step down the ladder from `space-2` to
       * `space-1`, giving that room back to the words.
       */
      size: {
        cell: "min-h-6 mark-h-6",
        "cell-tall":
          "h-auto min-h-6 mark-py-space-1 items-start whitespace-normal text-start",
        count:
          "pointer-events-none px-[clamp(var(--spacing-space-1),calc(var(--spacing-space-2)_-_var(--tight,0px)_*_1000),var(--spacing-space-2))] type-meta tabular-nums",
        /** A count standing in its row (a filter's, a section's faults): at least square, its figures in the meta role and tabular widths, centred. */
        tally: "min-w-icon-lg px-space-1 type-meta tabular-nums",
        /**
         * A control's count, the usual notification badge on its glyph's
         * top trailing corner (HIG, Tab bars: "a badge — a red oval
         * containing white text and either a number or an exclamation point
         * — on a tab"; SwiftUI `badge(_:)`: "Badges appear in list rows, tab
         * bars, toolbar items, and menus"): a pill in ink-solid (the house
         * keeps red for status), its figures in the label role at medium
         * weight and tabular widths, as tall as the medium icon and at least
         * as wide. It takes no room in its control: it stands out of flow,
         * a one-figure badge centred on the top edge of the box it stands in
         * (moved by `--count-foot`) over the glyph's trailing edge (the
         * glyph `--count-glyph` wide, centred in that box), so it covers only
         * the glyph's top trailing corner. Its leading edge stays there and
         * a wider count grows away from the glyph, toward the trailing side,
         * as a tab bar's badge does, never back across the glyph. A bar item
         * lifts it by half its glass's inset (`--count-foot`), so a wide
         * count clears a thin glyph's top stroke and its neighbour's. Its box
         * is the nearest positioned one round it. Dressed by
         * what it counts (`data-look`): `attn`, what waits on the person, in
         * the needs-you pair; `held`, what the person holds to send, hollow,
         * as a held row's pill is.
         */
        corner:
          "pointer-events-none absolute top-[calc(var(--count-foot,0%)_-_var(--spacing-icon-md)_/_2)] start-[calc(50%_+_var(--count-glyph)_/_2_-_var(--spacing-icon-md)_/_2)] h-icon-md min-w-icon-md rounded-pill bg-tx px-space-1 type-label text-bg tabular-nums data-[look=attn]:bg-bg-2 data-[look=attn]:text-caution data-[look=held]:border data-[look=held]:border-tx-2 data-[look=held]:bg-bg data-[look=held]:text-tx",
      },
      /** Its figures in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      figures: { tabular: "tabular-nums" },
      /** Its ink, alone or with its edge in the same ink (an outline badge). */
      tone: {
        success: "text-success",
        muted: "text-tx-2",
        subtle: "text-tx-2",
        "success-edge": "border-success text-success",
        "warning-edge": "border-caution text-caution",
        "muted-edge": "border-ui-2 text-tx-2",
      },
      /** Its glyph and words a hairline apart. */
      gap: { tight: "gap-space-1" },
      /** A row's meta tag: the recess with no edge, meta size at body weight, muted ink held. */
      kind: {
        meta: "rounded-xs border-transparent bg-bg-2 px-space-2 py-px font-normal text-tx-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
  /** The looks a caller draws over its variant. */
  type BadgeLooks = Omit<VariantProps<typeof badgeVariants>, "variant">;
</script>

<script lang="ts">
  import type { Component } from "svelte";
  import type { HTMLAnchorAttributes, SVGAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    href,
    as = "span",
    class: className,
    variant = "default",
    size,
    tone,
    gap,
    kind,
    figures,
    icon: Icon,
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> &
    BadgeLooks & {
      variant?: BadgeVariant;
      /** Its element: a span, or the heading it is when it names a section
          (a release note's section, Caw's panel's surface brief, Update notice). A link is an
          `a` whatever this says. */
      as?: "span" | "h3";
      /**
       * A glyph before its words, built as a Button's is: the small icon,
       * a tighter pad on its side than the words' (the glyph's square
       * stands as far from the edge as from the top), the words centred on
       * their capitals. It takes the badge's ink.
       */
      icon?: Component<SVGAttributes<SVGSVGElement>>;
    } = $props();
</script>

<svelte:element
  this={href ? "a" : as}
  class={cn(
    badgeVariants({ variant, size, tone, gap, kind, figures }),
    className
  )}
  data-slot="badge"
  {href}
  bind:this={ref}
  {...restProps}
>
  {#if Icon}
    <Icon aria-hidden="true" data-icon="inline-start" />
  {:else if variant === "attn"}
    <span
      aria-hidden="true"
      class="mark-icon rounded-pill bg-caution [--mark-size:--spacing(1.5)]"
      data-slot="badge-dot"
    ></span>
  {/if}<!-- no space between: a count's words are its children's alone -->{@render children?.()}
</svelte:element>
