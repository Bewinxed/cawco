<script lang="ts">
  /**
   * A comment's thread as a bottom sheet: on a phone and under a finger, in
   * a preview's well (PreviewPane) and over a conversation (CommentChip);
   * and under the phone line, what rises over a design graph's drawing (its
   * map, move and dials: DesignGraph).
   * The kit's drawer (vaul, `hosted` in a host of its own, as SideSheet's
   * preview sheet is), with its grabber and two stops: half its room, where
   * it opens, and the whole room. A finger on the grabber drags it between
   * them, 1:1, and it settles on the nearer on vaul's own curve, a flick
   * moving it one stop and never past (vaul `snapToSequentialPoint`); dragged
   * below the lower one it goes, as Close does. A tap on the grabber steps
   * it to the other stop. What it holds is as tall as the part of the sheet
   * standing in its room, so the reply at its foot is always in reach and
   * the thread over it is what scrolls.
   *
   * The host is the room it stands in, less what a software keyboard covers
   * of it (`--keyboard-lift`, written by whoever holds it): the sheet stands
   * on the keyboard and its field over it.
   *
   * Its holder keeps it drawn and drives `open`: closed, it slides down on
   * vaul's own curve (a fade under reduced motion), and says so once it has
   * (`onclosed`, bits-ui's Dialog `onOpenChangeComplete`, which waits on the
   * sheet's exit animation however the close came: the prop, Close, Escape,
   * a press outside or a drag). Opened again before then, the same sheet
   * turns back up, its reply as it stood.
   *
   * Its stops are px of the room as measured (`room`), never fractions:
   * vaul-svelte (1.0.0-next.7) works out where a stop stands from
   * the host's `getBoundingClientRect()` inside a `$derived`
   * (use-snap-points.svelte.js `snapPointsOffset`), which reads it again
   * only when the open state, the stops or the window's size change. The
   * host's size changing under an open sheet (the keyboard's lift, or the
   * page's first layout settling after it mounts) left it standing where
   * the old size put it: 44px low on the first open after a load, its reply
   * under the keyboard. As px of `room`, the stops change with the host, and
   * vaul measures again and moves the sheet to its stop.
   */
  import type { Snippet } from "svelte";
  import { tick, untrack } from "svelte";
  import { Drawer as Vaul } from "vaul-svelte";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { frameSize } from "#lib/platform/frame-observer.js";

  let {
    open,
    label,
    onclose,
    onclosed,
    onmoved,
    surface = $bindable(),
    short = false,
    tall = false,
    children,
  }: {
    open: boolean;
    /** What it holds, read out: the sheet's name. */
    label: string;
    /** Close, Escape, or the sheet dragged below its lower stop. */
    onclose: () => void;
    /** Closed and done sliding down: its holder may stop drawing it. */
    onclosed?: () => void;
    /** It came to rest (risen, or settled on a stop): vaul slides it by a transform, which no size observer hears. */
    onmoved?: () => void;
    /** The sheet as drawn: what covers the page, for its holder to tell. */
    surface?: HTMLElement;
    /**
     * What it holds is a line or two (an empty list), or the page above it
     * is to be tapped (a thread being placed again, its bar and Cancel at
     * the top): its lower stop is low enough to hold that, never half its
     * room standing empty or covering the page.
     */
    short?: boolean;
    /**
     * What it holds reads from its top and has no page above it to show (a
     * comment chip's thread in the transcript): it opens at its whole room,
     * so its question and first message stand in view with the reply under
     * them (HIG, Sheets: leave out the medium detent "if a sheet's content
     * is more useful when it displays at full height"). A thread over its
     * page opens at half, the page lifting its pill above the sheet.
     */
    tall?: boolean;
    children: Snippet;
  } = $props();

  /** Its stops, as shares of its room: half, where it opens (the thread's head and the reply in view), and the whole room, to read a long thread. */
  const HALF = [0.5, 1];
  /** Holding a line or two: its bar and that line, and the whole room. Our call: under a quarter, which holds the bar and a line on a phone of 640px or taller. */
  const LOW = [0.22, 1];
  const SHARES = $derived(short ? LOW : HALF);
  /** Its foot clears the home indicator. */
  const FOOT =
    "calc(var(--spacing-space-3) + env(safe-area-inset-bottom, 0px))";

  let host = $state<HTMLDivElement>();
  let room = $state(0);
  const measured = frameSize(
    (node: HTMLDivElement) => node.offsetHeight,
    (value) => {
      room = value;
    }
  );
  /** The stops as vaul takes them: px of the room as measured. */
  const stops = $derived(
    SHARES.map((share) => `${Math.round(room * share)}px`)
  );
  /** The stop it stands at, by its place in `SHARES`. */
  let stop = $state(0);
  // Each opening starts at half its room. What wants the whole room (a
  // chip's thread, `tall`) goes on to it at once: vaul places an opening
  // sheet at its first stop whatever stop is asked, and moves only on a
  // change of stop, so the whole room is asked a tick after the opening, as
  // a tap on the grabber asks it (`step`).
  $effect(() => {
    if (!open) {
      return;
    }
    const whole = tall;
    untrack(() => {
      if (!whole) {
        stop = 0;
        return;
      }
      if (stop !== 1) {
        tick().then(() => {
          stop = 1;
        });
      }
    });
  });
  /** How much of the sheet stands below its room at its stop: what it holds is that much shorter. */
  const below = $derived(Math.round(room * (1 - (SHARES[stop] ?? 1))));

  /** Frames it stands still for before it has come to rest. Our call. */
  const REST_FRAMES = 5;
  let watchingRest = false;
  /**
   * It has moved or is about to, by vaul's animation or its transition, on
   * itself or on what it holds: its place read each frame until it has stood
   * still, then told once. Read at the event, it may not stand there yet: at
   * an animation's end its own transform has only just come back.
   */
  function watchRest() {
    if (watchingRest) {
      return;
    }
    watchingRest = true;
    let last = surface?.getBoundingClientRect().top;
    let still = 0;
    const look = () => {
      const now = surface?.getBoundingClientRect().top;
      still = now === last ? still + 1 : 0;
      last = now;
      if (still < REST_FRAMES) {
        requestAnimationFrame(look);
        return;
      }
      watchingRest = false;
      onmoved?.();
    };
    requestAnimationFrame(look);
  }

  /*
   * A panel's floating head (SideSurface's) yields to the sheet as the
   * sheet's top comes within a head's height of its foot, and is gone by the
   * time the top reaches it (`--head-shown` on the card, 1 down to 0), so the
   * sheet never covers a head still drawn; read
   * every frame the sheet stands open, since vaul moves it by a transform no
   * observer hears. At half its room the head stands whole over the page; at
   * the whole room the sheet is the screen and its own bar stands where the
   * head was, the head gone under it; between, the two bars never overlap.
   * The sheet stands over the head (its host's `z-3`).
   *
   * In the phone's preview sheet (SideSheet's `data-preview-sheet`) the
   * panel is itself a sheet, its grabber over its head: the room starts
   * under the head (the host's `top`), and the head, never covered, stays.
   * Covering it there stood the panel's grabber and the sheet's own one
   * pill on pill over the sheet's bar.
   */
  $effect(() => {
    const at = host;
    const card = at?.closest<HTMLElement>('[data-slot="side-card"]');
    if (!(open && at && card) || card.closest("[data-preview-sheet]")) {
      return;
    }
    // The head's own height: its room, as laid out.
    const headRoom =
      card.querySelector<HTMLElement>('[data-slot="side-head"]')
        ?.offsetHeight || 1;
    let frame = 0;
    const look = () => {
      const top = surface
        ? surface.getBoundingClientRect().top - at.getBoundingClientRect().top
        : headRoom;
      card.style.setProperty(
        "--head-shown",
        String(Math.min(1, Math.max(0, (top - headRoom) / headRoom)))
      );
      frame = requestAnimationFrame(look);
    };
    look();
    return () => {
      cancelAnimationFrame(frame);
      card.style.removeProperty("--head-shown");
    };
  });

  let grabbedAt = 0;
  let dragged = false;
  /** A tap on the grabber steps the sheet to its other stop; a drag is vaul's. */
  async function step() {
    if (dragged) {
      return;
    }
    // vaul ends its release before it takes a new stop.
    await tick();
    stop = stop === 0 ? 1 : 0;
  }
