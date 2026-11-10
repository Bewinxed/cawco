<script lang="ts">
  /**
   * A menu opened from an item of a bar's glass (BarGlass), hung from that
   * glass as one shape with it: the kit's DropdownMenu content as a HangCard
   * (DESIGN.md, "A card that hangs from its anchor"), the way Caw's card
   * hangs from the top bar's glass (GlassCard). It comes down out of the
   * glass's foot and goes back up into it, and while it stands drawn out
   * the glass draws its join. From a glass standing at the foot of its
   * surface (a drawing's tools floating over its foot) it `rises`: it
   * stands on the glass's top, comes up out of it and goes back down into
   * it, and the glass draws its join upside down. Never a menu detached
   * under its trigger (house/no-detached-bar-menu).
   *
   * It stands inside a `DropdownMenu.Root` whose trigger is an item of the
   * glass, in that Content's place. It hangs flush with the glass on the
   * side the glass flares away from: under a trailing group, its trailing
   * edge on the glass's; under a leading title, its leading edge on it. It
   * is never narrower than the glass, so the glass's foot always runs on
   * into its top edge.
   */
  import type { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import DropdownMenuContent from "#lib/components/ui/dropdown-menu/dropdown-menu-content.svelte";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import { cn } from "#lib/utils.js";
  import { hungFromGlass } from "./hung.svelte";

  let {
    label,
    width = "regular",
    rises = false,
    ref = $bindable(null),
    class: className,
    children,
    ...rest
  }: Omit<
    DropdownMenuPrimitive.ContentProps,
    "child" | "children" | "align" | "side" | "sideOffset" | "customAnchor"
  > & {
    /** What it holds, read out. */
    label: string;
    /** Its width, the kit menu's (`compact`, `regular`, `wide`, `tiles`, `titles`). */
    width?: "compact" | "regular" | "wide" | "tiles" | "titles";
    /** It rises out of the glass's top: the glass stands at the foot of its surface. */
    rises?: boolean;
    ref?: HTMLElement | null;
    children: Snippet;
  } = $props();

  // The glass draws its join while this card stands drawn out of it.
  const { glass, card } = hungFromGlass(() => rises);
</script>

<HangCard
  {...rest}
  align={glass.flare === "start" ? "end" : "start"}
  anchor={glass.node}
  aria-label={label}
  as={DropdownMenuContent}
  class={cn("min-w-(--bits-dropdown-menu-anchor-width)", className)}
  customAnchor={glass.node}
  menuWidth={width}
  {rises}
  side={rises ? "top" : "bottom"}
  sideOffset={0}
  bind:joined={card.joined}
  bind:ref
>
  {@render children()}
</HangCard>
