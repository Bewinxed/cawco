<script lang="ts">
  /**
   * Forget a project: the running-sessions tray (StopTray) with the
   * forget's words and the delete as its end, standing in the page under
   * the control that asked (forget.svelte.ts): the project head's `⋯` or a
   * folder's row in the rail. Each of those places draws one of these with
   * its own `at`; only the one the forget was asked from shows.
   *
   * With nothing running it is the plain question: Forget, the delete,
   * "Forgotten" held in place, then the project's page leaves for home (the
   * page keeps its project as it was loaded while that is said).
   * With sessions running it stops them first ("Stop 3 and forget", then
   * "Stop 3 mid-turn and forget"), each row confirmed as its machine ends it,
   * and the delete runs once the ring is whole ("Forgetting…", "Forgotten").
   * The hub refuses the delete while anything of the project runs, so a
   * failure keeps the project: the row says why, and Try again stops what
   * is left (it reads what still runs when no row failed). The project is
   * forgotten once every session on a connected machine has stopped; its
   * page and its rail row go with it.
   *
   * Nothing here holds the page: pressing something else meanwhile breaks
   * nothing, since the hub refuses the delete while anything of the project
   * still runs, and the tray says so.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { route } from "#lib/cawco/motion/route.svelte.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cn } from "#lib/utils.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    deleteProject,
    type ProjectRow,
    projectRunning,
    type RunningSession,
    readProjects,
    stopProjectSessions,
  } from "./client.svelte";
  import { forgetHost } from "./forget.svelte";
  import RowFault from "./RowFault.svelte";
  import StopTray, { type StopWords } from "./StopTray.svelte";

  let {
    at,
    class: className,
  }: {
    /** This place: the forget asked here (`head:<id>`, `rail:<id>`) shows here. */
    at: string;
    class?: string;
  } = $props();

  const project = $derived(forgetHost.at === at ? forgetHost.project : null);
  /** What runs, read as the forget was asked; null while it is read. */
  let sessions = $state<RunningSession[] | null>(null);
  /** Reading what runs was refused: said here, with Try again. */
  let unread = $state<string | null>(null);
  /** The latest read: an answer to an earlier one (a forget since replaced) is dropped. */
  let latest = 0;

  /** Reads what runs for `asked`; the tray unfolds on the answer. */
  function read(asked: ProjectRow): void {
    latest += 1;
    const mine = latest;
    sessions = null;
    unread = null;
    projectRunning(asked.id).then(
      (running) => {
        if (mine === latest) {
          sessions = running;
        }
      },
      (error: unknown) => {
        if (mine === latest) {
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
    sessions = null;
    unread = null;
  });

  // This place goes (its page left, its row dropped) while the forget it
  // asked stands: the forget ends with it.
  $effect(() => () => {
    if (forgetHost.at === at) {
      forgetHost.close();
    }
  });

  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  const words = $derived.by((): StopWords => {
    const name = project?.name ?? "";
    return {
      title: `Forget ${name}?`,
      plain: "Forget",
      stop: (n) => `Stop ${n} and forget`,
      armed: (n) => `Stop ${n} mid-turn and forget`,
      ending: "Forgetting…",
      ended: "Forgotten",
      partway: (stopped, total) =>
        `Stopped ${stopped} of ${total}; ${name || "the project"} kept.`,
      line: (phase, n, done) => {
        switch (phase) {
          case "none":
            return "The grouping is removed. The checkout and its sessions stay on disk.";
          case "list":
            return `${n} running ${plural(n, "session stops", "sessions stop")} first. The checkout and its sessions stay on disk.`;
          case "armed":
          case "stopping":
            return "Transcripts and the checkout stay on disk.";
          case "fail":
            return `${name} is kept until every session is stopped.`;
          default:
            return done;
        }
      },
    };
  });

  /** The project is gone: the reader is taken off its page before the list drops it. */
  async function forgotten(id: string): Promise<void> {
    if (page.url.pathname === `/project/${id}`) {
      await goto(route.spoke, { replace: true });
    }
    await readProjects();
  }
</script>

{#if project}
  {@const asked = project}
  <!-- The forget was pressed: said here while what runs is read, so the
       press is answered before the tray can be. -->
  {#if sessions === null && unread === null}
    <p class={cn("reading", "mark-line", className)} role="status">
      <Spinner aria-hidden="true" />
      <span>Reading what runs in {asked.name}…</span>
    </p>
  {/if}
  <RowFault again={() => read(asked)} class={className} reason={unread} />
  <StopTray
    class={className}
    end={() => deleteProject(asked.id)}
    ended={() => forgotten(asked.id)}
    onclose={() => {
      if (forgetHost.project === asked) {
        forgetHost.close();
      }
    }}
    projectId={asked.id}
    reread={() => projectRunning(asked.id)}
    {sessions}
    stop={(ids) => stopProjectSessions(asked.id, ids).then(() => undefined)}
    {words}
  />
{/if}

<style>
  /* Where the tray will stand, in its host's indent: the meta line, a
     spinner at its start. */
  .reading {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    padding-block: var(--space-1);
    padding-inline: var(--ask-indent, 0) var(--ask-end, 0);
    font: var(--type-meta);
    color: var(--ink-muted);
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
</style>
