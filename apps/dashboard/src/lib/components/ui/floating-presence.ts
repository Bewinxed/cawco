/**
 * A kit floating surface (dropdown, context menu, popover, select, HangCard)
 * gives the page back its pointer the moment it is dismissed, not when its
 * close has finished playing.
 *
 * None of them locks the page (`preventScroll` false on every kit menu,
 * context menu, select and popover): a press outside one shuts it and lands
 * on what it was pressed on, as on a page with nothing open. A true modal
 * (a dialog, a sheet) says so with its scrim instead. With bits-ui's lock,
 * `pointer-events: none` on the body (body-scroll-lock.svelte.js), a press
 * outside an open menu only shut it, and the row pressed never took it.
 *
 * With `forceMount` bits-ui leaves drawing the surface to the `child`
 * snippet: these helpers draw it while bits-ui's own presence says it should
 * be, open or still closing (`shouldRender`, which bits-ui hands a forceMount
 * child among its props), so the close plays as before.
 *
 * A dialog, alert dialog, sheet or drawer needs no forceMount: bits-ui's
 * dialog content mounts its lock only while open when it is drawn through
 * `child` (vaul-svelte's drawer is patched to hand its `child` on), and
 * takes `restoreScrollDelay`, which the kit sets to 0. Each draws its
 * content and scrim with `pressable`, so a closing one blocks no press.
 */

/**
 * A surface's `pointer-events` while it closes: none, so a press on the
 * place it is leaving from lands on the page under it, as one anywhere else
 * does. Open: auto, said here and not left to bits-ui. A floating surface
 * says it on its wrapper too (bits-ui's `wrapperProps`, the box floating-ui
 * places): the wrapper is as large as the surface, and left at auto it took
 * the press the closing surface let through.
 *
 * bits-ui writes `pointer-events: auto` inline on every content and
 * overlay, which is what lets them take a press through the body's lock
 * (`pointer-events: none` on <body> while a modal layer is open). A
 * `style:` directive owns its property whatever its value: Svelte drops the
 * property from the spread `style` string for any directive present
 * (svelte/internal/shared/attributes.js `to_style`, its `reserved_names`),
 * and writes nothing for an undefined value. Left undefined while open, the
 * directive took bits-ui's auto away, every open sheet, dialog and menu
 * inherited the body's none, and a press on any control in it fell through
 * to <html> (owner, on a phone: "none of the buttons work nor hide").
 */
export function pressable(open: boolean): "auto" | "none" {
  return open ? "auto" : "none";
}

/**
 * A floating surface a press outside closed leaves the focus where that
 * press put it: on the control pressed. bits-ui's focus scope hands the
 * focus back to whatever held it before the surface opened whenever the
 * surface closes, so a press on a field or a row outside an open popover
 * closed the popover and then took the focus off what was pressed.
 *
 * A press that put the focus on no control (Safari focuses no link or
 * button a click lands on, and a press on the page's ground focuses
 * nothing) gives it back to the surface's trigger, the control naming it
 * (`aria-controls`), never leaving it on <body>: bits-ui's memory is what
 * held the focus as the surface opened, which in Safari, where the press on
 * the trigger focused nothing either, is <body>. Closed by Escape, an item
 * or its trigger, bits-ui hands the focus back as before.
 *
 * Its site's own handlers run first; a press the site keeps (its
 * `onInteractOutside` prevents it) closes nothing and changes nothing here,
 * nor does one on another floating surface, nor a close whose focus the
 * site handles itself (its `onCloseAutoFocus` prevents it).
 */
export function pressedAway(site: {
  /** The surface's element (its content's `ref`). */
  content: () => HTMLElement | null;
  onCloseAutoFocus: () => ((event: Event) => void) | undefined;
  onInteractOutside: () => ((event: PointerEvent) => void) | undefined;
}): {
  onCloseAutoFocus: (event: Event) => void;
  onInteractOutside: (event: PointerEvent) => void;
} {
  let away = false;
  let trigger: HTMLElement | null = null;
  return {
    onInteractOutside: (event) => {
      site.onInteractOutside()?.(event);
      // A press on another floating surface (its own submenu, a menu it
      // opened) is no press on the page: that surface handles the focus.
      const target = event.target instanceof Element ? event.target : null;
      away = !(
        event.defaultPrevented ||
        target?.closest("[data-bits-floating-content-wrapper]")
      );
      // Its trigger names it only while it is open (bits-ui writes
      // `aria-controls` then): read now, before the close.
      const surface = site.content();
      trigger = surface?.id
        ? document.querySelector<HTMLElement>(
            `[aria-controls="${CSS.escape(surface.id)}"]`
          )
        : null;
    },
    onCloseAutoFocus: (event) => {
      site.onCloseAutoFocus()?.(event);
      const pressed = away;
      away = false;
      if (!pressed || event.defaultPrevented) {
        return;
      }
      // bits-ui closes a mouse's press 10ms after its pointerdown and a
      // finger's at its click: the press has put the focus where it goes.
      const surface = site.content();
      const at = document.activeElement;
      const onControl = at && at !== document.body && !surface?.contains(at);
      // A surface no trigger names (a context menu's area) is bits-ui's to
      // hand back.
      if (onControl || trigger) {
        event.preventDefault();
      }
      if (!onControl) {
        trigger?.focus({ preventScroll: true });
      }
    },
  };
}

/** What bits-ui hands a forceMount content's `child` snippet as `props`. */
type ContentProps = Record<string, unknown>;

/** Whether bits-ui's presence draws the surface: open, or closing. */
export function drawn(props: ContentProps): boolean {
  const { shouldRender } = props;
  if (typeof shouldRender !== "boolean") {
    throw new Error(
      "bits-ui no longer hands its presence (`shouldRender`) to a forceMount content's child snippet: re-read bits-ui's popper-layer-force-mount.svelte and update floating-presence.ts"
    );
  }
  return shouldRender;
}

/** The props to spread on the surface's element: bits-ui's, less its presence. */
export function own(props: ContentProps): ContentProps {
  const { shouldRender: _, ...rest } = props;
  return rest;
}
