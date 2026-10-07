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
   * The group also draws the composer: one, outside the panes, over
   * whichever conversation is the active tab. A tab switch or a swipe
   * changes only the transcript; the box being typed in, its focus and its
   * keyboard stay, and the same box then shows the new conversation's draft
   * and sends to its session.
   */
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import {
    dur,
    ease,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import WorkflowRunView from "#lib/components/features/workflows/WorkflowRunView.svelte";
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import type { ServerTail } from "../client.svelte";
  import SessionPane from "../SessionPane.svelte";
  import { isThreadTab } from "../thread-tabs";
  import Composer from "../transcript/Composer.svelte";
  import TranscriptSkeleton from "../transcript/TranscriptSkeleton.svelte";
  import { runIdOf } from "../workflow-runs";
  import { composerBindings } from "./composer-dock.svelte";
  import { dropHint, paneDropTarget } from "./dnd.svelte";
  import { slot } from "./dock.svelte";
  import { createSwipe } from "./gesture.svelte";
  import PaneTabs from "./PaneTabs.svelte";
  import { contextOf, type LeafNode, workspace } from "./workspace.svelte";

  let {
    leaf,
    swipeable = false,
    hosted = false,

    /** Only the phone's single group takes the swipe. */
    /** The top bar is drawing this group's tabs; the group draws none of its own. */
  }: { leaf: LeafNode; swipeable?: boolean; hosted?: boolean } = $props();

  const swipe = createSwipe(() => leaf.id);

  /** The active conversation, as this group's composer writes to it; none when it cannot be written to. */
  const bound = $derived(
    leaf.active ? composerBindings.get(leaf.active) : undefined
  );

  /**
   * What a drop hovering this group would do, as the box it would fill:
   * half the group when a split is on offer, the whole of it when the drop
   * would join these tabs, nothing when no drop is over it.
   */
  const INSETS = {
    left: "0 50% 0 0",
    right: "0 0 0 50%",
    top: "0 0 50% 0",
    bottom: "50% 0 0 0",
  } as const;
  const previewInset = $derived.by(() => {
    const edge = dropHint.splits(leaf.id);
    if (edge) {
      return INSETS[edge];
    }
    return dropHint.joins(leaf.id) ? "0" : null;
  });
  /** The preview fades at the control tier. Opacity only, so it runs with or without motion. */
  function previewFade(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${0.9 * t}`,
    };
  }

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
   *
   * Each mount is a whole transcript built in one task, ~100ms on a long
   * one, and a click that lands during it waits for it. So they start only
   * once the strip has been left alone for `QUIET` — every open, close or
   * switch starts the wait again — and stand `GAP` apart, so a hand going
   * back to the strip mid-queue finds the page free more often than not.
   * Where the group swipes, the first of them is a neighbour the next swipe
   * reveals, so the queue starts at once there (`SOON`).
   */
  const QUIET = 800;
  const SOON = 120;
  const GAP = 300;
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
        timer = setTimeout(next, GAP);
      });
    };
    timer = setTimeout(next, swipeable ? SOON : QUIET);
    return () => clearTimeout(timer);
  });

  /* ── The switch ────────────────────────────────────────────────────
     Where the group can be swiped, a tab chosen any other way — a tap on
     the strip, a key, a jump — lands the way a swipe does: the panes slide
     by their distance on the swipe's own spring (gesture.svelte.ts,
     `prepare` and `arrive`). Elsewhere the arriving transcript glides in
     from the side of the tab it came from and fades up, on the strip's own
     --wipe (260ms) and --wipe-ease (--ease-drawer), so the eye reads which
     way it went. The side is read off the strip as it was before the
     switch, so a tab that closed still says where it stood. Only the
     showing transcript is painted there, so it alone moves. */
  /** How far the arriving transcript travels: a cue, not a page turn. */
  const NUDGE_PX = 40;
  const SWITCH_MS = 260;
  let stack = $state<HTMLElement>();
  /** What the group last showed, and its strip then. Not reactive: only the effects below read them. */
  let shownId = untrack(() => viewId);
  let shownTabs = untrack(() => [...leaf.tabs]);
  /** A switch between two tabs that were both already in the strip, the one left still open. */
  const tabSwitch = (from: string, to: string) =>
    from !== to && leaf.tabs.includes(from) && shownTabs.includes(to);

  /**
   * Which way the last switch went along the strip: 1 to a tab on the
   * right, -1 to one on the left, 0 when either end is not on it. Read off
   * the strip as it was, else as it is, and set before the switch renders,
   * so the composer handed the new draft in that same pass knows the side.
   */
  let switchDir = $state(0);

  /**
   * The last switch's transcript motion, for the composer: it keeps the
   * height it had until `done`, so a field fitting the new draft never
   * moves a transcript that is still sliding in. `done` settles when the
   * glide or the swipe's settle lands, at once when none runs, and when a
   * newer switch takes over; `ms` is how long the motion has left.
   */
  let landing = $state<{ done: Promise<void>; ms: () => number }>({
    done: Promise.resolve(),
    ms: () => 0,
  });
  let landed: () => void = () => undefined;

  // Before the switch renders, so what the settle paints is decided in the
  // same pass as the switch itself and no pane is revealed and hidden again.
  $effect.pre(() => {
    const id = viewId;
    untrack(() => {
      const from = shownId;
      if (!(from && id) || from === id) {
        return;
      }
      const order = [shownTabs, leaf.tabs].find(
        (tabs) => tabs.includes(from) && tabs.includes(id)
      );
      switchDir = order
        ? Math.sign(order.indexOf(id) - order.indexOf(from))
        : 0;
      landed();
      const settle = swipeable && tabSwitch(from, id);
      landing = {
        done: new Promise((resolve) => {
          landed = resolve;
        }),
        ms: () => (settle ? swipe.settleMs : SWITCH_MS),
      };
      if (settle) {
        swipe.prepare(from, id);
      }
    });
  });

  // A swipe's settle has landed.
  $effect(() => {
    if (swipeable && !swipe.moving) {
      untrack(() => landed());
    }
  });

  // The glide is started in the next frame's callbacks, never in the task
  // that made the switch: the pane it moves is found and animated before
  // that frame's style, so the first frame the arriving transcript paints is
  // already the glide's first.
  $effect(() => {
    const id = viewId;
    const tabs = [...leaf.tabs];
    let frame = 0;
    /** This switch's landing, until its glide has started. */
    let unstarted: (() => void) | null = null;
    untrack(() => {
      const from = shownId;
      const settle = swipeable && tabSwitch(from, id);
      shownId = id;
      shownTabs = tabs;
      if (!(from && id) || from === id) {
        return;
      }
      if (settle) {
        swipe.arrive(from, id);
        if (!swipe.moving) {
          landed();
        }
        return;
      }
      const track = stack;
      const dir = switchDir;
      if (!(dir && track && motionOk.current)) {
        landed();
        return;
      }
      const done = landed;
      unstarted = done;
      frame = requestAnimationFrame(() => {
        unstarted = null;
        const glide = track
          .querySelector<HTMLElement>(
            `:scope > .pane[data-pane="${CSS.escape(id)}"]`
          )
          ?.animate(
            [
              { transform: `translateX(${dir * NUDGE_PX}px)`, opacity: 0.4 },
              { transform: "none", opacity: 1 },
            ],
            { duration: SWITCH_MS, easing: ease("--ease-drawer") }
          );
        if (glide) {
          glide.finished.then(done, done);
        } else {
          done();
        }
      });
    });
    // A glide that never started never lands: its composer lets go now.
    return () => {
      cancelAnimationFrame(frame);
      unstarted?.();
    };
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
  data-leaf={leaf.id}
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
       drop will not do. One box, so moving between halves morphs it from
       one shape to the next instead of swapping boxes. -->
  {#if previewInset}
    <div
      aria-hidden="true"
      class="drop-preview"
      style:inset={previewInset}
      transition:previewFade
    ></div>
  {/if}

  <!-- Every open conversation has a slot, built in the background. Where
       the strip can be swiped, the two neighbours are also painted, parked
       either side, so a swipe reveals a current transcript; a pointer
       cannot swipe, so elsewhere only the active pane is shown. The ones a
       committed swipe or a tap brings into reach are painted once its
       settle runs, and a tap that jumps along the strip keeps the pane it
       left painted until it lands (gesture.svelte.ts, `veiled`, `leaving`). -->
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
        (swipeable &&
          ((Math.abs(delta) <= 1 && !swipe.veiled.includes(paneId)) ||
            paneId === swipe.leaving))}
      {@const ctx = contextOf(paneId)}
      <div
        class="pane"
        data-delta={delta}
        data-pane={paneId}
        inert={!isActive}
        class:pane-hidden={!shown}
        use:slot={{ id: paneId, shown }}
        {@attach land(() => (isActive ? `pane:${paneId}` : undefined), {
          mode: "clip",
        })}
      >
        <!-- The server paints the conversation here so a reload shows it
             before the bundle runs; on hydration this branch is dropped and
             PaneHost mounts the live pane into the slot. The server has no
             group composer to lend a session to, so its pane paints its own
             in the same place. -->
        {#if !browser && runIdOf(paneId)}
          <WorkflowRunView runId={runIdOf(paneId) ?? ""} />
        {:else if !browser && isThreadTab(paneId)}
          <!-- A thread's messages are read by its pane, in the browser. -->
          <TranscriptSkeleton />
        {:else if !browser}
          <SessionPane
            browsing={ctx?.machine ?? null}
            browsingCwd={ctx?.cwd ?? ""}
            browsingHarness={ctx?.harness ?? "claude"}
            focused={false}
            serverTail={paneId === page.params.id
              ? ((page.data as { tail?: ServerTail | null }).tail ?? null)
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
        agentName={bound.agentName}
        busy={bound.busy}
        commands={bound.commands}
        delegatesOf={bound.delegatesOf}
        draft={bound.draft}
        held={swipe.moving}
        {landing}
        leading={bound.leading}
        mentions={bound.mentions}
        oninterruptsend={bound.oninterruptsend}
        onmenu={bound.onmenu}
        onstop={bound.onstop}
        onsubmit={bound.onsubmit}
        paneVisible={bound.paneVisible}
        perch={bound.perch}
        placeholder={bound.placeholder}
        planRing={bound.planRing}
        previewPhone={bound.previewPhone}
        prompts={bound.prompts}
        recallOf={bound.recallOf}
        sendError={bound.sendError}
        sending={bound.sending}
        suggest={bound.suggest}
        {switchDir}
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
  @media (prefers-reduced-motion: no-preference) {
    .rail {
      transition: opacity var(--dur-control) var(--ease-out);
    }
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

    @media (prefers-reduced-motion: no-preference) {
      transition: inset var(--dur-morph) var(--ease-in-out);
    }
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
