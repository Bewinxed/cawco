<script lang="ts">
  /**
   * A session's mark: the tree mark (TreeMark) with the session's sprite as
   * its face, on its project's hue. The same tile in every list that names
   * a session; its deck, count, switch, echo and status dot are the tree
   * mark's, and the row says the status in its name (session-status.ts
   * `statusWord`). It reads no fleet: what it draws comes in its props.
   */
  import type { ThreadStatus } from "@cawco/core";
  import CawFace from "./home/CawFace.svelte";
  import { markHue, sessionSprite } from "./mark";
  import TreeMark, { type MarkStatus } from "./TreeMark.svelte";

  let {
    id,
    place,
    status,
    caw = null,
    count = 0,
    open = false,
    ontoggle,
  }: {
    /** The session, for its sprite. */
    id: string;
    /** Where it runs (its cwd, or its machine), for its hue. */
    place: string;
    status: MarkStatus;
    /** A thread's: Caw at what it is doing, its face instead of a sprite (session-status.ts `cawOf`). */
    caw?: ThreadStatus | null;
    /** The delegates under it, at every depth. */
    count?: number;
    /** Its delegates' rows are out. */
    open?: boolean;
    /** Opens and folds them; without it the mark only says the count. */
    ontoggle?: () => void;
  } = $props();

  const Sprite = $derived(sessionSprite(id));
</script>

<TreeMark
  {count}
  faceAlways={caw !== null}
  fill="var(--mark-{markHue(place)})"
  {ontoggle}
  {open}
  {status}
>
  {#snippet face()}
    {#if caw}
      <CawFace size={14} status={caw} />
    {:else}
      <Sprite aria-hidden="true" class="session-mark-glyph" />
    {/if}
  {/snippet}
</TreeMark>

<style>
  :global(.session-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
</style>
