<script lang="ts">
  /**
   * Forget a project: the running-sessions tray (StopTray) with the
   * forget's words and the delete as its end. Mounted once in the shell
   * (forget.svelte.ts), it flies out of whatever asked for it: the project
   * head's `⋯` or a folder's menu item, both departing under `forget:<id>`.
   *
   * With nothing running it is the plain question: Forget, the delete, gone.
   * With sessions running it stops them first ("Stop 3 and forget", then
   * "Stop 3 mid-turn and forget"), each row confirmed as its machine ends it,
   * and the delete runs once the ring is whole ("Forgetting…", "Forgotten").
   * The hub refuses the delete while anything of the project runs, so a
   * failure keeps the project: the row says why, and Try again stops what
   * is left (it reads what still runs when no row failed). The project is
   * forgotten once every session on a connected machine has stopped.
   */
  import { route } from "#lib/cawco/motion/route.svelte.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    deleteProject,
    projectRunning,
    type RunningSession,
    readProjects,
    stopProjectSessions,
  } from "./client.svelte";
  import { forgetHost } from "./forget.svelte";
  import StopTray, { type StopWords } from "./StopTray.svelte";
  import { toast } from "./toasts";

  const project = $derived(forgetHost.project);
  /** What runs, read as the forget was asked; null while it is read. */
  let sessions = $state<RunningSession[] | null>(null);

  // A forget asked for: read what runs, then the tray flies out of its opener.
  $effect(() => {
    const asked = project;
    sessions = null;
    if (!asked) {
      return;
    }
    let live = true;
    projectRunning(asked.id).then(
      (read) => {
        if (live) {
          sessions = read;
        }
      },
      (error: unknown) => {
        if (!live) {
          return;
        }
        toast.error(error instanceof Error ? error.message : String(error));
        forgetHost.close();
      }
    );
    return () => {
      live = false;
    };
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
  <StopTray
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
    share="forget:{asked.id}"
    stop={(ids) => stopProjectSessions(asked.id, ids).then(() => undefined)}
    {words}
  />
{/if}
