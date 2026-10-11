<script lang="ts">
  /**
   * The session folder tabs on a bench: the real PaneTabs, five tabs in
   * mixed statuses (needs you, working, idle, done, working), fed through
   * the client's own state with no hub, over everything the shell draws
   * (its hub banner included). `?theme=` light | dark; `?at=` the index of
   * the tab chosen first (1). `window.__ft.choose(id)` chooses a tab, as a
   * click does, and `window.__ft.ids` lists the tabs in order: what
   * scripts/folder-tabs-proof.ts drives.
   *
   * A click on a tab chooses it here, in the bench's own group; the strip's
   * own choice goes to the workspace, which holds no such group and would
   * navigate to the session.
   */
  import type { SessionPulse, Workflow, WorkflowRun } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { workflowState } from "#lib/cawco/workflow-state.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";

  const RUN = "0f1e2d3c-0000-4000-8000-0000000000aa";
  const WORKFLOW = "0f1e2d3c-0000-4000-8000-0000000000ff";
  const ids = [
    "0f1e2d3c-0000-4000-8000-000000000001",
    "0f1e2d3c-0000-4000-8000-000000000002",
    "0f1e2d3c-0000-4000-8000-000000000003",
    `run:${RUN}`,
    "0f1e2d3c-0000-4000-8000-000000000005",
  ];
  /** What each session's pulse says: needs you, working, idle, (the run), working. */
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "blocked",
    [ids[1]]: "working",
    [ids[2]]: "idle",
    [ids[4]]: "working",
  };

  // The client's own state, as the hub's frames would have set it: the
  // sessions' pulses (dev's `__cawcoDebug`, set when client.svelte.ts loads,
  // which PaneTabs imports ahead of this script) and a run that ended done,
  // with its workflow's name.
  const debug = (
    globalThis as unknown as {
      __cawcoDebug: { state: { pulses: Record<string, SessionPulse> } };
    }
  ).__cawcoDebug;
  const now = Date.now();
  for (const [instanceId, activity] of Object.entries(DOING)) {
    debug.state.pulses[instanceId] = {
      activity,
      at: now,
      busy: activity === "working",
      currentTool: null,
      instanceId,
      runningSubagents: 0,
    };
  }
  workflowState.workflows.push({
    id: WORKFLOW,
    name: "Release notes",
  } as Workflow);
  workflowState.runs[RUN] = {
    edges: {},
    endedAt: new Date(now - 60_000).toISOString(),
    failure: null,
    graph: null,
    id: RUN,
    inputs: {},
    launchedBy: "bench",
    loops: {},
    machineId: "bench",
    parentRunId: null,
    parentStepId: null,
    program: "",
    rerunOfRunId: null,
    result: null,
    startedAt: new Date(now - 600_000).toISOString(),
    state: {},
    status: "done",
    supervisorInstanceId: null,
    workflowId: WORKFLOW,
    workspace: "/bench",
  } satisfies WorkflowRun;

  const first = untrack(() =>
    Math.min(
      ids.length - 1,
      Math.max(0, Number(page.url.searchParams.get("at") ?? 1) || 0)
    )
  );
  const leaf = $state<LeafNode>({
    id: "folder-proof",
    t: "l",
    tabs: ids,
    active: ids[first],
  });

  const scheme = $derived(
    page.url.searchParams.get("theme") === "dark" ? "dark" : "light"
  );
  $effect(() => {
    theme.set(scheme);
  });

  /** Chooses a tab in the bench's group, as a click on it does. */
  function choose(id: string) {
    if (leaf.tabs.includes(id)) {
      leaf.active = id;
    }
  }

  /**
   * A click that would choose a tab (its link, its empty details slot) or
   * close one is the bench's: the strip's own would act on the workspace.
   * The chosen tab's own click (its details card) is left to the strip.
   */
  function benchClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>(".tab");
    const id = tab
      ?.querySelector<HTMLElement>("[data-session-tab]")
      ?.getAttribute("data-session-tab");
    if (!(tab && id)) {
      return;
    }
    if (target?.closest(".tclose")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (id === leaf.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    choose(id);
  }

  onMount(() => {
    const bench = { ids, choose, chosen: () => leaf.active };
    Object.assign(window, { __ft: bench });
    return () => {
      Reflect.deleteProperty(window, "__ft");
      for (const id of Object.keys(DOING)) {
        delete debug.state.pulses[id];
      }
      delete workflowState.runs[RUN];
      workflowState.workflows = workflowState.workflows.filter(
        (one) => one.id !== WORKFLOW
      );
    };
  });
</script>

<svelte:head><title>Folder tabs proof | CawCo</title></svelte:head>

<!-- Over the shell and anything it draws (a hub banner): the strip on its
     shelf, and the page its chosen tab opens into. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="proof" data-folder-proof onclickcapture={benchClick}>
  <div class="group">
    <PaneTabs {leaf} />
    <div class="page"></div>
  </div>
</div>

<style>
  .proof {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    background: var(--surface-recess);
    color: var(--ink-strong);
  }
  /* A group as the workspace lays one out: its strip on the shelf, then
     the page the chosen tab opens into. */
  .group {
    container: leaf / inline-size;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
    padding-block-start: var(--space-7);
    background: var(--surface-shelf);
  }
  .page {
    flex: 1 1 auto;
    background: var(--surface-recess);
  }
</style>
