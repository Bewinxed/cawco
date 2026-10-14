<script lang="ts">
  /**
   * One custom view of a project and nothing around it (PRD §5.2): what the
   * app shows in a web view, since OpenUI has no Swift renderer. The root
   * layout draws this route without the app's shell. The kept view of that
   * name, else the draft; a task in it opens the project's page on it, or in
   * the app, the app's own task sheet.
   */
  import type { ProjectView } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import ViewOpenUi from "#lib/cawco/views/ViewOpenUi.svelte";
  import { viewsOf } from "#lib/cawco/views-api.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconAlert } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  const projectId = $derived(page.params.id ?? "");
  const name = $derived(page.params.name ?? "");

  let view = $state<ProjectView | null>(null);
  let problem = $state<string | null>(null);

  $effect(() => {
    const id = projectId;
    const wanted = name;
    let live = true;
    view = null;
    problem = null;
    viewsOf(id)
      .then((views) => {
        if (!live) {
          return;
        }
        const found =
          views.find((each) => each.name === wanted && !each.draft) ??
          views.find((each) => each.name === wanted);
        if (found) {
          view = found;
        } else {
          problem = `The project has no view called ${wanted}.`;
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = failureWords(error);
        }
      });
    return () => {
      live = false;
    };
  });

  const hrefOf = (task: string) =>
    `/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(task)}`;

  /**
   * The app's web view hears the page here (ProjectViewPane.swift): a task
   * opens the app's own sheet over the project, as a card in its board does.
   * A browser has no such host and opens the project's page on the task.
   */
  interface AppHost {
    postMessage: (message: { task: string; type: "cawco:open-task" }) => void;
  }
  const appHost = (
    globalThis as { webkit?: { messageHandlers?: { cawco?: AppHost } } }
  ).webkit?.messageHandlers?.cawco;
  const open = (task: string) => {
    if (appHost) {
      appHost.postMessage({ type: "cawco:open-task", task });
    } else {
      goto(hrefOf(task));
    }
  };
</script>

<!-- Named as the project page's tab names it. -->
<svelte:head><title>{stageLabel(name)} · CawCo</title></svelte:head>

<main class="view-alone" data-view-alone={name}>
  {#if problem}
    <EmptyState icon={IconAlert} line={problem} title="This view didn't open" />
  {:else if view}
    <ViewOpenUi {hrefOf} onopen={open} {projectId} {view} />
  {:else}
    <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
  {/if}
</main>

<style>
  .view-alone {
    min-block-size: 100dvh;
    padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-4), var(--safe-bottom))
      max(var(--space-4), env(safe-area-inset-left));
    background: var(--surface-recess);
  }
</style>
