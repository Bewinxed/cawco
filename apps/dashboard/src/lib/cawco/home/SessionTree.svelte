<script lang="ts">
  /**
   * One session of a home list and, open, the sessions under it: the tree
   * every home list draws (Working, Finished, Recent), from one TreeView.
   * The row's box (`data-flip="box"`) takes its rows' room at once and its
   * edge travels to it, what is under it sliding with that edge
   * (motion/rows); they open and fold on its rail (motion/branch). It lists
   * its recent rows, and the rest under one "N older" row, the last on its
   * rail (older.ts).
   *
   * A list owns its container (`.session-tree`), its order and the row it
   * draws (`line`); the nesting, the fold and the older box are here.
   */
  import type { Snippet } from "svelte";
  import type { InstanceRow } from "../client.svelte";
  import {
    type BranchOptions,
    branch,
    nestFrom,
  } from "../motion/branch.svelte";
  import OlderRows from "../OlderRows.svelte";
  import { openTrees } from "../open-trees.svelte";
  import Self from "./SessionTree.svelte";
  import type { TreeView } from "./tree-view.svelte";

  let {
    view,
    row,
    rows,
    line,
    current = null,
    flip = true,
    styleOf,
  }: {
    view: TreeView;
    row: InstanceRow;
    /** The rows the list holds where this one is drawn. */
    rows: InstanceRow[];
    /** The row itself, as the list draws its sessions. */
    line: Snippet<[InstanceRow]>;
    /** The conversation in front. */
    current?: string | null;
    /** Its box is reflow's to move (motion/rows); not while a list drives it. */
    flip?: boolean;
    /** A line's own motion, where the list gives its rows one. */
    styleOf?: (key: string) => string;
  } = $props();

  /** How a parent's rows open and fold (motion/branch): off each row's mark. */
  const TREE: BranchOptions = { glyph: ".tree-mark" };

  const shape = $derived(view.shapeOf(row.id));
  const older = $derived(view.olderOf(row.id));
  const kids = $derived(
    view.under(rows, row.id).filter((kid) => !older?.tops.has(kid.id))
  );
</script>

<li class="tree-node" data-flip={flip ? "box" : undefined}>
  <div class="tree-line" data-key={row.id} style={styleOf?.(row.id)}>
    {#if shape?.parent && shape.depth > 0}
      {@const above = shape.parent}
      <!-- The parent's column: a click on its rail folds it. -->
      <button
        aria-hidden="true"
        class="gutter"
        onclick={() => openTrees.set(above, false, view.list)}
        tabindex="-1"
        type="button"
      ></button>
    {/if}
    {@render line(row)}
  </div>
  {#if kids.length > 0}
    <ul
      class="kit-nest tree-branch"
      data-flip-anchor
      in:branch={TREE}
      out:branch={TREE}
      {@attach nestFrom(".tree-mark")}
    >
      {#each kids as kid (kid.id)}
        <Self {current} {flip} {line} row={kid} {rows} {styleOf} {view} />
      {/each}
      {#if older}
        <!-- It arrives with the last row over it, in a change of the list;
             its own rows are drawn from every row the list draws, since the
             list holds none of them. -->
        <OlderRows
          count={older.count}
          failed={older.failed}
          {flip}
          front={current !== null && older.held.has(current)}
          id={row.id}
          keyOf={(kid) => kid.id}
          list={view.list}
          style={styleOf?.(kids.at(-1)?.id ?? row.id)}
          tall
          trees={view
            .under(view.boxed, row.id)
            .filter((kid) => older.tops.has(kid.id))}
        >
          {#snippet tree(
            kid
          )}
            <Self
              {current}
              {flip}
              {line}
              row={kid}
              rows={view.boxed}
              {styleOf}
              {view}
            />
          {/snippet}
        </OlderRows>
      {/if}
    </ul>
  {/if}
</li>

<style>
  /* A list's trees, and each parent's rows under it: lists of rows,
     --tree-gap apart, the gap every tree in the app keeps (app.css; the
     rail's projects list reads the same one). Named for every list that
     draws this tree, and for a list's own copies of its rows. */
  :global(.session-tree),
  :global(.tree-branch) {
    display: flex;
    flex-direction: column;
    gap: var(--tree-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* A delegate under its session (tree.ts): in a list of its own, set in
     under its parent's glyph and joined to it by the .kit-nest lines (down
     the rail, round the curve, out along the arm to the child's glyph, over
     the row's pill), placed as the sidebar's are (motion/branch `nestFrom`),
     so a tree nests alike in both. */
  :global(.tree-branch) {
    padding-block-start: var(--tree-gap);
    padding-inline-start: var(--nest-pad);
  }
  :global(.tree-node),
  :global(.tree-line) {
    position: relative;
  }
  /* A child's parent column: a click on the rail there folds the parent,
     and the pointer's own cursor says so. It reaches from a step left of
     the rail to the row's own left edge. It draws nothing: a bar that
     darkened the rail under the pointer read as the line itself reacting,
     and a nesting line never changes because the pointer is on it. */
  .gutter {
    position: absolute;
    inset-block: 0;
    left: calc(var(--nest-x) - var(--nest-pad) - var(--space-2));
    z-index: 1;
    inline-size: calc(var(--nest-pad) - var(--nest-x) + var(--space-2));
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
</style>
