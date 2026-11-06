<script lang="ts">
  /**
   * A card opened from an item of a bar's glass (BarGlass), hung from that
   * glass as one shape with it, as BarMenu hangs a menu: the kit popover as
   * a HangCard (DESIGN.md, "A card that hangs from its anchor"), the way
   * Caw's card hangs from the top bar's glass. It comes down out of the
   * glass's foot and goes back up into it, and while it stands drawn out the
   * glass draws its join. Never a card detached from its trigger
   * (house/no-detached-bar-menu).
   *
   * It stands inside a `Popover.Root` whose trigger is an item of the glass,
   * in that Content's place, flush with the glass on the side the glass
   * flares away from, and never narrower than the glass. What it holds sets
   * its width (a composer, a form, the Comments rail), never the kit
   * popover's own 288px, up to the room on its side of the glass.
   */
  import type { Popover as PopoverPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import { cn } from "#lib/utils.js";
  import { hungFromGlass } from "./hung.svelte";

  let {
    label,
    ref = $bindable(null),
    class: className,
    children,
    ...rest
  }: Omit<
    PopoverPrimitive.ContentProps,
    "child" | "children" | "align" | "side" | "sideOffset" | "customAnchor"
  > & {
    /** What it holds, read out. */
    label: string;
    ref?: HTMLElement | null;
    children: Snippet;
  } = $props();

  // The glass draws its join while this card stands drawn out of it.
  const { glass, card } = hungFromGlass();
</script>

<HangCard
  {...rest}
  align={glass.flare === "start" ? "end" : "start"}
  anchor={glass.node}
  aria-label={label}
  class={cn(
    "w-max min-w-(--bits-popover-anchor-width) max-w-(--bits-popover-content-available-width)",
    className
  )}
  customAnchor={glass.node}
  side="bottom"
  sideOffset={0}
  bind:joined={card.joined}
  bind:ref
>
  {@render children()}
</HangCard>
