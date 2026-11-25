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
 * replays it; a group's surface tweens its width and height there (motion/
 * morph, NsPopoverGroup). The
 * permission rows never wrap, so their popover takes the rows' width, and
 * Full Send's question under them wraps inside it, never widening it
 * (PermissionSection); a `fit` surface (`data-fit`) takes its content's. Its rows are menu items, 44px
 * tall on touch (The 44 Touch Rule); a kit Button keeps its drawn size and
 * reaches 44px through its own `hitbox`. Content never outgrows the
 * surface: a wide row shrinks. The fit and the permission rows' width hold at
 * every width, a phone's included, so the phone's width stands only where
 * neither does. Its width is the caller's `--ns-pop-width` (a token's length
 * or pixels), its rows' gap `--ns-pop-gap`. Its height is held to the room
 * on its side of its trigger by its layer's box (kit anchored.svelte.ts),
 * which caps it where it would run past the screen.
 */
export const glidePopoverVariants = tv({
  base: "relative z-(--layer-float) grid max-h-[calc(var(--spacing)_*_110)] w-[min(var(--ns-pop-width,calc(var(--spacing)_*_80)),calc(100vw-var(--spacing-space-8)))] origin-[var(--kit-origin,top_left)] translate-0 scale-100 grid-cols-1 content-start gap-(--ns-pop-gap,0px) overflow-auto rounded-lg bg-bg p-space-2 opacity-100 shadow-lg ring ring-ui-2 outline-off transition-[opacity] duration-(--duration-slow) ease-drawer not-data-fit:has-[[data-slot=perms][data-embedded=true]]:w-max not-data-fit:has-[[data-slot=perms][data-embedded=true]]:max-w-[calc(100vw-var(--spacing-space-8))] data-fit:max-h-none data-fit:w-max data-fit:max-w-[calc(100vw-2*var(--spacing-space-3))] data-fit:min-w-[min(var(--ns-pop-width,calc(var(--spacing)_*_80)),calc(100vw-2*var(--spacing-space-3)))] data-fit:overflow-visible motion-safe:transition-[opacity,scale,translate] motion-safe:data-[state=closed]:animate-ns-pop-out motion-safe:data-[state=open]:animate-ns-pop-in max-phone:not-data-fit:max-h-[min(calc(var(--spacing)_*_105),55dvh)] max-phone:not-data-fit:not-has-[[data-slot=perms][data-embedded=true]]:w-[calc(100vw-2*var(--spacing-space-3))] coarse:[:where(&_button:not([data-slot=button]))]:min-h-row",
  variants: {
    /**
     * Its inset: the sheet's own (`roomy`), or the ladder's 4px round a menu
     * whose rows carry their own (`snug`, the trigger menu).
     */
    pad: { roomy: "", snug: "p-space-1" },
    /**
     * Its height's cap: the form's own (`cap`), or the whole room on its
     * side of its trigger (`room`, its layer's box's cap: kit
     * anchored.svelte.ts), for a surface whose list is its subject and
     * would otherwise scroll inside a scroller (the location's
     * repositories).
     */
    height: {
      cap: "",
      room: "max-h-none max-phone:not-data-fit:max-h-[55dvh]",
    },
  },
  defaultVariants: { pad: "roomy", height: "cap" },
});
