<script lang="ts">
  /**
   * A view Caw wrote (`views/<name>.json`, A2UI v0.9.1 over CawCo's catalog),
   * drawn by svelte-a2ui (PRD §5.2). The view's messages make its surface;
   * the hub's view data is its data model, so a view carries none of its
   * own. A component the catalog does not have stands as an alert naming
   * it. The view's property names are those v0.9 and v1.0 share
   * (svelte-a2ui README, "Built against v1.0"), so its messages go to the
   * renderer under the renderer's own version.
   */
  import type { ProjectView, ViewData } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    A2UI_VERSION,
    A2uiClient,
    type AgentToRenderer,
    Surface,
  } from "svelte-a2ui";
  import type {
    Stage,
    StageKind,
    TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { VIEW_CATALOG } from "./a2ui/catalog";
  import { setViewContext } from "./a2ui/context";
  import Missing from "./a2ui/Missing.svelte";

  let {
    view,
    data,
    stages,
    tasks,
    hrefOf,
    kindOf,
    onopen,
  }: {
    view: ProjectView;
    data: ViewData;
    stages: Stage[];
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    kindOf: (id: string) => StageKind | null | undefined;
    onopen: (id: string) => void;
  } = $props();

  setViewContext({
    get data() {
      return data;
    },
    get stages() {
      return stages;
    },
    get tasks() {
      return tasks;
    },
    hrefOf: (id) => hrefOf(id),
    kindOf: (id) => kindOf(id),
    onopen: (id) => onopen(id),
  });

  const surfaceId = $derived.by(() => {
    for (const message of view.spec) {
      if ("createSurface" in message) {
        return message.createSurface.surfaceId;
      }
    }
    return view.name;
  });

  const client = new A2uiClient();
  // The view's messages, then its data each time the hub's changes. The
  // client reads its own state to reduce a message into it, so each ingest
  // is untracked: only the spec and the data drive these.
  $effect.pre(() => {
    const messages = view.spec;
    untrack(() => {
      for (const message of messages) {
        client.ingest({ ...message, version: A2UI_VERSION } as AgentToRenderer);
      }
    });
  });
  $effect.pre(() => {
    const value = data;
    const id = surfaceId;
    untrack(() =>
      client.ingest({
        version: A2UI_VERSION,
        updateDataModel: { surfaceId: id, path: "/", value },
      } as AgentToRenderer)
    );
  });
  $effect(() => () => client.destroy());
</script>

<Surface catalog={VIEW_CATALOG} {client} fallback={Missing} {surfaceId}>
  {#snippet pending()}
    <Skeleton class="h-40 w-full rounded-[var(--radius-lg)]" />
  {/snippet}
</Surface>
