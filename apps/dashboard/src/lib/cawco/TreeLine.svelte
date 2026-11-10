<script lang="ts">
  /**
   * A tree row's share of the nesting lines (design.css `kit-tree-line`,
   * tree-lines.ts): the rail of each level above it whose line runs on past
   * it, then its own elbow, from the gap above it (or from its parent's
   * glyph, as a first child) round to its glyph, and its own rail on to its
   * next sibling. Every stroke is the row's own box, so it stands, moves
   * and leaves with the row. A stroke's level (`--k`) places it: a level's
   * rail stands under the glyphs of the rows one level up. The fold draws
   * them in and out (motion/branch).
   */
  import type { Line } from "./tree-lines";

  let { line }: { line: Line } = $props();
</script>

<span
  aria-hidden="true"
  class="kit-tree-line"
  data-tree-line
  style:--line-d={line.depth}
>
  {#each line.rails as level (level)}
    <span
      data-line-level={level}
      data-line-rail
      style:--k={level}
      style:--rail-c="var(--rail-c-{level})"
      style:--rail-s="var(--rail-s-{level})"
    ></span>
  {/each}
  {#if line.depth > 0}
    <span data-line-elbow data-line-level={line.depth} style:--k={line.depth}
    ></span>
    {#if !line.last}
      <span data-line-level={line.depth} data-line-on style:--k={line.depth}
      ></span>
    {/if}
  {/if}
</span>
