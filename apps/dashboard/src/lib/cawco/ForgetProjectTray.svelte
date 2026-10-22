<script lang="ts">
  /**
   * Forget a project: the running-sessions tray (StopTray) on the forget's
   * job (stop-work.svelte.ts), standing in the page under the control that
   * asked (forget.svelte.ts): the project head's `⋯` or a folder's row in
   * the rail. Each of those places draws one of these with its own `at`;
   * the tray shows at the one it stands at, and the forget parked meanwhile
   * shows its line (StopParked) under the project's row in the rail alone.
   * Caw turned off with what he started still stopping (CawLeadSwitch) is
   * the same kind of work on the same project, so it parks here too.
   *
   * With nothing running it is the plain question: Forget, the delete,
   * "Forgotten" held in place, then the project's page leaves for home.
   * With sessions running it stops them first ("Stop 3 and forget", then
   * "Stop 3 mid-turn and forget"), each row confirmed as its machine ends it,
   * and the delete runs once the ring is whole ("Forgetting…", "Forgotten").
   * The hub refuses the delete while anything of the project runs, so a
   * failure keeps the project: the row says why, and Try again stops what
   * is left. Put away part-way, the forget goes on (The Work Outlives Its
   * Surface Rule): the stops land, and the delete runs once none is left.
   *
   * Nothing here holds the page: pressing something else meanwhile breaks
   * nothing, since the hub refuses the delete while anything of the project
   * still runs, and the tray says so.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cn } from "#lib/utils.js";
  import { type ProjectRow, projectRunning } from "./client.svelte";
  import { forgetHost } from "./forget.svelte";
  import RowFault from "./RowFault.svelte";
  import StopParked from "./StopParked.svelte";
  import StopTray from "./StopTray.svelte";
  import { stopWork } from "./stop-work.svelte";

  let {
    at,
    projectId,
    parks = false,
    class: className,
  }: {
    /** This place: the forget asked here (`head:<id>`, `rail:<id>`) shows here. */
    at: string;
    /** The project this place belongs to. */
    projectId: string;
    /**
     * This place is where the project's stops are parked (its rail row):
     * one place, never also the head, so the line is never drawn twice.
     */
    parks?: boolean;
    class?: string;
  } = $props();

  const project = $derived(forgetHost.at === at ? forgetHost.project : null);
  /** The project's stop jobs: its forget, and Caw turned off; parked, each shows here. */
  const jobs = $derived(stopWork.on(projectId));
  /** Reading what runs was refused: said here, with Try again. */
  let unread = $state<string | null>(null);
  /** Reading what runs for the forget asked here. */
  let reading = $state(false);
  /** The latest read: an answer to an earlier one (a forget since replaced) is dropped. */
  let latest = 0;

  /** Reads what runs for `asked`; the tray unfolds on the answer. */
  function read(asked: ProjectRow): void {
    latest += 1;
    const mine = latest;
    reading = true;
    unread = null;
    projectRunning(asked.id).then(
      (running) => {
        if (mine === latest) {
          reading = false;
          stopWork.askForget(asked, at, running);
          forgetHost.close();
        }
      },
      (error: unknown) => {
        if (mine === latest) {
          reading = false;
          unread = failureWords(error);
        }
      }
    );
  }

  // A forget asked here: read what runs. Put away: nothing read stands.
  $effect(() => {
    const asked = project;
    if (asked) {
      read(asked);
      return;
    }
    latest += 1;
    reading = false;
    unread = null;
  });

  // This place can hold a tray while it is drawn (stop-work `reopen`).
  $effect(() => stopWork.place(at));

  // This place goes (its page left, its row dropped) while the forget it
  // asked is still being read: the ask ends with it. A job already asked
  // is the work's, and goes on.
  $effect(() => () => {
    if (forgetHost.at === at) {
      forgetHost.close();
    }
  });
</script>

{#if project && (reading || unread !== null)}
  {@const asked = project}
  <!-- The forget was pressed: said here while what runs is read, so the
       press is answered before the tray can be. -->
  {#if reading}
    <!-- Where the tray will stand, in its host's indent: the meta line, a
         spinner at its start. -->
    <p
      class={cn(
        "mark-line type-meta m-0 flex items-center gap-space-1 py-space-1 ps-(--ask-indent-in) pe-(--ask-end-in) text-ink-muted",
        className
      )}
      role="status"
      style:--ask-end-in="var(--ask-end, 0)"
      style:--ask-indent-in="var(--ask-indent, 0)"
    >
      <Spinner aria-hidden="true" box="small" />
      <span>Reading what runs in {asked.name}…</span>
    </p>
  {/if}
  <RowFault again={() => read(asked)} class={className} reason={unread} />
{/if}
{#each jobs as job (job.kind)}
  {#if job.at === at}
    <StopTray class={className} {job} />
  {/if}
  {#if parks}
    <StopParked {at} class={className} {job} />
  {/if}
{/each}
