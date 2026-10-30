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
    surface = $bindable(),
    children,
  }: {
    open: boolean;
    /** What it holds, read out: the sheet's name. */
    label: string;
    /** Close, Escape, or the sheet dragged below its lower stop. */
    onclose: () => void;
    /** The sheet as drawn: what covers the page, for its holder to tell. */
    surface?: HTMLElement;
    children: Snippet;
  } = $props();

  /** Its stops, as shares of its room: half, where it opens (the thread's head and the reply in view), and the whole room, to read a long thread. */
  const SHARES = [0.5, 1];
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
  class="pointer-events-none absolute inset-x-0 top-0 bottom-(--keyboard-lift,0px) overflow-clip"
  data-slot="thread-sheet-host"
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
        <div
          class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-2 overflow-x-hidden px-space-3 pt-space-2 pb-(--sheet-pb)"
          data-slot="thread-sheet-body"
        >
          {@render children()}
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
