<script lang="ts">
  import { tick } from "svelte";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  /**
   * The grid: a tree of splits, drawn recursively.
   *
   * A branch is a paneforge `PaneGroup` running along one axis; a leaf is a
   * group of tabs. Nesting is the whole mechanism — a horizontal group whose
   * child is a vertical group IS an L-shaped layout, so there is no separate
   * concept of a "layout" to keep in step with the tree. What the reader
   * arranges and what gets stored are the same shape.
   *
   * Sizes are written back through `onLayoutChange` rather than left to
   * paneforge's own `autoSaveId`. Two stores for one fact drift: paneforge
   * would keep sizes under a key of its own that survives a tree mutation
   * which reshapes the group, and then apply the old numbers to new children.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { IsCoarsePointer } from "#lib/hooks/is-mobile.svelte.js";
  import { gridView } from "./grid-view.svelte";
  import Self from "./PaneGrid.svelte";
  import PaneLeaf from "./PaneLeaf.svelte";
  import { type PaneNode, workspace } from "./workspace.svelte";

  let { node, nested = false }: { node: PaneNode; nested?: boolean } = $props();

  /**
   * The grid is not only a desk any more: a tablet turned landscape gets it
   * too, and a tablet has fingers. So the tab swipe is armed here as well,
   * on the one group the reader is in — the same rule the deck uses, for the
   * same reason. A swipe is a claim on the whole width of a group, and two
   * groups either side of a split both answering it would make the gesture
   * mean "whichever one you happened to start over".
   *
   * Kept off a cursor rather than left harmless. Touch handlers on a mouse
   * never fire, so the gesture itself costs nothing there, but arming it also
   * mounts and builds the neighbouring tabs so a swipe reveals a transcript
   * instead of a blank frame (PaneLeaf). That work is worth paying for where
   * the swipe exists, and is pure waste where it cannot happen.
   *
   * The same line decides who draws the composer. Where a finger can swipe
   * a group's conversations, the group draws one composer outside them
   * (`PaneLeaf`), so the box never travels with a transcript; under a cursor
   * each pane keeps its own.
   */
  const coarse = new IsCoarsePointer();

  /**
   * One motion for a split opening and closing (--dur-panel,
   * --ease-in-out), on paneforge's own `flex-grow`, the share of the room a
   * group has: the drop's picture, half the group, becomes the group, and
   * closing is the same run backwards.
   *
   * Opening: the new group grows in from the edge it was made at and the
   * groups beside it give the room up. It starts in the flush that drew the
   * group, before its first frame paints, so that frame is already the
   * motion's first. The shares are `node.sizes`, what paneforge was told to
   * draw.
   *
   * Closing: the tree has already lost the group, but the grid goes on
   * drawing it as it was (`ghost`: the same groups in the same boxes, none
   * rebuilt) while the leaving group's share, in whichever branch it was,
   * runs to nothing and the rest grow into the room. Then it draws the tree
   * as it now is. Both run from the shares as they stand, read off the
   * boxes, so a close that comes while a split is still opening carries on
   * from where the groups are.
   */
  const ALL = 100;

  let group = $state<HTMLElement | null>(null);
  /** The root draws what the grid view says (a closed split is still drawn while it collapses); the groups inside draw what the root gives them. */
  const ghost = $derived(gridView.ghost);
  const drawn = $derived(nested ? node : gridView.drawn);
  /** Where this branch's boxes are going, when a group of it left. */
  const leaving = $derived(ghost?.changes.get(drawn.id) ?? null);

  /** The groups' boxes, in order. */
  const panesOf = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLElement>(":scope > [data-pane]"),
  ];

  /** The run each box is on, and between which shares. */
  const moving = new WeakMap<
    HTMLElement,
    { from: number; run: Animation; to: number }
  >();

  /** Runs each box from one share to another. */
  function grow(panes: HTMLElement[], from: number[], to: number[]) {
    return panes.map((pane, i) => {
      const run = pane.animate(
        [{ flexGrow: `${from[i]}` }, { flexGrow: `${to[i]}` }],
        {
          duration: dur("--dur-panel"),
          easing: ease("--ease-in-out"),
          fill: "forwards",
        }
      );
      moving.set(pane, { from: from[i], to: to[i], run });
      return run;
    });
  }

  /**
   * A box's share where it stands: along the run it is on (the eased
   * progress of the animation itself: a computed style read in the middle of
   * a busy frame still says where the run began), else the share it was
   * given.
   */
  function shareOf(pane: HTMLElement): number {
    const on = moving.get(pane);
    if (on) {
      const progress = on.run.effect?.getComputedTiming().progress ?? 1;
      return on.from + (on.to - on.from) * progress;
    }
    return Number.parseFloat(getComputedStyle(pane).flexGrow);
  }

  $effect(() => {
    const el = group;
    const to = leaving;
    if (!(el && to)) {
      return;
    }
    const { id } = drawn;
    const panes = panesOf(el);
    const from = panes.map(shareOf);
    for (const pane of panes) {
      for (const running of pane.getAnimations()) {
        running.cancel();
      }
    }
    const runs = grow(panes, from, to);
    let live = true;
    Promise.all(runs.map((run) => run.finished)).then(
      async () => {
        if (!live) {
          return;
        }
        gridView.finish(id);
        await tick();
        for (const run of runs) {
          run.cancel();
        }
      },
      () => {
        /* cancelled by a change: the grid draws what is true now */
      }
    );
    return () => {
      live = false;
    };
  });

  $effect(() => {
    const el = group;
    if (!el || node.t !== "b" || ghost) {
      return;
    }
    const made = node.kids.findIndex((kid) => workspace.takeFresh(kid.id));
    if (made < 0 || !motionOk.current) {
      return;
    }
    const to = [...node.sizes];
    const room = ALL - to[made];
    const from = to.map((share, i) => (i === made ? 0 : (share * ALL) / room));
    const runs = grow(panesOf(el), from, to);
    Promise.all(runs.map((run) => run.finished)).then(
      () => {
        for (const run of runs) {
          run.cancel();
        }
      },
      () => {
        /* a close took it over, from where the boxes stand */
      }
    );
  });
