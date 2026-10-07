<script lang="ts" module>
  import { STOPPED_LABEL } from "./activity";
  import { cawco, type InstanceRow, isFailed, isStale } from "./client.svelte";
  import TreeMark, { type MarkStatus as TreeStatus } from "./TreeMark.svelte";

  /** What a session is doing, as its mark says it. */
  export type MarkStatus = TreeStatus;
  const STATUS_WORD: Record<MarkStatus, string> = {
    live: "Working",
    attn: "Needs you",
    done: "Finished",
    fail: "Failed",
    idle: "Idle",
  };

  /**
   * A session's status word, for its row's accessible name: colour is never
   * the only signal. A session the operator stopped says so; its mark is an
   * ended session's (no dot, no echo), so the word is where it differs.
   */
  export function statusWord(
    instance: InstanceRow | null | undefined,
    status: MarkStatus
  ): string {
    return instance?.status === "stopped" ? STOPPED_LABEL : STATUS_WORD[status];
  }

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
   * mark's, and the row says the status in its name (`statusWord`).
   */
  import CawFace from "./home/CawFace.svelte";
  import { markHue, sessionSprite } from "./mark";
  import { isThreadTab } from "./thread-tabs";

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
  /** A thread's mark is Caw at what the thread is doing (thread-tabs.ts). */
  const caw = $derived(
    isThreadTab(id) ? (cawco.threadOf(id)?.status ?? "ready") : null
  );
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
