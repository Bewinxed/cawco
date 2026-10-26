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

  /** Where it opens: half its room, the thread's head and the reply in view. */
  const HALF = 0.5;
  /** The whole room, to read a long thread. */
  const WHOLE = 1;
  const STOPS = [HALF, WHOLE];
  /** Its foot clears the home indicator. */
  const FOOT = "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))";

  let host = $state<HTMLDivElement>();
  let room = $state(0);
  const measured = frameSize<HTMLDivElement>((node) => {
    room = node.offsetHeight;
  });
  let snap = $state<number | string | null>(HALF);
  // Each opening starts at half its room.
  $effect(() => {
    if (open) {
      untrack(() => {
        snap = HALF;
      });
    }
  });
  /** How much of the sheet stands below its room at its stop: what it holds is that much shorter. */
  const below = $derived(
    typeof snap === "number" ? Math.round(room * (1 - snap)) : 0
  );

  let grabbedAt = 0;
  let dragged = false;
  /** A tap on the grabber steps the sheet to its other stop; a drag is vaul's. */
  async function step() {
    if (dragged) {
      return;
    }
    // vaul ends its release before it takes a new stop.
    await tick();
    snap = snap === WHOLE ? HALF : WHOLE;
  }
</script>

<div
  bind:this={host}
  class="pointer-events-none absolute inset-x-0 top-0 bottom-(--keyboard-lift,0px) overflow-clip"
  data-slot="thread-sheet-host"
  {@attach measured}
></div>
{#if host}
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
    snapPoints={STOPS}
    snapToSequentialPoint
    bind:activeSnapPoint={snap}
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
