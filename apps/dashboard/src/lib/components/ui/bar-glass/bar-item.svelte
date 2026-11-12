<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * A bar item's recipe, every state on its own box so hover, pressed,
   * selected and focus share one contour: the bar's item tall
   * (`--c-bar-item`), at least as wide, its corners the glass's by where it
   * stands (`concentric-at`, BarGlass: the ends' 18 less the 4px pad, 5px
   * toward a neighbour), a capsule where no glass holds it. Bare until the
   * pointer rests on it (the hover only where a fine pointer can rest),
   * pressed in the kit's press tint, selected in the selected wash, open
   * (what it opens stands beside the page) in the hover's surface, deeper
   * under the pointer, so each state still shows on it. Its
   * symbol (`data-slot="bar-symbol"`) is the bar's symbol size in the muted
   * ink, centred. A count takes no room in it: it is the kit Badge's
   * corner form (ui/badge, `corner`) on the symbol's top trailing corner,
   * its leading edge fixed there so a wide count grows toward the trailing
   * side, never back across the symbol, its centre half the glass's inset
   * above the item's top edge (between the item's edge and the glass's):
   * high enough that a wide count clears a thin symbol's top stroke and its
   * neighbour's, so a counted item is its neighbours' size and shape. Where
   * the glass says less room above it (`--bar-room`: the top bar's, 4px
   * under the window's top) the lift stops at that edge, the badge whole.
   * A control another library renders as its own element (a player's
   * buttons, MediaPlayer) takes this recipe on that element.
   */
  export const barItemVariants = tv({
    base: "group/bar-item relative inline-flex group-data-joined/tools:data-open:after:absolute group-data-joined/tools:data-open:after:inset-x-0 group-data-joined/tools:data-open:after:top-full group-data-joined/tools:data-open:after:h-c-bar-group-pad group-data-joined/tools:data-open:after:bg-inherit group-data-joined/tools:data-open:after:pointer-events-none h-c-bar-item min-w-c-bar-item flex-none select-none items-center justify-center rounded-pill glass-item:concentric-at border-0 bg-transparent text-ink-strong transition-control touch-hit press-tint hover:not-data-lit:not-data-open:bg-surface-hover data-open:not-data-lit:not-hover:bg-surface-hover data-open:not-data-lit:hover:bg-surface-pressed data-lit:bg-selected-bg data-lit:text-selected-ink *:data-[slot=bar-symbol]:size-c-bar-symbol *:data-[slot=bar-symbol]:flex-none",
    variants: {
      /** What it holds: a symbol, a title's words and chevron (a bar's title as a control), an action's words, or Caw's head. */
      form: {
        symbol: "",
        /* Its words at the label's inset, the chevron closer; it gives up
           width before its neighbours, its words cut at their end, where
           its glass stands short of room (a design graph's folded tools at
           390: the stepper's name, so the row holds to one line). */
        title:
          "mark-line min-w-0 max-w-full shrink gap-space-1 ps-space-2 pe-space-1",
        /* A word action (Cancel, a count said in words): its words at the
           label's size, an even inset either side, cut at their end. */
        words:
          "mark-line min-w-0 max-w-full px-space-2 text-size-label font-medium text-ink-strong num",
        /* His head in one cell, a circle a symbol's box wide whatever the
           strips' boxes (the beat's reach past it); on the phone's glass his
           ring over his own box, as the sidebar toggle's is, and a finger's
           44px area from the glass's leading edge across the bar's margin to
           the screen's edge, as the toggle's starts at the other. */
        head: "grid w-c-bar-item place-items-center p-0 tap-highlight-none @max-desk/shell:focus-inset @max-desk/shell:coarse:after:start-0 @max-desk/shell:coarse:after:end-auto @max-desk/shell:coarse:after:top-(--caw-hit-top) @max-desk/shell:coarse:after:bottom-auto @max-desk/shell:coarse:after:size-c-btn-h-lg",
      },
      /** A title's lines: one, the bar item's height; two on a phone (`phone-two`, an ordinary title read whole at 390), or two everywhere (`two`, the title over its description), its box growing with them and its corners a card's, never a tall capsule. */
      lines: {
        one: "",
        "phone-two":
          "max-phone:h-auto max-phone:min-h-c-bar-item max-phone:not-glass-item:rounded-lg",
        two: "h-auto min-h-c-bar-item py-space-1 not-glass-item:rounded-lg",
      },
      /** Its symbol's ink, said of what it stands for. */
      tone: {
        muted: "*:data-[slot=bar-symbol]:text-ink-muted",
        attn: "*:data-[slot=bar-symbol]:text-status-attn-glyph",
        fail: "*:data-[slot=bar-symbol]:text-status-fail-glyph",
      },
      /** Drawn only from the phone breakpoint up (`wide`), or only on the desk's glass, gone from the phone's (`desk`: the shell container's desk line). */
      layout: {
        all: "",
        wide: "max-phone:hidden",
        desk: "@max-desk/shell:hidden",
      },
    },
    compoundVariants: [
      // Selected, its symbol takes the selected ink with its wash.
      {
        tone: "muted",
        class: "data-lit:*:data-[slot=bar-symbol]:text-selected-ink",
      },
    ],
    defaultVariants: {
      form: "symbol",
      tone: "muted",
      layout: "all",
      lines: "one",
    },
  });

  type BarItemLooks = VariantProps<typeof barItemVariants>;
</script>

<script lang="ts">
  /**
   * One item of a bar's glass group (BarGlass), and the only one: a bare
   * symbol with no border or fill of its own until hovered, pressed or
   * selected, named for the screen reader and in its tooltip (DESIGN.md,
   * The Title Bars Follow Liquid Glass Rule). It draws its own states, so
   * no caller writes a fill: `pressed` (a toggle that is on, the selected
   * wash), `marked` (the same wash for a control that holds changed values
   * without being a toggle, or the chosen segment of a switch in glass,
   * BarSegments), `expanded` (what it opens stands), `count`
   * (its number, shown above 0), `tone` (its symbol's ink). It stands in a
   * BarGlass, or bare in a head beside one (a project's place). A link
   * with `href`, else a button; `props` are a primitive's trigger props (a
   * menu's, a popover's, a sheet's Close), merged in. Its symbol is `icon`,
   * or what `children` draws in its place (a machine's mark, Caw's head, a
   * title's words).
   */
  import { mergeProps } from "bits-ui";
  import type { Component, Snippet } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { glideHere } from "#lib/components/ui/tooltip/glide.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    label,
    icon: Icon,
    children,
    href,
    onclick,
    keys,
    tip,
    tipOff = false,
    pressed,
    marked = false,
    open = false,
    expanded,
    count,
    countLook,
    form,
    tone,
    layout,
    lines,
    props = {},
    ref = $bindable(null),
    ...rest
  }: BarItemLooks & {
    /** Its name, for the screen reader and in its tooltip. */
    label: string;
    /** Its symbol. */
    icon?: Component<Record<string, unknown>>;
    /** What it draws in its symbol's place. */
    children?: Snippet;
    /** Where it goes, as a link. */
    href?: string;
    onclick?: (event: MouseEvent) => void;
    /** Its shortcut, as the tooltip draws it. */
    keys?: string;
    /** Its tooltip's words where they say more than its name; `false`: no tooltip (a title, which says itself). */
    tip?: string | false;
    /** Its tooltip stands down (what it opened hangs under it and says it all). */
    tipOff?: boolean;
    /** A toggle: on (`aria-pressed`), drawn in the selected wash. */
    pressed?: boolean;
    /** It holds changed values, or is its switch's chosen segment (BarSegments): the selected wash, without being a toggle. */
    marked?: boolean;
    /** What it opens stands beside the page, a rail or an inspector it shows and hides: the hover's surface at rest and the pressed one under the pointer, a neutral on that never takes the selected wash (the coral it would add beside the view's one action), the panel it opened being what says so. While what it opened hangs from its glass (the glass `data-joined`), its foot is square and its fill runs on through the glass's pad to the card's top (`::after`), one tab with the card it opened. */
    open?: boolean;
    /** What it opens stands (`aria-expanded`). */
    expanded?: boolean;
    /** Its number, beside its symbol above 0 (DESIGN.md, The Earned Count Rule). */
    count?: number | null;
    /** How its count is dressed: comments waiting on the person (`attn`), or held to send together (`held`); the plain badge otherwise. */
    countLook?: "attn" | "held";
    /** A primitive's trigger props, merged in. */
    props?: Record<string, unknown>;
    ref?: HTMLElement | null;
    [attribute: `data-${string}`]: unknown;
    [aria: `aria-${string}`]: unknown;
    onpointerdown?: (event: PointerEvent) => void;
    onkeydown?: (event: KeyboardEvent) => void;
    onpointerenter?: (event: PointerEvent) => void;
    onpointerleave?: (event: PointerEvent) => void;
    onblur?: (event: FocusEvent) => void;
  } = $props();
  /** Its glass's one tooltip, which its tip joins (glide.ts); none outside a glass. */
  const glide = glideHere();

  /**
   * Its count's lift: half the glass's inset above the item's top edge,
   * stopping at the edge that clips the glass where that stands nearer
   * (`--bar-room`, the room above the glass, set by a glass that knows it:
   * the top bar's, 4px under the window's top), so the badge is drawn whole.
   * With no room said, the lift is the corner form's.
   */
  const COUNT_FOOT =
    "max(calc(-1 * var(--c-bar-group-pad) / 2), calc(var(--icon-md) / 2 - var(--c-bar-group-pad) - var(--bar-room, var(--icon-md))))";

  /** Caw's head on the phone's glass: its finger's area centred on the glass's height. */
  const CAW_HIT_TOP =
    "calc((var(--c-bar-caw-glass-phone) - var(--c-btn-h-lg)) / 2)";

  const counted = $derived(count !== undefined && count !== null && count > 0);
  const lit = $derived(Boolean(pressed) || marked);
  /** Its own states, said only where it has them: a trigger's own `aria-expanded` (in `props`) stands where it says none. */
  const own = $derived(
    Object.fromEntries(
      Object.entries({
        "aria-pressed": pressed,
        "aria-expanded": expanded,
        "data-lit": lit || undefined,
        "data-open": open || undefined,
        "data-counted": counted || undefined,
        "data-tone": tone && tone !== "muted" ? tone : undefined,
      }).filter(([, value]) => value !== undefined)
    )
  );
  const look = $derived(barItemVariants({ form, tone, layout, lines }));
