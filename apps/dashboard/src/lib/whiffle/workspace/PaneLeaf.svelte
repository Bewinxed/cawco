<script lang="ts">
  /**
   * One group: a strip of tabs, the identity bar for whichever is showing,
   * and a slot per conversation stacked behind it.
   *
   * This is the unit the grid splits. Everything that used to be "the session
   * layout" lives here now, once per group rather than once per app, which is
   * what lets two conversations be worked in side by side. The conversations
   * themselves are not this group's to mount: `PaneHost` keeps each one
   * alive once and docks it into the slot here, so a split, a move or a
   * change of grid rearranges the DOM without rebuilding a transcript.
   *
   * Where a finger can swipe between the tabs (`docked`), the group also
   * draws the composer: one, outside the panes the swipe moves, over
   * whichever conversation is the active tab. A swipe then carries only the
   * transcripts; the box being typed in, its focus and its keyboard stay,
   * and when the swipe lands the same box shows the new conversation's
   * draft and sends to its session. Under a cursor each pane draws its own.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { land } from "$lib/whiffle/motion/share.svelte";
  import type { HistorySource } from "../client.svelte";
  import SessionPane from "../SessionPane.svelte";
  import Composer from "../transcript/Composer.svelte";
  import {
    composerBindings,
    groupComposerHeights,
  } from "./composer-dock.svelte";
  import { dropHint, paneDropTarget } from "./dnd.svelte";
  import { slot } from "./dock.svelte";
  import { createSwipe } from "./gesture.svelte";
  import PaneTabs from "./PaneTabs.svelte";
  import { contextOf, type LeafNode, workspace } from "./workspace.svelte";

  let {
    leaf,
    swipeable = false,
    hosted = false,
    docked = false,
  }: {
    leaf: LeafNode;
    /** Only the phone's single group takes the swipe. */
    swipeable?: boolean;
    /** The top bar is drawing this group's tabs; the group draws none of its own. */
    hosted?: boolean;
    /** Tabs here can be swiped under a finger: the group draws the composer, not its panes. */
    docked?: boolean;
  } = $props();

  const swipe = createSwipe(() => leaf.id);

  /** The active conversation, as this group's composer writes to it; none when it cannot be written to. */
  const bound = $derived(
    docked && leaf.active ? composerBindings.get(leaf.active) : undefined
  );
  let composerHeight = $state(0);
  // What this group's panes keep clear at their foot. No composer, no entry.
  $effect(() => {
    if (!bound) {
      return;
    }
    const { id } = leaf;
    groupComposerHeights.set(id, composerHeight);
    return () => {
      groupComposerHeights.delete(id);
    };
  });

  /** What a drop hovering this group would do, if anything. */
  const splitEdge = $derived(dropHint.splits(leaf.id));
  const joins = $derived(dropHint.joins(leaf.id));

  const viewId = $derived(leaf.active ?? "");
  const activeIndex = $derived(leaf.tabs.indexOf(viewId));
  /** A pane's distance from the active tab along the strip; nowhere, with no tab showing. */
  const deltaOf = (paneId: string) =>
    activeIndex < 0 ? Number.NaN : leaf.tabs.indexOf(paneId) - activeIndex;
  /** Whether the reader's keyboard belongs to this group. */
  const isFocusedLeaf = $derived(workspace.focusedLeafId === leaf.id);

  /* ── Slots ─────────────────────────────────────────────────────────
     The showing tab first, then every other open tab in the background,
     and kept, so neither a first visit nor a return waits on a mount. */

  // Seeded with the showing tab so the server and the first client render
  // agree; later tabs are added by the effects below.
  let mounted = $state<string[]>(
    untrack(() => (leaf.active ? [leaf.active] : []))
  );

  $effect.pre(() => {
    const id = viewId;
    if (!id) {
      return;
    }
    untrack(() => {
      if (!mounted.includes(id)) {
        mounted.push(id);
      }
    });
  });

  /**
   * Mount every other open conversation in the background, nearest first,
   * one at a time, once the showing one has settled. A tab clicked for the
   * first time after a reload then finds its pane already built and its
   * history already fetched, and the switch only reveals it; mounting it on
   * the click put the whole pane — fetch, rows, virtualiser — between the
   * click and the paint. Nearest first also parks the swipe neighbours
   * before anything further away. One pane per slot, so no single task
   * carries more than one mount.
   */
  $effect(() => {
    const here = leaf.active;
    if (!here) {
      return;
    }
    const at = leaf.tabs.indexOf(here);
    const queue = leaf.tabs
      .filter((id) => id !== here)
      .sort(
        (a, b) =>
          Math.abs(leaf.tabs.indexOf(a) - at) -
          Math.abs(leaf.tabs.indexOf(b) - at)
      );
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      untrack(() => {
        const id = queue.find((q) => !mounted.includes(q));
        if (!id) {
          return;
        }
        mounted.push(id);
        timer = setTimeout(next, 120);
      });
    };
    timer = setTimeout(next, 120);
    return () => clearTimeout(timer);
  });

  /* ── The switch ────────────────────────────────────────────────────
     On a desktop a tab switch glides the arriving transcript in from the
     side it came from and fades it up, on the strip's own --wipe (260ms)
     and --wipe-ease (--ease-drawer), so the eye reads which way it went.
     Only the showing transcript is painted there, so it alone moves. The
     phone's group is left alone: its swipe already slides the transcripts. */
  /** How far the arriving transcript travels: a cue, not a page turn. */
  const NUDGE_PX = 40;
  const SWITCH_MS = 260;
  const motion = new MediaQuery("(prefers-reduced-motion: no-preference)");
  let stack = $state<HTMLElement>();
  let shownIndex = untrack(() => activeIndex);

  $effect(() => {
    const index = activeIndex;
    const id = viewId;
    untrack(() => {
      const fromIndex = shownIndex;
      shownIndex = index;
      if (
        swipeable ||
        !(stack && motion.current) ||
        index < 0 ||
        fromIndex < 0 ||
        index === fromIndex
      ) {
        return;
      }
      const dir = Math.sign(index - fromIndex);
      stack
        .querySelector<HTMLElement>(
          `:scope > .pane[data-pane="${CSS.escape(id)}"]`
        )
        ?.animate(
          [
            { transform: `translateX(${dir * NUDGE_PX}px)`, opacity: 0.4 },
            { transform: "none", opacity: 1 },
          ],
          {
            duration: SWITCH_MS,
            easing: getComputedStyle(stack).getPropertyValue("--ease-drawer"),
          }
        );
    });
  });

  $effect(() => {
    const open = new Set(leaf.tabs);
    untrack(() => {
      const keep = mounted.filter((id) => open.has(id));
      if (keep.length !== mounted.length) {
        mounted = keep;
      }
    });
  });