</script>

<div
  bind:this={host}
  class="pointer-events-none absolute inset-x-0 top-0 z-3 bottom-(--keyboard-lift,0px) overflow-clip in-data-preview-sheet:top-(--side-room)"
  data-slot="thread-sheet-host"
  onanimationend={watchRest}
  onanimationstart={watchRest}
  ontransitionend={watchRest}
  ontransitionrun={watchRest}
  {@attach measured}
></div>
<!-- Drawn once its room is measured: its stops are px of it. -->
{#if host && room > 0}
  <Drawer.Root
    container={host}
    handleOnly
    modal={false}
    noBodyStyles
    onOpenChange={(next) => {
      if (!next) {
        onclose();
      }
    }}
    onOpenChangeComplete={(next) => {
      if (!next) {
        onclosed?.();
      }
    }}
    {open}
    shouldScaleBackground={false}
    snapPoints={stops}
    snapToSequentialPoint
    bind:activeSnapPoint={
      () => stops[stop],
      (next) => {
        const at = stops.indexOf(String(next));
        if (at !== -1) {
          stop = at;
        }
      }
    }
  >
    <Drawer.Content
      hosted
      modal={false}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeydown={(event) => {
        event.preventDefault();
        onclose();
      }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      title={label}
      trapFocus={false}
    >
      <!-- The app's bottom sheet, as every drawer on a phone is (the kit's
           DrawerContent, DESIGN.md Sheet): edge to edge on the room's foot,
           its top corners rounded and its hairline along the top edge, the
           raised surface, at both stops; what it holds stands on that one
           surface and brings none of its own. -->
      <div
        bind:this={surface}
        class="relative flex h-(--sheet-shown) min-h-0 flex-col pt-space-3 rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer"
        data-slot="thread-sheet"
        style:--sheet-shown="calc(100% - {below}px)"
        style:--sheet-pb={FOOT}
      >
        <Vaul.Handle
          data-thread-grab
          onclick={step}
          onpointerdown={(event) => {
            grabbedAt = event.clientY;
            dragged = false;
          }}
          onpointermove={(event) => {
            if (Math.abs(event.clientY - grabbedAt) > 8) {
              dragged = true;
            }
          }}
          preventCycle
        />
        <!-- Clipped, never a scroller: what it holds scrolls in its own
             (the rail's rows, a thread's entries), each holding its scroll
             (`overscroll-contain`). A finger's touch-action is read from its
             element up to the nearest scroller (Pointer Events, "Determining
             supported touch behavior"), and as one (`overflow-x: hidden`
             makes `overflow-y` auto) this box handed every pan on the
             Comments sheet's bar and lists back to the browser, past vaul's
             `touch-action: none` on the sheet: with nothing of the sheet's
             to scroll there, the pan went on to the transcript behind. -->
        <div
          class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-2 overflow-clip px-space-3 pt-space-2 pb-(--sheet-pb)"
          data-slot="thread-sheet-body"
        >
          {@render children()}
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
