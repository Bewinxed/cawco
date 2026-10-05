<script lang="ts">
  /**
   * A session's transcript drawn inside another view, in a recessed well of
   * its own: what a delegate's card opens onto in its parent's chat, and what
   * a workflow step opens onto under its run. The rows come from the store
   * (the host watches and reads the session as it opens), are drawn a unit
   * at a time as the panel opens (CollapsibleLazy), and a read that failed
   * is said, never drawn as an empty transcript.
   *
   * The well reaches out past the host's text column by its padding, so the
   * rows inside repeat the transcript's columns from that column; the host
   * says where the well stands with `--well-at`.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import CollapsibleLazy from "#lib/components/ui/collapsible/collapsible-lazy.svelte";
  import { cawco, readOlderPage, readTranscript } from "../client.svelte";
  import CompactionDivider from "./CompactionDivider.svelte";
  import Delegate from "./Delegate.svelte";
  import MessageBody from "./MessageBody.svelte";
  import MessageRow from "./MessageRow.svelte";
  import RunBlock from "./RunBlock.svelte";
  import { foldMessages, newestCompaction, wellRuns } from "./rows";
  import Subagent from "./Subagent.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    id,
    open,
    agentName,
    after,
    afterCount = 0,
  }: {
    /** The session drawn; null while it is still being started. */
    id: string | null;
    open: boolean;
    /** Who speaks in it, for its answer rows. */
    agentName: string;
    /** One more unit drawn after the last row (a delegate's report). */
    after?: Snippet;
    afterCount?: number;
  } = $props();

  const branch = $derived(id ? cawco.session(id) : null);

  /**
   * Where the well begins: at the session's newest compaction, the divider
   * its first row, or at its first turn when it never compacted. A well has
   * no scroller and draws everything it is given inside its host's row, so
   * what came before that compaction is read on the session's own page.
   */
  const from = $derived(branch ? newestCompaction(branch.messages) : -1);
  /**
   * That beginning is not in hand yet: there is a page older than the rows
   * held, and they hold no compaction, or open on a summary whose boundary
   * would be the last block of that page (a page can end between the two).
   */
  const wanting = $derived(
    !!branch &&
      branch.cursor !== null &&
      (from < 0 ||
        (from === 0 && branch.messages[0].type !== "system.compact_boundary"))
  );
  // An open well reads back to its beginning, one page at a time. A closed
  // one asks for nothing older than the newest page.
  $effect(() => {
    if (
      open &&
      id &&
      wanting &&
      branch &&
      !(branch.loading || branch.hydrating || branch.olderFault)
    ) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget; the page lands in the store the rows below read
      void readOlderPage(id);
    }
  });
  /** What stopped the well's rows arriving: the newest page's read, or an older one's. */
  const fault = $derived(branch?.readFault ?? branch?.olderFault ?? null);

  const rows = $derived.by(() => {
    if (!branch) {
      return [];
    }
    const folded = foldMessages(
      from > 0 ? branch.messages.slice(from) : branch.messages,
      branch.subagents
    );
    if (branch.streaming) {
      folded.push({
        kind: "stream",
        key: "delegate:stream",
        text: branch.streaming,
      });
    }
    return folded;
  });
  /**
   * The rows drawn: the transcript as it stood before a read under way,
   * until the well's beginning is in hand. The read publishes the newest
   * turns and the older ones are put in front a page at a time, and the well
   * draws from the top — so every page replaced the rows it had just drawn,
   * a 100ms render each, as the well was opening.
   */
  let settled: typeof rows = [];
  const shown = $derived.by(() => {
    if (!(branch && (branch.loading || wanting))) {
      settled = rows;
    }
    return settled;
  });
  const loading = $derived(
    open &&
      !!id &&
      (!branch || branch.loading || (wanting && !branch.olderFault)) &&
      shown.length === 0
  );
</script>

<!-- The rows, then `after` as one more unit: a report is often the same
     page as the last row, and drawn in that row's frame it doubled the
     heaviest frame of the well. -->
<CollapsibleLazy count={shown.length + afterCount} {open}>
  {#snippet children(
    limit
  )}
    {@const drawn = shown.slice(0, limit)}
    {@const runs = wellRuns(drawn)}
    <div class="inner">
      {#if loading}
        <p class="empty">Loading its transcript…</p>
      {:else if shown.length === 0 && fault}
        <p class="empty">
          {fault.reason === "offline"
            ? "Its machine is offline"
            : "Its transcript couldn't be read"}:
          {fault.message}
        </p>
        <!-- The read that failed is the one asked for again: the newest
             page, or the older page at the cursor the session still holds. -->
        <Button
          onclick={() =>
            id &&
            (branch?.readFault ? readTranscript(id, true) : readOlderPage(id))}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      {:else if shown.length === 0}
        <p class="empty">
          {id
            ? "Nothing in its transcript yet."
            : "Still starting — no transcript to show."}
        </p>
      {/if}
      {#each drawn as r (r.key)}
        {#if r.kind === "tools"}
          <ToolGroup messages={r.messages} />
        {:else if r.kind === "question"}
          <ToolGroup messages={[r.message]} />
        {:else if r.kind === "delegate"}
          <Delegate message={r.message} />
        {:else if r.kind === "run"}
          <RunBlock message={r.message} runId={r.runId} />
        {:else if r.kind === "compaction"}
          <CompactionDivider row={r} />
        {:else if r.kind === "subagent"}
          <Subagent branch={r.branch} spawn={r.spawn} />
        {:else if r.kind === "thinking"}
          <Thinking live={r.live} text={r.text} />
        {:else if r.kind === "stream"}
          <div class="say"><MessageBody source={r.text} streaming /></div>
        {:else if r.kind === "single"}
          <MessageRow
            {agentName}
            grouped={r.grouped}
            message={r.message}
            runsOn={runs.has(r.key)}
          />
        {/if}
      {/each}
      {#if after && afterCount > 0 && !loading && limit > shown.length}
        {@render after()}
      {/if}
    </div>
  {/snippet}
</CollapsibleLazy>

<style>
  /* The well's own rows draw their own rails, and they start their own
     line — they must not inherit the continuation the OUTER row published,
     or a nested tool run paints the tail weight and hugs the row above it. */
  .inner :global(*) {
    --rail-head: var(--rail);
    --rail-gap: var(--space-4);
  }
  /* The transcript, in a well of its own — concentric with what it holds.
     Its own x=0 is the host's text column: the well reaches out past it by
     its padding, and every row inside repeats the columns from there. */
  .inner {
    margin-block: var(--space-2) 0;
    margin-inline: var(--well-at, 0) 0;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .empty {
    padding: var(--space-2) var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .say {
    margin-block-start: var(--space-4);
  }
</style>
