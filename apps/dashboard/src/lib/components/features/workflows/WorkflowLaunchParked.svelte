<script lang="ts">
  /**
   * Where a workflow's launch is parked while its form is closed
   * (DESIGN.md, The Work Outlives Its Surface Rule): under its row on the
   * workflows list, under the editor's head. A start under way says so,
   * live; the run, once the hub has it, is the row's own (its last run and
   * count), and this line goes. A refusal is said here in the hub's words
   * and stands until the reader acts: Reopen brings the form back out of
   * this line where it was, the same details and the same words.
   *
   * The form travels into this line as it closes (The One Object Rule), and
   * back out of it on Reopen.
   */
  import { departBox, land } from "#lib/cawco/motion/share.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    launchShare,
    workflowLaunches,
  } from "#lib/cawco/workflow-launch.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cn } from "#lib/utils.js";

  let {
    workflowId,
    class: className,
  }: {
    workflowId: string;
    class?: string;
  } = $props();

  const launch = $derived(workflowLaunches.of(workflowId));
  const parked = $derived(
    launch !== null &&
      launch.step !== "editing" &&
      workflowLaunches.open !== workflowId
  );
  const share = $derived(launchShare(workflowId));
  let line = $state<HTMLElement | null>(null);

  /** One press: the form again, out of this line, where it was. */
  function reopen(): void {
    if (!launch) {
      return;
    }
    if (line) {
      departBox(share, line, false);
    }
    const from = document.querySelector<HTMLElement>(
      `[data-run-workflow="${CSS.escape(workflowId)}"]`
    );
    workflowLaunches.openFor(workflowId, launch.name, from);
  }
</script>

{#if parked && launch}
  <div
    bind:this={line}
    class={cn("min-w-0", className)}
    data-launch-parked={workflowId}
    data-step={launch.step}
    {@attach land(() => share, { uniform: true })}
  >
    {#if launch.step === "starting"}
      <p
        class="mark-line m-0 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 py-space-1 type-meta text-ink-muted"
        role="status"
      >
        <Spinner aria-hidden="true" box="small" />
        <span class="min-w-0">Starting a run of {launch.name}…</span>
        <Button
          data-box
          label="Show"
          onclick={reopen}
          size="xs"
          variant="ghost"
        />
      </p>
    {:else}
      <RowFault
        again={reopen}
        againLabel="Reopen"
        againPending="Reopening…"
        reason={`A run of ${launch.name} did not start. ${launch.refusal ?? ""}`}
      />
    {/if}
  </div>
{/if}
