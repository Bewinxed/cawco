<script lang="ts">
  /**
   * A view Caw wrote (`views/<name>.oui`, OpenUI Lang over CawCo's library,
   * PRD §5.2), drawn by the OpenUI binding with the dashboard's components.
   * Its data comes only from its Query() tools, each the hub's route for it
   * (`POST /api/projects/:id/view-tools/<tool>`) with the page's own session:
   * the tool provider is exactly the view tools, nothing else. A component
   * the library does not have is left out and named over the view; a tool
   * that fails says so; anything that throws stays inside this frame.
   */
  import { type ProjectView, VIEW_TOOLS } from "@cawco/core";
  import type { OpenUIError } from "@openuidev/lang-core";
  import { viewTool } from "#lib/cawco/views-api.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import RegionHeld from "../RegionHeld.svelte";
  import { setViewContext } from "./openui/context";
  import { VIEW_LIBRARY } from "./openui/library";
  import OpenUiRenderer, {
    type OpenUIToolProvider,
  } from "./openui/OpenUiRenderer.svelte";

  let {
    view,
    projectId,
    hrefOf,
    onopen,
  }: {
    view: ProjectView;
    projectId: string;
    hrefOf: (id: string) => string;
    onopen: (id: string) => void;
  } = $props();

  setViewContext({
    hrefOf: (id) => hrefOf(id),
    onopen: (id) => onopen(id),
  });

  /** The view tools, each its hub route, for this project. */
  const tools: OpenUIToolProvider = Object.fromEntries(
    VIEW_TOOLS.map((tool) => [
      tool,
      (args: Record<string, unknown>) => viewTool(projectId, tool, args),
    ])
  );

  /** Tools that failed, by name, with the hub's sentence. */
  let failing = $state<OpenUIError[]>([]);
  function reported(errors: OpenUIError[]) {
    failing = errors.filter((each) => each.source === "query");
  }

  const dropped = $derived(view.dropped.join(", "));
</script>

<div data-slot="view-frame" class="flex min-w-0 flex-col gap-space-3">
  {#if view.dropped.length > 0}
    <Alert data-view-dropped={dropped} variant="warning">
      <AlertDescription
        >This view uses {dropped}, which CawCo's views do not have, so
        {view.dropped.length > 1 ? "they are" : "it is"}
        left out.</AlertDescription
      >
    </Alert>
  {/if}
  {#each failing as failure (failure.statementId ?? failure.message)}
    <Alert data-view-tool-failed={failure.toolName} variant="warning">
      <AlertDescription
        >The view's {failure.toolName ?? "data"} could not be read:
        {failure.message}</AlertDescription
      >
    </Alert>
  {/each}
  <svelte:boundary>
    <!-- Its error is the view's, never the route's (region-held.ts). -->
    <RegionHeld />
    <!-- Until each Query has answered once, the view stands as its skeleton:
         its defaults (a count of 0) are never shown as the project's data. -->
    <OpenUiRenderer
      class="min-w-0"
      library={VIEW_LIBRARY}
      onError={reported}
      response={view.source}
      toolProvider={tools}
    >
      {#snippet pending()}
        <Skeleton
          class="h-40 w-full rounded-lg"
          data-view-pending
        />
      {/snippet}
    </OpenUiRenderer>
    {#snippet failed(thrown)}
      <Alert variant="warning">
        <AlertDescription
          >This view could not be drawn:
          {thrown instanceof Error
            ? thrown.message
            : String(thrown)}</AlertDescription
        >
      </Alert>
    {/snippet}
  </svelte:boundary>
</div>
