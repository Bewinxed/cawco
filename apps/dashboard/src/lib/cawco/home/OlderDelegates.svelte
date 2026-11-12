<script generics="R" lang="ts">
  /**
   * A session's older delegates, in a box of their own under its row
   * (OlderRows), for every flat tree in the rail that hangs sessions
   * (Recent's, a project's running ones): the count and failures the box
   * says, whether the conversation in front is in it, and its trees only
   * while they are out.
   */
  import type { Snippet } from "svelte";
  import OlderRows from "../OlderRows.svelte";
  import { failedIn } from "../older";
  import type { TreeList } from "../open-trees.svelte";
  import type { FlatRow } from "../tree-lines";
  import { type Branch, inFront, rowsIn } from "./session-branches";

  let {
    own,
    active,
    list,
    out,
    flatten,
    row,
  }: {
    /** The session whose older delegates these are. */
    own: Branch;
    /** The conversation in front. */
    active: string | null;
    list: TreeList;
    /** Its rows are out. */
    out: boolean;
    /** The older trees as the list's own flat rows. */
    flatten: (trees: Branch[]) => FlatRow<R>[];
    /** How the list draws one of its rows. */
    row: Snippet<[FlatRow<R>]>;
  } = $props();
</script>

<OlderRows
  count={rowsIn(own.older)}
  failed={failedIn(own.older.flatMap((held) => [held.row, ...held.under]))}
  {flatten}
  front={inFront(own.older, active)}
  id={own.row.id}
  {list}
  {row}
  trees={out ? own.older : []}
/>
