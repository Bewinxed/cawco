<script lang="ts" module>
  /**
   * The rows hung under a parent in the sidebar's lists (a group's sessions
   * or projects, a session's delegates): one tree step in, on a rail that
   * leaves the parent's mark (app.css .kit-nest, measured by motion/branch
   * `nestFrom`), each row swiping out along its arm as the rail reaches it
   * and folding back the same way (motion/branch). reflow never copies or
   * uncovers what is inside (`data-flip-anchor`). A snippet, so its fold
   * plays as the block around it opens and closes, and not when a regroup
   * builds the block's parent afresh (motion/share `regroup`).
   */
  import type { Snippet } from "svelte";
  import {
    type BranchOptions,
    branch,
    nestFrom,
  } from "../motion/branch.svelte";

  /** How the rows open and fold: off each row's mark. */
  const TREE: BranchOptions = { glyph: "[data-tree-mark]" };

  export { nestList };
</script>

{#snippet nestList(rows: Snippet)}
  <ul
    data-nest
    class="kit-nest m-0 flex min-w-0 list-none flex-col gap-(--tree-gap) p-0 pt-(--tree-gap) ps-(--nest-pad)"
    data-flip-anchor
    in:branch={TREE}
    out:branch={TREE}
    {@attach nestFrom("[data-tree-mark]")}
  >
    {@render rows()}
  </ul>
{/snippet}
