<script lang="ts">
  /**
   * Where a stop job is parked while its tray is away (stop-work.svelte.ts,
   * DESIGN.md The Work Outlives Its Surface Rule): one line under the
   * project's row in the rail, and where the tray was asked. While the
   * stops land it says how many have, live; a failure says what was left
   * and why, in words, and stands until the reader acts on it. Show (or
   * Reopen) brings the tray back here, where it was: the same rows, the
   * same step. The tray travels into this line as it goes (The One Object
   * Rule) and back out of it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cn } from "#lib/utils.js";
  import { departBox, land } from "./motion/share.svelte";
  import RowFault from "./RowFault.svelte";
  import {
    type StopJob,
    stopShare,
    stopWork,
    wordsOf,
  } from "./stop-work.svelte";

  let {
    job,
    at,
    class: className,
  }: {
    job: StopJob;
    /** This place: a press here brings the tray back here. */
    at: string;
    class?: string;
  } = $props();

  const parked = $derived(
    !job.open &&
      (job.phase === "stopping" ||
        job.phase === "fail" ||
        job.phase === "ending")
  );
  const words = $derived(wordsOf(job));
  const stopped = $derived(
    job.rows.filter((row) => row.state === "stopped").length
  );
  const total = $derived(Math.max(job.total, job.rows.length));
  /** A failure in words: what was left, then each reason the hub gave. */
  const failure = $derived.by(() => {
    if (job.phase !== "fail") {
      return null;
    }
    const reasons = [
      ...new Set(
        job.rows.flatMap((row) =>
          row.state === "failed" && row.error ? [row.error] : []
        )
      ),
      ...(job.refusal ? [job.refusal] : []),
    ];
    return [words.partway(stopped, total), ...reasons].join(" ");
  });
  let line = $state<HTMLElement | null>(null);

  function reopen(): void {
    if (line) {
      departBox(stopShare(job), line, false);
    }
    stopWork.reopen(job, at);
  }
</script>

{#if parked}
  <div
    bind:this={line}
    class={cn("min-w-0 ps-(--ask-indent,0) pe-(--ask-end,0)", className)}
    data-stop-parked={job.projectId}
    data-stop-kind={job.kind}
    data-phase={job.phase}
    {@attach land(() => stopShare(job), { uniform: true })}
  >
    {#if failure}
      <RowFault
        again={reopen}
        againLabel="Reopen"
        againPending="Reopening…"
        reason={failure}
      />
    {:else}
      <p
        class="mark-line m-0 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 py-space-1 type-meta text-ink-muted"
        role="status"
      >
        <Spinner aria-hidden="true" box="small" />
        <span class="min-w-0">{words.parked(stopped, total)}</span>
        <Button
          data-box
          label="Show"
          onclick={reopen}
          size="xs"
          variant="ghost"
        />
      </p>
    {/if}
  </div>
{/if}
