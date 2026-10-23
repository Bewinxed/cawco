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
  import { provideMarkdownFleet } from "#lib/cawco/markdown-fleet.js";
  import { liveMarkdown } from "#lib/cawco/markdown-live.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import ViewOpenUi from "#lib/cawco/views/ViewOpenUi.svelte";
  import { viewsOf } from "#lib/cawco/views-api.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconAlert } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  // The view's markdown draws its references and skill chips from the live
  // store, as the app's does (markdown-fleet.ts).
  provideMarkdownFleet(() => liveMarkdown);

  const projectId = $derived(page.params.id ?? "");
  const name = $derived(page.params.name ?? "");

  let view = $state<ProjectView | null>(null);
  let problem = $state<string | null>(null);
  /** The project has no view of that name: Caw is the one who makes one. */
  let missing = $state(false);
  /** The read the page waits on; an older one that answers late is let go. */
  let latest = 0;

  /** Reads the project's views for `wanted`: on arrival, and on each Retry. */
  function read(id: string, wanted: string) {
    latest += 1;
    const mine = latest;
    view = null;
    problem = null;
    missing = false;
    viewsOf(id)
      .then((views) => {
        if (mine !== latest) {
          return;
        }
        const found =
          views.find((each) => each.name === wanted && !each.draft) ??
          views.find((each) => each.name === wanted);
        if (found) {
          view = found;
        } else {
          problem = `The project has no view called ${wanted}.`;
          missing = true;
        }
      })
      .catch((error: unknown) => {
        if (mine === latest) {
          problem = failureWords(error);
        }
      });
  }

  $effect(() => {
    read(projectId, name);
  });

  /**
   * The Empty Starts Work Rule: a view that isn't there is Caw's to make, so
   * the action opens the project's page with these words in his composer,
   * unsent (`?ask=`); a read that failed is read again.
   */
  const askHref = $derived(
    `/project/${encodeURIComponent(projectId)}?ask=${encodeURIComponent(
      `Make a view called ${stageLabel(name)} for this project.`
    )}`
  );

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

<!-- The page's inset (DESIGN.md, Layout): 25px on the start and 21px on the
     end, as the project page and Usage stand; under the desk line 18px a
     side, as theirs do. Never inside a notch's safe area. -->
<main
  class="min-h-dvh bg-surface-recess pt-space-6 pr-(--pad-right) pb-(--pad-bottom) pl-(--pad-left) max-desk:pr-(--pad-right-narrow) max-desk:pl-(--pad-left-narrow)"
  data-view-alone={name}
  style:--pad-bottom="max(var(--space-6), var(--safe-bottom))"
  style:--pad-left="max(var(--space-7), env(safe-area-inset-left))"
  style:--pad-left-narrow="max(var(--space-5), env(safe-area-inset-left))"
  style:--pad-right="max(var(--space-6), env(safe-area-inset-right))"
  style:--pad-right-narrow="max(var(--space-5), env(safe-area-inset-right))"
>
  {#if problem}
    <div in:reveal>
      <EmptyState icon={IconAlert} line={problem} title="This view didn't open">
        {#snippet action()}
          {#if missing}
            <Button
              href={askHref}
              label="Ask Caw for this view"
              variant="outline"
            />
          {:else}
            <Button
              label="Retry"
              onclick={() => read(projectId, name)}
              variant="outline"
            />
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  {:else if view}
    <div in:reveal>
      <ViewOpenUi {hrefOf} onopen={open} {projectId} {view} />
    </div>
  {:else}
    <div out:revealOut>
      <Skeleton class="w-full" height="board" radius="card" />
    </div>
  {/if}
</main>
