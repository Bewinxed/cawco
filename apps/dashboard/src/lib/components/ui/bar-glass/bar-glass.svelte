<script lang="ts" module>
  import { createContext } from "svelte";

  /**
   * The glass a menu or popover opened from one of its items hangs from
   * (BarMenu): the group's element, the side its foot flares to, and the
   * card's word that it stands drawn out of the glass or has gone back, and
   * whether it hangs from the glass's foot or rises out of its top
   * (`rises`, a glass standing at the foot of its surface).
   */
  export interface GlassHold {
    readonly flare: "start" | "end";
    hung: (shown: boolean, rises: boolean) => void;
    readonly node: HTMLElement | null;
  }

  export const [glassHold, setGlassHold] = createContext<GlassHold>();
</script>

<script lang="ts">
  /**
   * The top bar's glass (GlassCard's surface brief, "The top bar's glass,
   * Caw's head and its cards"; its phone form, that brief's "The phone's
   * glass", the owner's pick in decisions/caw-phone-shape): one group on
   * the bar's control height, a capsule of the panel's glass holding the
   * bar's borderless items concentric inside it, Caw's head last at the
   * edge. Under the desk line it is Caw's own glass, standing the bar's
   * phone margin (`c-bar-phone-edge`, the Shell's trailing pad) in from the
   * screen's trailing edge, as the sidebar toggle's glyph stands from the
   * leading one: square on its trailing side and round on its leading one,
   * edged all round, its centre on the tabs' centre line as the toggle's
   * glyph's is (on a page with no tabs, the line the two share), standing a
   * neck (`--caw-neck`) clear of the row's floor.
   *
   * Its form follows the shell, not the window: the phone form answers to
   * the `shell` container (`@max-desk/shell`, the shell's root, as wide as
   * the window), so a frame of any width draws the form its own width
   * would. It knows nothing of the stores: what it holds arrives as
   * `children` (the bar's controls) and `head` (Caw's head), its states as
   * props (`joined`, bar-glass). A host's own attributes land on the
   * glass's element: a primitive's list props (a tablist's role, its id and
   * ref, so the glass is the list and each segment one of its items), a
   * label, `data-` marks.
   *
   * `form="group"` is the same capsule as a head's trailing group (The
   * Title Bars Follow Liquid Glass Rule: "Each group is one capsule of the
   * panel's glass … the top bar's trailing group its recipe"): the capsule
   * and its items at every width, with no Caw tab; a card it hangs joins it
   * as the bar's do, in the desk's form.
   *
   * While a card hangs from it (Caw's panel, the machines, Jump, Files:
   * HangCard `glass`) the glass is one shape with the card (Caw's panel's surface brief, Caw's
   * panel): its join takes the card's `surface-raised` and `border-control`
   * edge over its top, down its flanks and up a `radius-lg` flare at its
   * leading foot, with no edge across the foot, fading in over `--duration-pop`
   * and out over `--duration-exit`; a card a key opened or shut changes it at
   * once (motion/keyed lands it). On the phone the join runs on down through the neck, square
   * on its trailing side, which goes straight on down into the card's.
   */
  import { type Snippet, untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";
  import { placeItems } from "./place.js";

  let {
    head,
    children,
    form = "bar",
    flare = "start",
    joined = false,
    ...attributes
  }: Omit<HTMLAttributes<HTMLDivElement>, "children" | "class"> & {
    /** Caw's head, last in the group, at the edge (the top bar's; a group has none). */
    head?: Snippet;
    /**
     * `bar`: the top bar's trailing group, Caw's tab under the shell's desk
     * line. `group`: the same capsule at every width, a head's floating
     * group of bare symbols (a project's head), with no join and no tab.
     */
    form?: "bar" | "group" | "title";
    /**
     * The foot's side that flares into the card it hangs: `start` for a
     * card that stands out past the glass's leading side (the bar's, a
     * trailing group's), `end` for one past its trailing side (a leading
     * title's).
     */
    flare?: "start" | "end";
    /** The bar's controls ahead of the head (Files, Jump, the machines). */
    children?: Snippet;
    /** A card stands drawn out of the glass: the glass draws its join. */
    joined?: boolean;
  } = $props();

  /*
   * `title`: a bar's title as a control (the artifact panel's): the HIG's
   * title is plain text in the bar, so it draws no glass at rest; its card
   * (BarMenu) hangs from it as from a group's glass, and while it stands
   * drawn out the join is the title's whole ground, one shape with the card.
   */

  let node = $state<HTMLElement | null>(null);
  /** How many of its menus stand drawn out of it (BarMenu): one at a time, counted so a swap never drops the join between them. */
  let hanging = $state(0);
  /** The last card drawn out of it rises out of its top: its join is drawn upside down. Kept as it goes back, so the join fades out the way it stood. */
  let risen = $state(false);
  setGlassHold({
    get node() {
      return node;
    },
    get flare() {
      return flare;
    },
    hung(shown, rises) {
      // Told from a card's own effect: counted without that effect reading the count back.
      untrack(() => {
        hanging = Math.max(0, hanging + (shown ? 1 : -1));
        if (shown) {
          risen = rises;
        }
      });
    },
  });
  const drawnOut = $derived(joined || hanging > 0);
  /** The join stands on its head: a card from one of its menus rises out of its top (the `joined` card, Caw's, hangs). */
  const joinRises = $derived(!joined && risen);
  /** Its items' one tooltip, gliding between them (glide.ts). */
  const glide = provideGlide();
</script>

<!-- What stands in the glass takes its contour by where it stands
     (design.css `concentric-row`): the glass marks each item it draws
     leading, middle, trailing or only (`placeItems`), and a BarItem or a
     kit part there (a Button, a Toggle: the `glass-item:` variant,
     `concentric-at`; a segmented control in glass is BarSegments, whose
     glass is its list and each segment a BarItem) takes the capsule's radius less
     the pad on the corners facing the glass's ends and `radius-xs` on those
     facing a neighbour. A title draws no glass, so its control keeps its
     own corner. The glass is drawn by a layer under the items (`before:`), never by the
     group itself: a backdrop filter on the group would make it the box
     Caw's fixed drawer is laid out in. The layer stands under every item
     (`before:-z-1` in the group's own stacking context, `isolate`): a kit
     button on a fine pointer is not positioned, and an absolute layer drawn
     before it painted over it, leaving its glyph at a tenth of its ink. `--flare` is how far its leading
     foot flares into the card (HangCard reads it). Caw, the phone group's
     one item, is the glass's whole box there. -->
<div
  {...attributes}
  data-slot="tools"
  class={[
    "group/tools relative isolate flex items-center gap-c-bar-group-pad p-c-bar-group-pad rounded-pill concentric-row r-inset-c-bar-group-pad r-join-xs hit-gap-x-c-bar-group-pad coarse:gap-space-5 coarse:hit-gap-x-space-5 before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop before:pointer-events-none contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none",
    // A title's words may take two lines on a phone (ArtifactMenu): its
    // ground grows with them.
    form === "title" ? "before:hidden min-h-c-btn-h" : "h-c-btn-h",
    // The top bar's glass says the room above it to the window's top
    // (`--bar-room`: centred in the bar on a desk, `--tools-top` down on a
    // phone), where a counted item's badge stops its lift (BarItem).
    form === "bar" &&
      "[--bar-room:calc((var(--spacing-c-top-bar-h)_-_var(--spacing-c-btn-h))_/_2)] @max-desk/shell:[--bar-room:var(--tools-top)] @max-desk/shell:self-start @max-desk/shell:h-c-bar-caw-glass-phone @max-desk/shell:mt-(--tools-top) @max-desk/shell:p-0 @max-desk/shell:rounded-s-(--tools-round) @max-desk/shell:rounded-e-none @max-desk/shell:caw-neck-(--tools-neck) @max-desk/shell:[--r-inner:var(--tools-round)] @max-desk/shell:**:data-bar-item:rounded-e-none @max-desk/shell:**:data-bar-item:w-c-bar-caw-glass-phone @max-desk/shell:**:data-bar-item:min-w-c-bar-caw-glass-phone @max-desk/shell:**:data-bar-item:h-c-bar-caw-glass-phone",
  ]}
  bind:this={node}
  {@attach (glass) => (form === "title" ? undefined : placeItems(glass))}
  data-bar-group={form === "bar" ? "" : undefined}
  data-glass={form === "title" ? undefined : ""}
  data-flare={flare}
  data-joined={drawnOut ? "" : undefined}
  style:--flare="var(--radius-lg)"
  style:--r-outer="calc(var(--spacing-c-btn-h) / 2)"
  style:--tools-top={"calc(var(--spacing-c-top-bar-h) - var(--spacing-c-tab-row-h) / 2 - var(--spacing-c-bar-caw-glass-phone) / 2)"}
  style:--tools-round="calc(var(--spacing-c-bar-caw-glass-phone) / 2)"
  style:--tools-neck={"calc((var(--spacing-c-tab-row-h) - var(--spacing-c-bar-caw-glass-phone)) / 2)"}
>
  <!-- The join: a layer one flare wider than the glass on its leading side
       and 1px under its foot, into the card's top edge. The layer is the
       edge's ink in the outline (`--join-edge`), its `::before` the surface
       1px inside it (`clip-join`), so the edge runs up the flare, both
       flanks and over the top. Its top corners are the pill's end (`--r`).
       A head's group draws it too, for the card it hangs (a design graph's
       view); only the bar's takes the phone's tab form. Under a card that
       rises out of the glass's top the same layer is turned upside down,
       1px over its top instead: over its foot, up its flanks and down a
       flare at its top into the card's foot. -->
  <span
    data-slot="join"
    aria-hidden="true"
    class={[
      "absolute pointer-events-none opacity-0 bg-border-control clip-path-(--join-edge) transition-[opacity] duration-(--duration-exit) ease-out [--r:var(--r-outer)] group-data-joined/tools:opacity-100 group-data-joined/tools:duration-(--duration-pop) before:absolute before:inset-0 before:bg-surface-raised before:clip-join",
      flare === "start"
        ? "-start-(--f) end-0"
        : "start-0 -end-(--f) -scale-x-100",
      joinRises
        ? "-inset-bs-px inset-be-0 -scale-y-100"
        : "inset-bs-0 -inset-be-px",
      form === "bar" &&
        "@max-desk/shell:-inset-be-(--caw-neck) @max-desk/shell:[--r:var(--tools-round)] @max-desk/shell:clip-path-(--join-edge-phone) @max-desk/shell:before:clip-join-phone",
    ]}
    style:--f="var(--flare)"
    style:--h="calc(100% - 1px)"
    style:--join-edge={"shape(from 0 var(--h), arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw, line to var(--f) var(--r), arc to calc(var(--f) + var(--r)) 0 of var(--r) cw, line to calc(100% - var(--r)) 0, arc to 100% var(--r) of var(--r) cw, line to 100% 100%, line to 0 100%, close)"}
    style:--join-edge-phone={"shape(from 0 var(--h), arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw, line to var(--f) var(--r), arc to calc(var(--f) + var(--r)) 0 of var(--r) cw, line to 100% 0, line to 100% 100%, line to 0 100%, close)"}
  ></span>
  {@render children?.()}
  {@render head?.()}
</div>
<GlideTip tether={glide} />
