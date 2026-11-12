<script lang="ts">
  /**
   * A card opened from an item of a bar's glass (BarGlass), hung from that
   * glass as one shape with it: BarMenu's pattern for a popover's card (a
   * view's settings, a panel), the way Caw's card hangs from the top bar's
   * glass (GlassCard). It comes down out of the glass's foot and goes back
   * up into it, and while it stands drawn out the glass draws its join.
   *
   * It stands inside a `Popover.Root` whose trigger is an item of the
   * glass, in that Content's place, wherever the glass is: the glass is
   * the one it is drawn in (its context), so an item handed to another
   * component's glass hangs its card from that glass.
   *
   * `bare`: what it holds sizes it and draws to its edges (a panel with its
   * own bar and scroll, the artifact panel's comments), no pad and no
   * height of the kit's, clipped to the card's corners.
   *
   * `beside`: a second card joined to its leading edge, its top on the
   * card's top (the open thread beside the comments that list it: the
   * owner's pin 51 on the Working area, "show the thread on the left as a
   * 2nd popover, connected"). The two meet square, and the card's clip
   * (HangCard's: nothing above the glass's foot, its shadow's room each
   * other side) opens on the leading side to hold it.
   *
   * Both wear the panel's drop (HangCard `depth`): the glass is narrower
   * than the card, so past its sides the clip at the card's top stands in
   * open air, and the overlay's 48px drop ended there in a hard line.
   */
  import type { ComponentProps, Snippet } from "svelte";
  import { popOut } from "#lib/cawco/motion/pop.svelte.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { cn } from "#lib/utils.js";
  import { hungFromGlass } from "./hung.svelte";

  let {
    label,
    bare = false,
    beside,
    besideLabel,
    class: className,
    children,
    ...rest
  }: Omit<
    ComponentProps<typeof HangCard>,
    "align" | "anchor" | "customAnchor" | "side" | "sideOffset" | "joined"
  > & {
    /** What it holds, read out. */
    label: string;
    /** What it holds draws to its edges and sizes it. */
    bare?: boolean;
    /** A second card joined on its leading edge; none while nothing stands there. */
    beside?: Snippet | null;
    /** The second card, read out. */
    besideLabel?: string;
  } = $props();

  // The glass draws its join while this card stands drawn out of it.
  const { glass, card } = hungFromGlass(() => false);
</script>

<HangCard
  {...rest}
  align={glass.flare === "start" ? "end" : "start"}
  anchor={glass.node}
  aria-label={label}
  class={cn(
    bare && "w-max max-w-none max-h-none overflow-visible p-0",
    beside &&
      "rounded-s-none [clip-path:inset(0_calc(-1*var(--spacing-c-hang-shadow-room))_calc(-1*var(--spacing-c-hang-shadow-room))_-100vw_round_0_0_var(--radius-lg)_0)]",
    className
  )}
  customAnchor={glass.node}
  depth="panel"
  side="bottom"
  sideOffset={0}
  bind:joined={card.joined}
>
  {#if bare}
    <div
      class="flex min-h-0 flex-col overflow-hidden rounded-[inherit]"
      data-slot="bar-card-body"
    >
      {@render children?.()}
    </div>
  {:else}
    {@render children?.()}
  {/if}
  {#if beside}
    <div
      aria-label={besideLabel}
      class={cn(
        floatingSurface({ motion: "pop", depth: "panel" }),
        "absolute end-full top-0 flex max-h-full min-h-0 flex-col overflow-hidden rounded-e-none p-0"
      )}
      data-side="left"
      data-slot="bar-card-beside"
      data-state="open"
      role="dialog"
      out:popOut={{ side: "left" }}
    >
      {@render beside()}
    </div>
  {/if}
</HangCard>
