<script lang="ts">
  /**
   * The stage when the work ended without landing. A failed or stopped
   * last attempt: how it ended in the hub's words, which session and when,
   * that its starter was told, Retry, and the transcript one step away. A
   * dropped task: why, by whom and when, and Reopen into a stage open to you.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconReopen, IconTranscript } from "#lib/icons.js";
  import { when } from "./format";
  import { LIVENESS } from "./marks";
  import type { TaskRead } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let {
    failure,
    dropped,
    now,
    pending = false,
    onretry,
    onreopen,
    ontranscript,
  }: {
    failure: TaskRead["failure"];
    dropped: TaskRead["dropped"];
    now: number;
    /** Retry or Reopen pressed, the hub not yet answered. */
    pending?: boolean;
    onretry?: () => void;
    onreopen?: () => void;
    ontranscript?: () => void;
  } = $props();
</script>

<!-- mark-line: the mark stands on a row of its own, the words under it -->
<div class="flex max-w-c-measure flex-col items-start gap-space-4 py-space-8">
  {#if failure}
    <StatusMark
      mark={failure.how === "Stopped" ? LIVENESS.stopped : LIVENESS.failed}
    />
    <h2 class="type-title text-balance text-ink-strong">
      {words.stoppedHow(failure.how, when(failure.at, now))}
    </h2>
    <p class="type-body text-pretty text-ink-strong">{failure.session}</p>
    <p class="type-body text-pretty text-ink-muted">
      {words.reportedTo(failure.reportedTo)}
      {words.retryCarries}
    </p>
    <div data-box class="flex flex-wrap items-center gap-space-3">
      <Button
        icon={IconReopen}
        label={words.retry}
        onclick={onretry}
        {pending}
        pendingLabel={words.retrying}
        variant="outline"
      />
      <Button
        icon={IconTranscript}
        label={words.openTranscript}
        onclick={ontranscript}
        variant="ghost"
      />
    </div>
  {:else if dropped}
    <StatusMark mark={LIVENESS.dropped} />
    <h2 class="type-title text-balance text-ink-strong">
      {words.droppedBy(dropped.by, when(dropped.at, now))}
    </h2>
    <p class="type-body text-pretty text-ink-strong">{dropped.reason}</p>
    <Button
      data-box
      icon={IconReopen}
      label={words.reopenInto(dropped.reopenInto)}
      onclick={onreopen}
      {pending}
      pendingLabel={words.retrying}
      variant="outline"
    />
  {/if}
</div>