</script>

{#snippet body()}
  {#if children && form === "words"}
    <!-- The words cut at their own box, never the item's: a count's badge
         stands out past the item's corner. -->
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{@render children()}</span
    >
  {:else if children}
    {@render children()}
  {:else if Icon}
    <Icon data-slot="bar-symbol" aria-hidden="true" />
  {/if}
  {#if counted}
    <Badge data-look={countLook} data-slot="num" size="corner"
      ><span>{count}</span></Badge
    >
  {/if}
{/snippet}

{#snippet item(tipProps: Record<string, unknown>)}
  <svelte:element
    this={href ? "a" : "button"}
    data-bar-item
    data-box
    {...mergeProps(tipProps, props, rest, own, { onclick })}
    aria-label={label}
    class={look}
    {href}
    style:--count-foot={COUNT_FOOT}
    style:--count-glyph="var(--c-bar-symbol)"
    style:--caw-hit-top={form === "head" ? CAW_HIT_TOP : undefined}
    type={href ? undefined : "button"}
    bind:this={ref}
  >
    {@render body()}
  </svelte:element>
{/snippet}

{#if tip === false}
  {@render item({})}
{:else}
  <Tip disabled={tipOff} {glide} {keys} label={tip ?? label}>
    {#snippet children(tipProps)}
      {@render item(tipProps)}
    {/snippet}
  </Tip>
{/if}
