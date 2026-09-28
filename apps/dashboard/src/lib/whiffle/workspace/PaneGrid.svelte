<script lang="ts">
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
  import * as Resizable from "$lib/components/ui/resizable";
  import { IsCoarsePointer } from "$lib/hooks/is-mobile.svelte";
  import { dur, ease, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import Self from "./PaneGrid.svelte";
  import PaneLeaf from "./PaneLeaf.svelte";
  import { type PaneNode, workspace } from "./workspace.svelte";

  let { node }: { node: PaneNode } = $props();

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
   * A split grows its new group in from the edge it was made at, and the
   * groups beside it give the room up as it does (--dur-panel,
   * --ease-in-out): the drop's picture, half the group, becomes the group.
   * The shares are paneforge's own `flex-grow`, read once it has laid the
   * new group out; the animation runs from where the room was before — none
   * for the new group, and for the others the whole of what they shared —
   * to there, in the next frame's callbacks, so the first frame painted is
   * already its first.
   */
  let group = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = group;
    if (node.t !== "b" || !el) {
      return;
    }
    const made = node.kids.findIndex((kid) => workspace.takeFresh(kid.id));
    if (made < 0 || !motionOk.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const panes = [
        ...el.querySelectorAll<HTMLElement>(":scope > [data-pane]"),
      ];
      const now = panes.map((pane) => Number.parseFloat(pane.style.flexGrow));
      const room = 100 - now[made];
      panes.forEach((pane, i) => {
        const from = i === made ? 0 : (now[i] * 100) / room;
        pane.animate([{ flexGrow: `${from}` }, { flexGrow: `${now[i]}` }], {
          duration: dur("--dur-panel"),
          easing: ease("--ease-in-out"),
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#if node.t === 'l'}
  <PaneLeaf
    docked={coarse.current}
    hosted={workspace.root.id === node.id}
    leaf={node}
    swipeable={coarse.current && workspace.focusedLeafId === node.id}
  />
{:else}
  <Resizable.PaneGroup
    class="grid-group"
    direction={node.dir === 'h' ? 'horizontal' : 'vertical'}
    onLayoutChange={(sizes) => workspace.resize(node.id, sizes)}
    bind:ref={group}
  >
    {#each node.kids as kid, i (kid.id)}
      {#if i > 0}
        <Resizable.Handle />
      {/if}
      <Resizable.Pane
        class="grid-pane"
        defaultSize={node.sizes[i] ?? 100 / node.kids.length}
        minSize={12}
      >
        <Self node={kid} />
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
