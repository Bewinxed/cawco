<script lang="ts">
  /**
   * A comment's thread as a bottom sheet: on a phone and under a finger, in
   * a preview's well (PreviewPane) and over a conversation (CommentChip).
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
  import { frameSize } from "../frame-observer";

  let {
    open,
    label,
    onclose,
    onclosed,
    onmoved,
    surface = $bindable(),
    short = false,
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
    /** What it holds is a line or two (an empty list): its lower stop is low enough to hold that, never half its room standing empty. */
    short?: boolean;
    children: Snippet;
  } = $props();

  /** Its stops, as shares of its room: half, where it opens (the thread's head and the reply in view), and the whole room, to read a long thread. */
  const HALF = [0.5, 1];
  /** Holding a line or two: its bar and that line, and the whole room. Our call: under a quarter, which holds the bar and a line on a phone of 640px or taller. */
  const LOW = [0.22, 1];
  const SHARES = $derived(short ? LOW : HALF);
  /** Its foot clears the home indicator. */
  const FOOT = "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))";

  let host = $state<HTMLDivElement>();
  let room = $state(0);
  const measured = frameSize<HTMLDivElement>((node) => {
    room = node.offsetHeight;
  });
  /** The stops as vaul takes them: px of the room as measured. */
  const stops = $derived(
    SHARES.map((share) => `${Math.round(room * share)}px`)
  );
  /** The stop it stands at, by its place in `SHARES`. */
  let stop = $state(0);
  // Each opening starts at half its room.
  $effect(() => {
    if (open) {
      untrack(() => {
        stop = 0;
      });
    }
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
   * A panel's floating head (SideSurface `float`) yields to the sheet as the
   * sheet's top comes within a head's height of its foot, and is gone by the
   * time the top reaches it (`--head-shown` on the card, 1 down to 0), so the
   * sheet never covers a head still drawn; read
   * every frame the sheet stands open, since vaul moves it by a transform no
   * observer hears. At half its room the head stands whole over the page; at
   * the whole room the sheet is the screen and its own bar stands where the
   * head was, the head gone under it; between, the two bars never overlap.
   * The sheet stands over the head (its host's `z-3`).
   */
  $effect(() => {
    const at = host;
    const card = at?.closest<HTMLElement>('[data-slot="side-card"]');
    if (!(open && at && card)) {
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
  class="pointer-events-none absolute inset-x-0 top-0 z-3 bottom-(--keyboard-lift,0px) overflow-clip"
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
      <!-- At half its room it floats as glass, inset from the room's sides
           and foot with corners concentric with the screen's glass, the page
           peeking round it; at the whole room it meets the edges and turns
           opaque (Adopting Liquid Glass: "half sheets are inset from the edge
           of the display to allow content to peek through from beneath them.
           When a half sheet expands to full height, it transitions to a more
           opaque appearance"). -->
      <div
        bind:this={surface}
        class="relative flex h-(--sheet-shown) min-h-0 flex-col pt-space-3 rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer motion-safe:transition-[margin,border-radius,background-color] motion-safe:duration-(--dur-panel) motion-safe:ease-drawer data-inset:mx-space-2 data-inset:rounded-(--c-float-inner-r) data-inset:border data-inset:bg-material-panel data-inset:glass-backdrop reduced-transparency:data-inset:bg-surface-raised reduced-transparency:data-inset:backdrop-filter-none"
        data-inset={stop === 0 || undefined}
        data-slot="thread-sheet"
        style:--sheet-shown="calc(100% - {below}px - {stop === 0
          ? 'var(--space-2)'
          : '0px'})"
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
        <div
          class="kit-edge-fade-block flex min-h-0 min-w-0 flex-1 flex-col gap-space-2 overflow-x-hidden px-space-3 pt-space-2 pb-(--sheet-pb)"
          data-slot="thread-sheet-body"
        >
          {@render children()}
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
