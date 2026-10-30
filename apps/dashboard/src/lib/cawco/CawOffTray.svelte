<script lang="ts">
  /**
   * Caw off's tray: a job of stop-work.svelte.ts drawn as the pick section
   * (StopTrayPick), under his switch (CawLeadSwitch) or, reopened from where
   * it parked, under the project's row (ForgetProjectTray). The job holds
   * the work (DESIGN.md, The Work Outlives Its Surface Rule): Cancel or
   * Escape before the confirm drops the ask and Caw stays on; after it, Stop
   * waiting, Close or Escape puts the section away and the job parks
   * (StopParked), the stops still landing. The section travels into that
   * line as it goes and back out of it on a press there. A reload brings it
   * back as it stood.
   */
  import { cawco } from "./client.svelte";
  import { machineName } from "./home/home-state.svelte";
  import { resolveSessionTitle } from "./links";
  import { departBox, land } from "./motion/share.svelte";
  import StopTrayPick, {
    type PickRow,
    type PickStep,
    type PickStop,
  } from "./StopTrayPick.svelte";
  import { standing, trailOf, trayHere } from "./stop-tray-here.svelte";
  import {
    type StopJob,
    type StopRow,
    stopShare,
    stopWork,
  } from "./stop-work.svelte";

  let {
    class: className,
    job,
  }: {
    /** The host's indent for the section (`--ask-indent`, `--ask-end`). */
    class?: string;
    job: StopJob;
  } = $props();

  const share = $derived(stopShare(job));
  const stands = standing(() => job);
  let section = $state<HTMLElement | null>(null);

  const step = $derived.by((): PickStep => {
    switch (job.phase) {
      case "none":
      case "list":
      case "armed":
        return "pick";
      case "fail":
        return "failed";
      case "done":
        return "off";
      case "stopping":
      case "ending":
        return "stopping";
    }
  });

  const STOPS: Partial<Record<StopRow["state"], PickStop>> = {
    stopping: "stopping",
    stopped: "stopped",
    away: "away",
    failed: "failed",
  };

  const rows = $derived(
    job.rows.map((row): PickRow => ({
      id: row.s.id,
      parentId: row.s.parentId,
      cwd: row.s.cwd,
      kind: row.view.kind ?? "delegate",
      title:
        row.view.title ??
        resolveSessionTitle({
          title: row.s.title,
          cwd: row.s.cwd,
          id: row.s.id,
        }),
      href: row.view.href,
      machineName: machineName(row.s.machineId),
      offline: row.s.offline,
      activity: cawco.activityOf(row.s.id),
      ran: trailOf(job, row, stands.now),
      stop: step === "pick" ? null : (STOPS[row.state] ?? null),
      landed: row.arrived && row.state !== "kept",
      error: row.error,
    }))
  );

  /** The section's element, for its travel into where it parks. */
  function held(node: HTMLElement) {
    section = node;
    return () => {
      if (section === node) {
        section = null;
      }
    };
  }

  /** Puts the section away; stops under way park and go on, the section travelling into their line. */
  function leave(): void {
    if (section && (step === "stopping" || step === "failed")) {
      departBox(share, section, false);
    }
    stopWork.dismiss(job);
  }
</script>

{#if job.open}
  <StopTrayPick
    checked={job.picked}
    class={className}
    data-stop-tray={job.projectId}
    onagain={(id) => stopWork.stopOne(job, id)}
    oncancel={leave}
    onconfirm={() => stopWork.press(job)}
    onpick={(ids) => stopWork.pick(job, ids)}
    projectName={job.projectName}
    refusal={job.refusal}
    {rows}
    {step}
    {@attach held}
    {@attach trayHere(() => job, leave)}
    {@attach land(() => share)}
  />
{/if}
