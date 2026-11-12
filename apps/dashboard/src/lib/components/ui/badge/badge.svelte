<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const badgeVariants = tv({
    base: "group/badge mark-line inline-flex h-icon-lg w-fit shrink-0 items-center justify-center gap-space-1 overflow-hidden whitespace-nowrap rounded-xs bg-surface-recess px-space-2 text-ink-strong text-label leading-none transition-colors has-data-[icon=inline-end]:pr-space-1 has-data-[icon=inline-start]:pl-space-1 [&>svg]:pointer-events-none [&>svg]:size-icon-sm",
    variants: {
      variant: {
        default: "",
        /* A badge on a recessed ground (the page's own, behind a card, as
           an offered row stands on it): the raised surface, where the
           recess would melt into that ground. */
        raised: "bg-surface-raised",
        secondary: "text-ink-muted",
        outline: "",
        ghost: "bg-transparent text-ink-muted",
        destructive: "bg-status-fail-bg text-status-fail-ink",
        live: "bg-status-live-bg text-status-live-ink",
        /* Needs you is a mark, never a surface (DESIGN.md, Badges: "`attn`
           has no fill, its Status dot before its word in
           `status-attn-ink`"): the dot is drawn before its children. */
        attn: "bg-transparent text-status-attn-ink",
        done: "bg-status-done-bg text-status-done-ink",
        fail: "bg-status-fail-bg text-status-fail-ink",
        /* A release note's section (Caw's panel's surface brief, Update notice: "New in
           `note-new-*` with stars, Improved in `note-improved-*` with a
           rising graph, Fixed in `note-fixed-*` with a bug; each ink holds
           4.5:1 on its fill in both themes"). */
        "note-new": "bg-note-new-bg text-note-new-ink",
        "note-improved": "bg-note-improved-bg text-note-improved-ink",
        "note-fixed": "bg-note-fixed-bg text-note-fixed-ink",
        link: "bg-transparent text-link-ink underline-offset-4 hover:underline",
        /* A count of what is set in its control's own hue (a filter's
           active count): the brand wash under brand ink. */
        brand: "bg-brand-wash text-brand-ink",
        /* A count of what waits on the person (a settings section's
           faults): the attention pair, filled, for a figure with no word to
           carry the Status dot. */
        "attn-count": "bg-status-attn-bg text-status-attn-ink",
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
        cell: "min-h-6 gap-1.5 px-2",
        "cell-tall":
          "h-auto min-h-6 gap-1.5 whitespace-normal px-2 py-space-1 text-start",
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
          "pointer-events-none absolute top-[calc(var(--count-foot,0%)_-_var(--spacing-icon-md)_/_2)] start-[calc(50%_+_var(--count-glyph)_/_2_-_var(--spacing-icon-md)_/_2)] h-icon-md min-w-icon-md rounded-pill bg-ink-strong px-space-1 type-label text-on-ink tabular-nums data-[look=attn]:bg-status-attn-bg data-[look=attn]:text-status-attn-ink data-[look=held]:border data-[look=held]:border-ink-muted data-[look=held]:bg-surface-raised data-[look=held]:text-ink-strong",
      },
      /** Its figures in tabular widths (DESIGN.md, The Tabular Figure Rule). */
      figures: { tabular: "tabular-nums" },
      /** Its ink, alone or with its edge in the same ink (an outline badge). */
      tone: {
        success: "text-success-9",
        muted: "text-ink-muted",
        subtle: "text-ink-subtle",
        "success-edge": "border-success-9 text-success-9",
        "warning-edge": "border-warning-9 text-warning-9",
        "muted-edge": "border-border text-ink-muted",
      },
      /** Its glyph and words a hairline apart. */
      gap: { tight: "gap-space-row" },
      /** A row's meta tag: the recess with no edge, meta size at body weight, muted ink held. */
      kind: {
        meta: "rounded-xs border-transparent bg-surface-recess px-space-2 py-px font-normal text-ink-muted text-size-meta",
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
  import type { HTMLAnchorAttributes } from "svelte/elements";
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
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> &
    BadgeLooks & {
      variant?: BadgeVariant;
      /** Its element: a span, or the heading it is when it names a section
          (a release note's section, Caw's panel's surface brief, Update notice). A link is an
          `a` whatever this says. */
      as?: "span" | "h3";
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
  {#if variant === "attn"}
    <span
      aria-hidden="true"
      class="size-(--status-dot-size) shrink-0 rounded-pill bg-status-attn-glyph"
      data-box
      data-slot="badge-dot"
    ></span>
  {/if}<!-- no space between: a count's words are its children's alone -->{@render children?.()}
</svelte:element>
