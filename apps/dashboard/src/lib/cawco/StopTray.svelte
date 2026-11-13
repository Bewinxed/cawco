<script lang="ts">
  import { machineName } from "./home/home-state.svelte";
  import { markHue } from "./mark";
  import StopTrayView from "./StopTrayView.svelte";
  import { sessionPlace } from "./session-names.svelte";
  import { standing, trailOf, trayHere } from "./stop-tray-here.svelte";
  /**
   * A forget's or a delete's tray (Caw off's is CawOffTray): a job of
   * stop-work.svelte.ts drawn as StopTrayView, which holds the look and the
   * rows' flights and takes everything as props, so its every state stands
   * in a story. This wires the view to the job: the board's activity and
   * machine names, each row's colour and trailing figure, the presses into
   * the job, its stopped rows' flights as the hub confirms each stop, and
   * where the tray stands (stop-tray-here). Put away, it hands the focus
   * back to what opened it (`opener`).
   */
  import {
    endWordsOf,
    type StopJob,
    type StopRow,
    stopShare,
    stopWork,
  } from "./stop-work.svelte";
  import { asksStore } from "./stores/asks.svelte";

  let {
    class: className,
    job,
    opener,
  }: {
    /** The host's indent for the tray (`--ask-indent`, `--ask-end`). */
    class?: string;
    job: StopJob;
    /** What asked for the tray: the focus goes back to it as the tray is put away. */
    opener?: () => HTMLElement | null | undefined;
  } = $props();

  let view = $state<StopTrayView | null>(null);
  const stands = standing(() => job);

  // Drawn and standing: its stopped rows fly into its button.
  $effect(() => {
    if (!job.open) {
      return;
    }
    return stopWork.attach(job, { fly: (row) => view?.fly(row) });
  });

  /** Put away: the job parks or drops, and the focus goes back to what asked. */
  function cancel(): void {
    stopWork.dismiss(job);
    opener?.()?.focus();
  }
</script>

<StopTrayView
  activityOf={(id) => asksStore.activityOf(id)}
  bind:this={view}
  class={className}
  fillOf={(row: StopRow) =>
    `var(--color-mark-${markHue(sessionPlace(row.s.id))})`}
  {job}
  nameOf={machineName}
  onarrive={(row) => stopWork.arrive(job, row)}
  oncancel={cancel}
  onkeep={() => {
    stopWork.keepProject(job);
    opener?.()?.focus();
  }}
  onconfirm={() => stopWork.press(job)}
  ondepart={(row) => {
    row.departed = true;
  }}
  onfromdisk={(on) => stopWork.setFromDisk(job, on)}
  ongone={(row) => {
    row.gone = true;
  }}
  onstopone={(id) => stopWork.stopOne(job, id)}
  share={stopShare(job)}
  trailOf={(row) => trailOf(job, row, stands.now)}
  words={endWordsOf(job)}
  {@attach trayHere(
    () => job,
    () => view?.leave()
  )}
/>
