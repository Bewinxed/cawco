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
    motionOf,
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
    /** A line's own motion, as an `animation` value, where the list gives its rows one. */
    motionOf?: (key: string) => string | undefined;
  } = $props();

  /** How a parent's rows open and fold (motion/branch): off each row's mark. */
  const TREE: BranchOptions = { glyph: '[data-slot="tree-mark"]' };

  const shape = $derived(view.shapeOf(row.id));
  const motion = $derived(motionOf?.(row.id));
  const older = $derived(view.olderOf(row.id));
  const kids = $derived(
    view.under(rows, row.id).filter((kid) => !older?.tops.has(kid.id))
  );
</script>

<li data-slot="tree-node" class="relative" data-flip={flip ? "box" : undefined}>
  <div
    data-slot="tree-line"
    class={["relative", motion && "animate-(--swap-anim)"]}
    data-key={row.id}
    style:--swap-anim={motion}
  >
    {#if shape?.parent && shape.depth > 0}
      {@const above = shape.parent}
      <!-- The parent's column: a click on its rail folds it, and the
           pointer's own cursor says so. It reaches from a step left of the
           rail to the row's own left edge. It draws nothing: a bar that
           darkened the rail under the pointer read as the line itself
           reacting, and a nesting line never changes because the pointer is
           on it. -->
      <button
        aria-hidden="true"
        class="absolute inset-y-0 left-(--gutter-start) z-1 w-(--gutter-w) p-0 border-none border-current bg-transparent cursor-pointer"
        onclick={() => openTrees.set(above, false, view.list)}
        style:--gutter-start={"calc(var(--nest-x) - var(--nest-pad) - var(--space-2))"}
        style:--gutter-w="calc(var(--nest-pad) - var(--nest-x) + var(--space-2))"
        tabindex="-1"
        type="button"
      ></button>
    {/if}
    {@render line(row)}
  </div>
  {#if kids.length > 0}
    <!-- A delegate under its session (tree.ts): in a list of its own, set in
         under its parent's glyph and joined to it by the .kit-nest lines
         (down the rail, round the curve, out along the arm to the child's
         glyph, over the row's pill), placed as the sidebar's are
         (motion/branch `nestFrom`), so a tree nests alike in both. -->
    <ul
      data-slot="tree-branch"
      class="kit-nest flex flex-col gap-(--tree-gap) m-0 pt-(--tree-gap) pb-0 ps-(--nest-pad) pe-0 list-none"
      data-flip-anchor
      in:branch={TREE}
      out:branch={TREE}
      {@attach nestFrom('[data-slot="tree-mark"]')}
    >
      {#each kids as kid (kid.id)}
        <Self {current} {flip} {line} {motionOf} row={kid} {rows} {view} />
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
          motion={motionOf?.(kids.at(-1)?.id ?? row.id)}
          tall
          trees={view
            .under(view.boxed, row.id)
            .filter((kid) => older.tops.has(kid.id))}
        >
          {#snippet tree(kid)}
            <Self
              {current}
              {flip}
              {line}
              {motionOf}
              row={kid}
              rows={view.boxed}
              {view}
            />
          {/snippet}
        </OlderRows>
      {/if}
    </ul>
  {/if}
</li>
