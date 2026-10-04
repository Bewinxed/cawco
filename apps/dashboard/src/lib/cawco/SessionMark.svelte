<script lang="ts" module>
  import { cawco, type InstanceRow, isFailed, isStale } from "./client.svelte";
  import TreeMark, { type MarkStatus as TreeStatus } from "./TreeMark.svelte";

  /** What a session is doing, as its mark says it. */
  export type MarkStatus = TreeStatus;
  /** Its word, for the row's accessible name: colour is never the only signal. */
  export const STATUS_WORD: Record<MarkStatus, string> = {
    live: "Working",
    attn: "Needs you",
    done: "Finished",
    fail: "Failed",
    idle: "Idle",
  };

  /**
   * A session's status, one rule for every row that draws its mark. `done`:
   * the row is listed as finished, so a session at rest there is done rather
   * than idle.
   */
  export function sessionStatus(
    instance: InstanceRow | null | undefined,
    done = false
  ): MarkStatus {
    if (!instance) {
      return "idle";
    }
    if (isFailed(instance)) {
      return "fail";
    }
    if (isStale(instance)) {
      return "idle";
    }
    // At rest with no process: a session put to sleep, or a workflow run
    // that ended and stopped. Listed as finished, it is done.
    if (instance.status === "sleeping" || instance.status === "stopped") {
      return done ? "done" : "idle";
    }
    const activity = cawco.activityOf(instance.id);
    if (activity === "blocked") {
      return "attn";
    }
    if (activity === "working") {
      return "live";
    }
    return done ? "done" : "idle";
  }
</script>

<script lang="ts">
  /**
   * A session's mark: the tree mark (TreeMark) with the session's sprite as
   * its face, on its project's hue. The same tile in every list that names
   * a session; its deck, count, switch, echo and status dot are the tree
   * mark's, and the row says the status in its name (`STATUS_WORD`).
   */
  import { markHue, sessionSprite } from "./mark";

  let {
    id,
    place,
    status,
    count = 0,
    open = false,
    ontoggle,
  }: {
    /** The session, for its sprite. */
    id: string;
    /** Where it runs (its cwd, or its machine), for its hue. */
    place: string;
    status: MarkStatus;
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
  fill="var(--mark-{markHue(place)})"
  {ontoggle}
  {open}
  {status}
>
  {#snippet face()}
    <Sprite aria-hidden="true" class="session-mark-glyph" />
  {/snippet}
</TreeMark>

<style>
  :global(.session-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
</style>
