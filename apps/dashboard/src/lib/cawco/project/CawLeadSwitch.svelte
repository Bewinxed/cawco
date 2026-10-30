<script lang="ts">
  /**
   * Whether the project's events reach a conversation, the project's own
   * switch (fable-lead-switch.md §1): one component wherever it stands,
   * CawPanel (⋯ › Caw settings…) and the head's details tray
   * (ProjectDetails), so its ways off come with it. Off, no event starts or
   * reaches a conversation.
   *
   * Turning it off (The Stay In Context Rule): nothing the project's
   * conversation started runs, and it just flips. Sessions it started still
   * run: a section unfolds under the switch (CawOffTray, its Caw-off job in
   * stop-work.svelte.ts) listing each one, every row checked; you uncheck
   * what should keep running, and one confirm stops the checked ones and
   * turns him off. Put away part-way, the stops go on and are
   * said under the switch while it is drawn, then on the project's row
   * once his settings close (The Work Outlives Its Surface Rule).
   * What runs is read again as you flip, so the choice is about what is true
   * now. The hub's answer is the switch's state: a refusal leaves it where
   * the hub says Caw is, its words under it.
   */
  import CawOffTray from "#lib/cawco/CawOffTray.svelte";
  import StopParked from "#lib/cawco/StopParked.svelte";
  import { cawOffAt, stopWork } from "#lib/cawco/stop-work.svelte.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    label = "Events reach a conversation",
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /** The switch's words beside it. */
    label?: string;
  } = $props();

  const on = $derived(lead.on ?? false);

  /** The switch's place: the Caw-off tray stands here when asked here. */
  const at = $derived(cawOffAt(projectId));
  /** What he started still runs: the tray's job, asked or parked. */
  const offJob = $derived(stopWork.of("caw-off", projectId));
  // His switch's place can hold his off tray while it is drawn (stop-work `reopen`).
  $effect(() => stopWork.place(at));
  // Turning him off by the tray: the hub's view of him once off is the switch's.
  $effect(() =>
    stopWork.onCawView(projectId, (view) => {
      lead.view = view;
    })
  );

  async function flip(next: boolean): Promise<void> {
    if (offJob?.open && ["none", "list", "armed"].includes(offJob.phase)) {
      // The switch again while the tray asks: nothing changes.
      stopWork.dismiss(offJob);
      return;
    }
    if (next) {
      await lead.configure({ on: true });
      return;
    }
    await lead.read();
    const running = lead.view?.running ?? [];
    if (running.length === 0) {
      await lead.configure({ on: false });
    } else {
      stopWork.askCawOff({ id: projectId, name: projectName }, at, running);
    }
  }
</script>

<label data-slot="lead-switch" class="flex flex-wrap items-center gap-space-2">
  <Switch
    data-caw-lead-switch
    disabled={lead.moving || lead.on === null}
    bind:checked={() => on, (next) => flip(next)}
  />
  <span>{label}</span>
</label>
{#if offJob}
  {#if offJob.at === at}
    <CawOffTray job={offJob} />
    <!-- Put away here, the stops are said here while his settings stand
         open; closed, on the project's row (ForgetProjectTray). -->
    <StopParked {at} job={offJob} />
  {/if}
{/if}
{#if lead.refused}
  <p data-slot="refused" class="type-meta text-error-11" role="alert">
    {lead.refused}
  </p>
{/if}
