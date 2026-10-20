import { tv } from "#lib/utils.js";

/**
 * The new-session form's popover surface, the one NsPopover and
 * NsPopoverGroup draw (DESIGN.md, Navigation, menus and floating surfaces;
 * New-session popover: "Its own popovers hang from it and glide between sibling triggers, morphing
 * width and height over 260ms on the drawer curve"): portaled, origin-aware,
 * interruptible. Small screens get a wider, taller popover, not a takeover:
 * picking a machine or a project is a detail of the form behind it, so it
 * stays anchored to its trigger and only its cap changes (DESIGN.md,
 * Breakpoints: "popovers widen to the viewport less 24px"). Exit is shorter
 * than the entrance, fading and settling back to --pop-scale (bits-ui keeps
 * the content mounted until it ends); the entrance rises out of --pop-scale
 * on the glide's curve, a keyframe so it plays on the first frame the content
 * exists, while gliding between siblings keeps the content open and never
 * replays it. A group's surface (`data-morph`) also tweens its width. The
 * permission rows never wrap, so their popover takes the rows' width; a `fit`
 * surface (`data-fit`) takes its content's. Its rows are menu items, 44px
 * tall on touch (The 44 Touch Rule); a kit Button keeps its drawn size and
 * reaches 44px through its own `touch-hit`. Content never outgrows the
 * surface: a wide row shrinks. The fit and the permission rows' width hold at
 * every width, a phone's included, so the phone's width stands only where
 * neither does. Its width is the caller's `--ns-pop-width` (a token's length
 * or pixels), its rows' gap `--ns-pop-gap`. Its height is held to the room
 * floating-ui leaves it a frame after floating-ui says so (`--ns-pop-room`,
 * `popoverRoom`).
 */
export const glidePopoverVariants = tv({
  base: "translate-0 relative z-(--layer-float) grid max-h-[min(var(--c-pop-max-h),var(--ns-pop-room,var(--bits-popover-content-available-height)))] w-[min(var(--ns-pop-width,var(--c-pop-w)),calc(100vw-var(--space-8)))] origin-[var(--bits-popover-content-transform-origin,top_left)] scale-100 grid-cols-1 content-start gap-(--ns-pop-gap,0px) overflow-auto rounded-lg border border-border-control bg-surface-raised p-space-2 opacity-100 shadow-overlay outline-off transition-[opacity] duration-(--dur-pop) ease-drawer not-data-fit:has-[[data-slot=perms][data-embedded=true]]:w-max not-data-fit:has-[[data-slot=perms][data-embedded=true]]:max-w-[calc(100vw-var(--space-8))] data-fit:max-h-none data-fit:w-max data-fit:min-w-[min(var(--ns-pop-width,var(--c-pop-w)),calc(100vw-2*var(--c-screen-margin)))] data-fit:max-w-[calc(100vw-2*var(--c-screen-margin))] data-fit:overflow-visible motion-safe:transition-[opacity,scale,translate] motion-safe:data-[state=closed]:animate-ns-pop-out motion-safe:data-[state=open]:animate-ns-pop-in motion-safe:data-morph:transition-[opacity,scale,translate,width] max-phone:not-data-fit:max-h-[min(var(--c-pop-max-h-phone),55dvh,var(--ns-pop-room,var(--bits-popover-content-available-height,55dvh)))] max-phone:not-data-fit:not-has-[[data-slot=perms][data-embedded=true]]:w-[calc(100vw-2*var(--c-screen-margin))] coarse:[:where(&_button:not([data-slot=button]))]:min-h-c-nav-h",
  variants: {
    /**
     * Its inset: the sheet's own (`roomy`), or the ladder's 4px round a menu
     * whose rows carry their own (`snug`, the trigger menu).
     */
    pad: { roomy: "", snug: "p-space-1" },
  },
  defaultVariants: { pad: "roomy" },
});

/**
 * The room floating-ui leaves the surface, handed to `set` a frame after
 * floating-ui writes it: for the surface's `--ns-pop-room`, set with a
 * `style:` directive (a property written on the node is lost whenever bits-ui
 * redraws its style). floating-ui writes its available height on the
 * floating wrapper (bits-ui's `--bits-floating-available-height`, the
 * content's `--bits-popover-content-available-height`) from its
 * ResizeObserver's delivery as it places the surface. Bounded by it there,
 * the surface changed height inside that delivery, at a depth the delivery
 * had passed: picking Full Send grew the content, the surface flipped above
 * its trigger into more room, and the page raised "ResizeObserver loop
 * completed with undelivered notifications" (new-session-full-send, desk).
 * Taken a frame later, the bound lands outside it, as every size the house
 * reads off an observer does (frame-observer.ts). Until the first copy the
 * surface takes floating-ui's own value: it opens placed, not inside a
 * delivery.
 */
export function popoverRoom(set: (room: string | undefined) => void) {
  return (node: HTMLElement) => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const room = getComputedStyle(node)
        .getPropertyValue("--bits-popover-content-available-height")
        .trim();
      set(room || undefined);
    };
    const ask = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(read);
      }
    };
    // floating-ui writes on the wrapper, the surface's parent.
    const watch = new MutationObserver(ask);
    if (node.parentElement) {
      watch.observe(node.parentElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
    ask();
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  };
}