</script>

{#if drawn.t === "l"}
  <PaneLeaf
    hosted={gridView.hosts(drawn.id)}
    leaf={drawn}
    swipeable={coarse.current && workspace.focusedLeafId === drawn.id}
  />
{:else}
  <Resizable.PaneGroup
    class="grid-group"
    direction={drawn.dir === "h" ? "horizontal" : "vertical"}
    onLayoutChange={(sizes) => {
      if (!ghost) {
        workspace.resize(drawn.id, sizes);
      }
    }}
    bind:ref={group}
  >
    {#each drawn.kids as kid, i (kid.id)}
      {#if i > 0}
        <Resizable.Handle />
      {/if}
      <Resizable.Pane
        class="grid-pane"
        defaultSize={drawn.sizes[i] ?? 100 / drawn.kids.length}
        minSize={12}
      >
        <Self nested node={kid} />
      </Resizable.Pane>
    {/each}
  </Resizable.PaneGroup>
{/if}

<style>
  /* paneforge sizes a pane with flex-basis and leaves its INSIDE to the
     consumer, so without this the group inside collapses to the height of
     its own chrome — a strip and a header with nothing under them. */
  :global(.grid-pane) {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* The divider is a hairline that thickens only under a pointer that is
     actually going to grab it — structure at rest, an affordance on approach. */
  :global(.grid-group [data-pane-resizer]) {
    background: var(--border-hairline);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.grid-group [data-pane-resizer]:hover) {
      background: var(--border-control);
    }
  }
  :global(.grid-group [data-pane-resizer][data-active="pointer"]),
  :global(.grid-group [data-pane-resizer][data-active="keyboard"]) {
    background: var(--ink-muted);
  }
  /* A drag tracks the pointer 1:1. A step from the keyboard (paneforge
     marks its divider `keyboard` while it holds focus) is a jump, so the
     groups either side tween to it at the control tier. */
  @media (prefers-reduced-motion: no-preference) {
    :global(
      .grid-group:has(> [data-pane-resizer][data-active="keyboard"])
        > .grid-pane
    ) {
      transition: flex-grow var(--dur-control) var(--ease-out);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.grid-group [data-pane-resizer]) {
      transition: none;
    }
  }
</style>