</script>

<!-- The whole group answers to a click by taking focus, so typing goes where
     the reader just looked. `focusin` rather than `click`: reaching the
     composer with the keyboard should move focus too. -->
<section
  class="leaf"
  onfocusincapture={() => workspace.focus(leaf.id)}
  onpointerdowncapture={() => workspace.focus(leaf.id)}
  class:leaf-focused={isFocusedLeaf}
>
  <!-- The focus mark is graphite, never the accent: the one loud colour in
       this product means a session is asking for something, and "you are
       typing here" must not compete with it. -->
  <span aria-hidden="true" class="rail"></span>

  {#if !hosted}
    <PaneTabs {leaf} travel={swipe.travel} />
  {/if}

  <!-- Where a dropped conversation would go, shown as the shape it would
       take: half the group when a split is on offer, the whole of it when
       the drop would simply join these tabs. The indicator and the hitbox
       read the same 25% band, so the picture cannot promise something the
       drop will not do. -->
  {#if splitEdge}
    <div aria-hidden="true" class="drop-preview drop-{splitEdge}"></div>
  {:else if joins}
    <div aria-hidden="true" class="drop-preview drop-whole"></div>
  {/if}

  <!-- Every open conversation has a slot, built in the background. Where
       the strip can be swiped, the two neighbours are also painted, parked
       either side, so a swipe reveals a current transcript; a pointer
       cannot swipe, so elsewhere only the active pane is shown. The one a
       committed swipe brings into reach is painted once its settle runs
       (gesture.svelte.ts, `veiled`). -->
  <div
    class="stack"
    bind:this={stack}
    class:swipe={swipeable}
    use:swipe.action={swipeable}
    use:paneDropTarget={leaf.id}
  >
    {#each mounted as paneId (paneId)}
      {@const isActive = paneId === viewId}
      {@const delta = deltaOf(paneId)}
      {@const shown =
        isActive ||
        (swipeable && Math.abs(delta) <= 1 && paneId !== swipe.veiled)}
      {@const ctx = contextOf(paneId)}
      <div
        class="pane"
        data-delta={delta}
        data-pane={paneId}
        inert={!isActive}
        class:pane-hidden={!shown}
        use:slot={{ id: paneId, shown }}
        {@attach land(() => (isActive ? `pane:${paneId}` : undefined), {
          mode: 'clip',
        })}
      >
        <!-- The server paints the conversation here so a reload shows it
             before the bundle runs; on hydration this branch is dropped and
             PaneHost mounts the live pane into the slot. The server has no
             deck composer to lend a session to, so its pane paints its own
             in the same place. -->
        {#if !browser}
          <SessionPane
            browsing={ctx?.machine ?? null}
            browsingCwd={ctx?.cwd ?? ''}
            browsingHarness={ctx?.harness ?? 'claude'}
            docked={false}
            focused={false}
            serverHistory={paneId === page.params.id
              ? ((page.data as { history?: Promise<HistorySource | null> | null }).history ?? null)
              : null}
            serverTail={paneId === page.params.id
              ? ((page.data as { tail?: unknown }).tail ?? null)
              : null}
            viewId={paneId}
            visible={shown}
          />
        {/if}
      </div>
    {/each}
  </div>

  <!-- Outside the stack the swipe moves, over the transcript's share of the
       group: a side preview beside the transcript keeps the rest. -->
  {#if bound}
    <div class="dock" style:width="{bound.transcriptShare * 100}%">
      <Composer
        busy={bound.busy}
        commands={bound.commands}
        draft={bound.draft}
        held={swipe.moving}
        leading={bound.leading}
        mentions={bound.mentions}
        oninterruptsend={bound.oninterruptsend}
        onmenu={bound.onmenu}
        onstop={bound.onstop}
        onsubmit={bound.onsubmit}
        paneVisible={bound.paneVisible}
        previewPhone={bound.previewPhone}
        prompts={bound.prompts}
        sending={bound.sending}
        suggest={bound.suggest}
        bind:height={composerHeight}
      />
    </div>
  {/if}
</section>

<style>
  .leaf {
    /* A split pane can be 370px wide inside a 1400px window, so the chrome
       inside it has to answer to the PANE, not the viewport. Viewport media
       queries are the wrong instrument here and produce exactly what they
       did before this: a full-width identity bar clipped in half. */
    container-type: inline-size;
    container-name: leaf;
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-recess);
  }

  /* Which group the keyboard belongs to, said without colour: a hairline
     rail down the leading edge, and nothing at all on the others. Rank by
     position and weight — the accent budget belongs to "needs you". */
  .rail {
    position: absolute;
    inset: 0 auto 0 0;
    width: 2px;
    background: var(--ink-muted);
    opacity: 0;
    z-index: 2;
    pointer-events: none;
  }
  .leaf-focused .rail {
    opacity: 0.5;
  }

  /* Graphite and a hairline, never the accent — a drop preview is
     structure being proposed, not a session asking for something. */
  .drop-preview {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    background: var(--surface-hover);
    border: 1px solid var(--border-control);
    opacity: 0.9;
  }
  .drop-whole {
    inset: 0;
  }
  .drop-left {
    inset: 0 50% 0 0;
  }
  .drop-right {
    inset: 0 0 0 50%;
  }
  .drop-top {
    inset: 0 0 50% 0;
  }
  .drop-bottom {
    inset: 50% 0 0 0;
  }

  /* The composer's box: it positions itself at the foot of this, and lets
     every touch outside itself through to the transcript. Above the panes,
     under a drop preview, as a pane's own composer was. */
  .dock {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 1;
    pointer-events: none;
  }

  .stack {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .pane {
    position: absolute;
    inset: 0;
    display: flex;
  }
  /* Parked by delta, flush, so the seam between two panes never shows. The
     swipe writes its travel inline over these and clears it after; only a
     pane that can be seen is promised to the compositor.
     Swipe groups only. A desktop pane is never parked or promoted: a
     transcript held on its own GPU layer cannot snap its text to the pixel
     grid, and wherever the rail's width leaves the pane on a fractional x
     the whole transcript reads soft and hazy. The switch glide promotes the
     pane only for its 260ms. */
  .swipe > .pane:not(.pane-hidden) {
    will-change: transform;
  }
  .swipe > .pane[data-delta="-1"] {
    transform: translate3d(-100%, 0, 0);
  }
  .swipe > .pane[data-delta="0"] {
    transform: translate3d(0, 0, 0);
  }
  .swipe > .pane[data-delta="1"] {
    transform: translate3d(100%, 0, 0);
  }

  /* `visibility`, never `display`: a hidden pane still lays out, so the
     virtualiser keeps its measurements and revealing one costs nothing.
     Note what is NOT here — `.pane` does not declare `visibility: visible`.
     Visibility inherits, but a descendant that re-declares `visible`
     un-hides ITSELF through a hidden ancestor, so writing it here made
     every pane paint straight through the surface hiding this whole group,
     and the fleet board and the transcripts rendered on top of each other.
     Only the hidden state is ever stated; the visible one is inherited. */
  /* A pane off screen keeps its DOM, its scroll and its rows — it is still
     streaming — but the browser skips its style, layout and paint entirely.
     `visibility: hidden` left every hidden transcript in each restyle and
     reflow of the group, which is what a tab switch paid for. */
  .pane-hidden {
    content-visibility: hidden;
    pointer-events: none;
  }
</style>
