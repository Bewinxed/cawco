<script lang="ts">
  /**
   * Both folder strips on a bench, fed through the client's own state with
   * no hub, over everything the shell draws (its hub banner included):
   *
   * - the session tabs (`data-strip="session"`): the real PaneTabs, six
   *   tabs in mixed statuses (needs you, working, idle, done, failed,
   *   idle), the working one chosen; and the same tabs again with the idle
   *   one chosen (`data-strip="session-idle"`);
   * - three sliders over the rims' tokens, written live on the bench:
   *   Taper (`--tab-rim-taper`, px), Subtle (`--tab-rim-mix-subtle`, an
   *   unchosen tab's rim strength) and Thickness (`--tab-rim-width`, the
   *   rim's stroke, px); `?taper=`, `?subtle=` and `?width=` start them;
   * - the home's Working and Finished (`data-strip="work"`): the real
   *   WorkTabs over twelve working runs and fourteen finished, hosted as
   *   the shell hosts it, in the rail's 260px column on the desk and across
   *   the phone's home page under 900px.
   *
   * `?theme=` light | dark; `?at=` the index of the session tab chosen
   * first (1); `?work=` working | finished. `window.__ft.choose(id)` chooses
   * a session tab and `window.__ft.work.choose(id)` Working or Finished, as
   * a click does; `ids` and `chosen()` on each say the rest: what
   * scripts/probe-kit/specs/web/folder-tabs.ts drives.
   * `window.__ft.ride(id, fraction)` carries the session strip's choice
   * toward a tab as the phone's pane swipe does, and `land(id)` ends it
   * there: what scripts/probe-kit/specs/web/tab-switch-cost.ts drives.
   *
   * A click on a tab chooses it here, in the bench's own group; the strip's
   * own choice goes to the workspace, which holds no such group and would
   * navigate to the session.
   */
  import type { SessionPulse, Workflow, WorkflowRun } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import WorkTabs from "#lib/cawco/home/WorkTabs.svelte";
  import { workTab } from "#lib/cawco/home/work-tab.svelte.js";
  import { workflowState } from "#lib/cawco/workflow-state.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import type { TabsTravel } from "#lib/components/ui/fluid-tabs/index.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";

  const RUN = "0f1e2d3c-0000-4000-8000-0000000000aa";
  const FAILED_RUN = "0f1e2d3c-0000-4000-8000-0000000000ab";
  const WORKFLOW = "0f1e2d3c-0000-4000-8000-0000000000ff";
  const ids = [
    "0f1e2d3c-0000-4000-8000-000000000001",
    "0f1e2d3c-0000-4000-8000-000000000002",
    "0f1e2d3c-0000-4000-8000-000000000003",
    `run:${RUN}`,
    `run:${FAILED_RUN}`,
    "0f1e2d3c-0000-4000-8000-000000000006",
  ];
  /** What each session's pulse says: needs you, working, idle, (the runs: done, failed), idle. */
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "blocked",
    [ids[1]]: "working",
    [ids[2]]: "idle",
    [ids[5]]: "idle",
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
  /** How a run that ended ended: done, or failed. */
  const ENDED = ["done", "failed"] as const;
  /** A run of the bench's workflow, working or ended `ago` ms back, done unless it `failed`. */
  const runOf = (
    id: string,
    ago: number | null,
    failed = false
  ): WorkflowRun => ({
    status: ago === null ? "running" : ENDED[Number(failed)],
    edges: {},
    endedAt: ago === null ? null : new Date(now - ago).toISOString(),
    failure: null,
    graph: null,
    id,
    inputs: {},
    launchedBy: "bench",
    loops: {},
    machineId: "bench",
    parentRunId: null,
    parentStepId: null,
    planned: null,
    program: "",
    rerunOfRunId: null,
    result: null,
    startedAt: new Date(now - 600_000).toISOString(),
    state: {},
    supervisorInstanceId: null,
    waiting: null,
    workflowId: WORKFLOW,
    workspace: "/bench",
  });
  workflowState.runs[RUN] = runOf(RUN, 60_000);
  workflowState.runs[FAILED_RUN] = runOf(FAILED_RUN, 90_000, true);

  // The home's Working and Finished (WorkTabs), fed the same way: runs that
  // are working (their pulses say so) and runs that ended unseen, twelve
  // and fourteen, so both counts take two figures, the tabs' widest.
  const WORKING = 12;
  const FINISHED = 14;
  const runId = (n: number) =>
    `0f1e2d3c-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  const workRuns = Array.from({ length: WORKING + FINISHED - 1 }, (_, n) =>
    runId(n)
  );
  for (const [n, id] of workRuns.entries()) {
    const working = n < WORKING;
    workflowState.runs[id] = runOf(id, working ? null : 120_000 + n * 1000);
    if (working) {
      debug.state.pulses[`run:${id}`] = {
        activity: "working",
        at: now,
        busy: true,
        currentTool: null,
        instanceId: `run:${id}`,
        runningSubagents: 0,
      };
    }
  }
  const WORK_IDS = ["working", "finished"] as const;
  workTab.set(
    page.url.searchParams.get("work") === "finished" ? "finished" : "working"
  );

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
  /** The same tabs with the idle one chosen. */
  const idleLeaf = $state<LeafNode>({
    id: "folder-proof-idle",
    t: "l",
    tabs: ids,
    active: ids[2],
  });

  /**
   * The rims' three tunable tokens, written live on the bench: the taper's
   * length (px), an unchosen tab's rim strength (%) and the rim's stroke
   * (px). Each starts at `?taper=`, `?subtle=` or `?width=` where given,
   * else at the token's value in the bench's theme.
   */
  const asked = (name: string) => {
    const value = untrack(() => page.url.searchParams.get(name));
    return value === null || value === "" ? null : Number(value);
  };
  const subtleAsked = asked("subtle");
  let proofEl = $state<HTMLElement>();
  let taper = $state<number | null>(asked("taper"));
  let subtle = $state<number | null>(subtleAsked);
  let width = $state<number | null>(asked("width"));
  $effect(() => {
    // Again whenever the theme changes.
    if (!(proofEl && scheme)) {
      return;
    }
    // Read once the theme has landed on the root.
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) =>
        Number.parseFloat(style.getPropertyValue(name));
      taper ??= token("--tab-rim-taper");
      width ??= token("--tab-rim-width");
      // The token is a strength 0 to 1; the slider reads it in percent.
      if (subtleAsked === null) {
        subtle = Math.round(token("--tab-rim-mix-subtle") * 100);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  /** The drawer layout, where the home is the phone's page, not the rail's. */
  const phone = new MediaQuery("(max-width: 899px)");

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
   * A swipe carrying the session strip's choice, as the phone's pane swipe
   * hands it (gesture.svelte.ts `travel`): a new object each frame, toward
   * a tab by a fraction; null at rest. `land` ends it on a tab, both in one
   * change, as the gesture's landing does.
   */
  let travel = $state<TabsTravel | null>(null);
  function ride(toward: string | null, fraction = 0) {
    travel = toward === null ? null : { toward, fraction };
  }
  function land(id: string) {
    travel = null;
    choose(id);
  }

  /**
   * A click that would choose a tab (its link, its empty details slot) or
   * close one is the bench's: the strip's own would act on the workspace.
   * The chosen tab's own click (its details card) is left to the strip.
   */
  const benchClick = (group: LeafNode) => (event: MouseEvent) => {
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
    if (id === group.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (group.tabs.includes(id)) {
      group.active = id;
    }
  };

  let workEl = $state<HTMLElement>();
  /** Chooses Working or Finished as a click on its tab does. */
  function chooseWork(id: string) {
    const at = WORK_IDS.indexOf(id as (typeof WORK_IDS)[number]);
    workEl?.querySelectorAll<HTMLElement>(".ff-tab > .hit")[at]?.click();
  }

  onMount(() => {
    const bench = {
      ids,
      choose,
      ride,
      land,
      chosen: () => leaf.active,
      work: {
        ids: [...WORK_IDS],
        choose: chooseWork,
        chosen: () => workTab.current,
      },
    };
    Object.assign(window, { __ft: bench });
    return () => {
      Reflect.deleteProperty(window, "__ft");
      for (const id of Object.keys(DOING)) {
        delete debug.state.pulses[id];
      }
      for (const id of workRuns) {
        delete debug.state.pulses[`run:${id}`];
        delete workflowState.runs[id];
      }
      delete workflowState.runs[RUN];
      delete workflowState.runs[FAILED_RUN];
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
<div
  class="proof"
  data-folder-proof
  bind:this={proofEl}
  style:--tab-rim-mix-subtle={subtle === null
    ? undefined
    : String(subtle / 100)}
  style:--tab-rim-taper={taper === null ? undefined : String(taper)}
  style:--tab-rim-width={width === null ? undefined : String(width)}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="group" data-strip="session" onclickcapture={benchClick(leaf)}>
    <PaneTabs {leaf} {travel} />
    <div class="page"></div>
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="group"
    data-strip="session-idle"
    onclickcapture={benchClick(idleLeaf)}
  >
    <PaneTabs leaf={idleLeaf} />
    <div class="page"></div>
  </div>
  <!-- The rims' tokens, tuned live. -->
  <div class="dials">
    <label>
      <span>Taper</span>
      <input
        max="32"
        min="0"
        step="1"
        type="range"
        bind:value={
          () => taper ?? 0,
          (v) => {
            taper = v;
          }
        }
      />
      <output>{taper ?? "–"}px</output>
    </label>
    <label>
      <span>Subtle</span>
      <input
        max="100"
        min="0"
        step="1"
        type="range"
        bind:value={
          () => subtle ?? 0,
          (v) => {
            subtle = v;
          }
        }
      />
      <output>{subtle ?? "–"}%</output>
    </label>
    <label>
      <span>Thickness</span>
      <input
        max="4"
        min="0.5"
        step="0.25"
        type="range"
        bind:value={
          () => width ?? 1.5,
          (v) => {
            width = v;
          }
        }
      />
      <output>{width ?? "–"}px</output>
    </label>
  </div>
  <!-- The home's Working and Finished as the shell hosts them: in the
       rail's column on the desk, across the phone's home page under a
       finger. -->
  <div class="home" data-strip="work" bind:this={workEl}>
    <WorkTabs
      onstart={() => undefined}
      stale={false}
      variant={phone.current ? "page" : "rail"}
      waiting={false}
    />
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
  /* What the strips open (the session card, a tab's menu) is portalled to
     the body and stands over the bench, so a finger reaches it. bits-ui
     writes the wrapper's z-index inline, from the surface's own. */
  :global(body:has([data-folder-proof]) [data-bits-floating-content-wrapper]) {
    z-index: 2147483001 !important;
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
  .group .page {
    block-size: var(--space-7);
    background: var(--surface-recess);
  }
  /* The bench's own controls, at the foot, clear of every strip. */
  .dials {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    padding: var(--space-3) var(--space-5);
    background: var(--surface-raised);
    border-block-start: 1px solid var(--border-hairline);
    font: var(--type-label);
    color: var(--ink-muted);

    & label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    & output {
      min-inline-size: 4ch;
      color: var(--ink-strong);
      font-variant-numeric: tabular-nums;
    }
  }
  /* The rail's column (Shell .rail, Home .rail .groups) on the desk; the
     phone's home page (Home .page .groups) under 900px. Both stand on
     surface-recess. */
  .home {
    flex: 1 1 auto;
    min-block-size: 0;
    inline-size: 260px;
    padding: var(--space-1) var(--space-2) var(--space-2);
    overflow: hidden;
    background: var(--surface-recess);

    @media (max-width: 899px) {
      inline-size: 100%;
      padding: var(--space-2) var(--space-5) var(--space-7);
    }
  }
</style>
