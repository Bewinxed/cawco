<script lang="ts">
  /**
   * End a project, forgotten or deleted for good: the running-sessions tray
   * (StopTray) on the end's job (stop-work.svelte.ts), standing in the page
   * under the control that asked (project-end.svelte.ts): the project head's
   * `⋯` or a folder's row in the rail. Each of those places draws one of these with its own `at`;
   * the tray shows at the one it stands at, and the forget parked meanwhile
   * shows its line (StopParked) under the project's row in the rail, or,
   * while that row is not drawn (a phone's closed sheet), under the head.
   * Caw turned off with what he started still stopping (CawLeadSwitch) is
   * the same kind of work on the same project, so it parks here too, and
   * its section (CawOffTray) stands here when reopened here.
   *
   * With nothing running it is the plain question: its verb, the end,
   * "Forgotten" or "Deleted" held in place, then the project's page leaves
   * for home (a forget with the toast that brings it back).
   * With sessions running it stops them first on one press ("Stop 3 and
   * forget"; a second, "Stop 3 mid-turn and forget", only when a turn would
   * be cut short), each row confirmed as its machine ends it,
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
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { cn } from "#lib/utils.js";
  import CawOffTray from "./CawOffTray.svelte";
  import { endAtRail, endHost } from "./project-end.svelte";
  import RowFault from "./RowFault.svelte";
  import StopParked from "./StopParked.svelte";
  import StopTray from "./StopTray.svelte";
  import { type EndKind, stopWork } from "./stop-work.svelte";
  import { type ProjectRow, projectRunning } from "./stores/projects.svelte";

  let {
    at,
    projectId,
    parks = false,
    opener,
    class: className,
  }: {
    /** This place: the end asked here (`head:<id>`, `rail:<id>`) shows here. */
    at: string;
    /** The project this place belongs to. */
    projectId: string;
    /**
     * This place is where the project's stops are parked (its rail row).
     * Any other place (the head) parks them only while that row is not
     * drawn (a phone's rail is a sheet, drawn only while open), so the line
     * stands in one place, one press from the page.
     */
    parks?: boolean;
    /** What asks here (the head's More, the row's link): the focus goes back to it as the tray is put away. */
    opener?: () => HTMLElement | null | undefined;
    class?: string;
  } = $props();

  const project = $derived(endHost.at === at ? endHost.project : null);
  const kind = $derived(endHost.at === at ? endHost.kind : null);
  /** The project's stop jobs: its forget or delete, and Caw turned off; parked, each shows here. */
  const jobs = $derived(stopWork.on(projectId));
  /** The rail's row stands for the project's parked stops; this place does while it is not drawn. */
  const parksHere = $derived(parks || !stopWork.drawn(endAtRail(projectId)));
  /** Reading what runs was refused: said here, with Try again. */
  let unread = $state<string | null>(null);
  /** Reading what runs for the end asked here. */
  let reading = $state(false);
  /** The latest read: an answer to an earlier one (an end since replaced) is dropped. */
  let latest = 0;

  /** Reads what runs for `asked`; the tray unfolds on the answer. */
  function read(asked: ProjectRow, end: EndKind): void {
    latest += 1;
    const mine = latest;
    reading = true;
    unread = null;
    projectRunning(asked.id).then(
      (running) => {
        if (mine === latest) {
          reading = false;
          stopWork.askEnd(end, asked, at, running);
          endHost.close();
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

  // An end asked here: read what runs. Put away: nothing read stands.
  $effect(() => {
    const asked = project;
    const end = kind;
    if (asked && end) {
      read(asked, end);
      return;
    }
    latest += 1;
    reading = false;
    unread = null;
  });

  // This place can hold a tray while it is drawn (stop-work `reopen`).
  $effect(() => stopWork.place(at));

  // This place goes (its page left, its row dropped) while the end it
  // asked is still being read: the ask ends with it. A job already asked
  // is the work's, and goes on.
  $effect(() => () => {
    if (endHost.at === at) {
      endHost.close();
    }
  });
</script>

{#if project && kind && (reading || unread !== null)}
  {@const asked = project}
  {@const end = kind}
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
      <span>{projectEndWords.reading}</span>
    </p>
  {/if}
  <RowFault again={() => read(asked, end)} class={className} reason={unread} />
{/if}
{#each jobs as job (job.kind)}
  {#if job.at === at}
    {#if job.kind === "caw-off"}
      <CawOffTray class={className} {job} />
    {:else}
      <StopTray class={className} {job} {opener} />
    {/if}
  {/if}
  <!-- Caw's off tray put away in his settings is said there while they
       stand open (CawLeadSwitch); here once they close. Reopened here (his
       settings closed meanwhile), this is its place, and it parks here. -->
  {#if parksHere && !(job.kind === "caw-off" && job.at !== at && stopWork.drawn(job.at))}
    <StopParked {at} class={className} {job} />
  {/if}
{/each}
