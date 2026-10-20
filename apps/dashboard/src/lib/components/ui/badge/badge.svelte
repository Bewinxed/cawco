<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const badgeVariants = tv({
    base: "group/badge mark-line inline-flex h-icon-lg w-fit shrink-0 items-center justify-center gap-space-1 overflow-hidden whitespace-nowrap rounded-xs bg-[var(--surface-recess)] px-space-2 text-[var(--ink-strong)] text-label leading-none transition-colors has-data-[icon=inline-end]:pr-space-1 has-data-[icon=inline-start]:pl-space-1 [&>svg]:pointer-events-none [&>svg]:size-icon-sm",
    variants: {
      variant: {
        default: "",
        secondary: "text-[var(--ink-muted)]",
        outline: "",
        ghost: "bg-transparent text-[var(--ink-muted)]",
        destructive: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
        live: "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]",
        attn: "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]",
        done: "bg-[var(--status-done-bg)] text-[var(--status-done-ink)]",
        fail: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
        /* A release note's section (DESIGN.md, Update notice: "New in
           `note-new-*` with stars, Improved in `note-improved-*` with a
           rising graph, Fixed in `note-fixed-*` with a bug; each ink holds
           4.5:1 on its fill in both themes"). */
        "note-new": "bg-note-new-bg text-note-new-ink",
        "note-improved": "bg-note-improved-bg text-note-improved-ink",
        "note-fixed": "bg-note-fixed-bg text-note-fixed-ink",
        link: "bg-transparent text-link-ink underline-offset-4 hover:underline",
      },
      /* The looks its callers draw over a variant, each as they drew it. */
      /**
       * A cell's chip: at least 24px tall, wider pads; or with room above and
       * below for its words, which wrap and grow it line by line from the
       * start (an update's long status). A tab's count (DESIGN.md, Work tab
       * count): its numeral in the meta role and tabular figures, and a press
       * on it is a press on its tab.
       */
      size: {
        cell: "min-h-6 gap-1.5 px-2",
        "cell-tall":
          "h-auto min-h-6 gap-1.5 whitespace-normal px-2 py-space-1 text-start",
        count: "pointer-events-none text-meta tabular-nums",
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
  export type BadgeLooks = Omit<VariantProps<typeof badgeVariants>, "variant">;
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
          (a release note's section, DESIGN.md Update notice). A link is an
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
  {@render children?.()}
</svelte:element>
