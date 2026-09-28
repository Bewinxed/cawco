<script lang="ts">
  import type {
    DelegateType,
    Problem,
    WorkflowGraph,
    WorkflowNode,
  } from "@whiffle/core";
  import { validateWorkflow } from "@whiffle/core";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { fade } from "svelte/transition";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Dialog from "$lib/components/ui/dialog";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Resizable from "$lib/components/ui/resizable";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { loadDelegateTypes, message } from "$lib/whiffle/delegate-types";
  import { newId } from "$lib/whiffle/id";
  import { appear, easeOut } from "$lib/whiffle/motion/curves.svelte";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import {
    refreshWorkflows,
    workflowState,
  } from "$lib/whiffle/workflow-state.svelte";
  import {
    loadWorkflow,
    saveWorkflow,
    type WorkflowDetail,
    WorkflowProblems,
  } from "$lib/whiffle/workflows";
  import WorkflowCanvas from "./WorkflowCanvas.svelte";
  import WorkflowInspector from "./WorkflowInspector.svelte";
  import WorkflowLaunch from "./WorkflowLaunch.svelte";
  import WorkflowProgram from "./WorkflowProgram.svelte";
  import WorkflowRunView from "./WorkflowRunView.svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { duration, kinds, newNode } from "./workflow-ui";

  let { id }: { id: string } = $props();
  const narrow = new MediaQuery("(max-width: 1023px)");
  let workflow = $state<WorkflowDetail>();
  let types = $state<DelegateType[]>([]);
  let name = $state("");
  let description = $state("");
  let root = $state<WorkflowGraph>({ nodes: [], edges: [] });
  let bodyPath = $state<string[]>([]);
  let selected = $state<string>();
  let errorMessage = $state("");
  let saving = $state(false);
  /** The button whose save is out, if a press started it. */
  let pressed = $state<"validate" | "retry" | null>(null);
  let failedPayload = $state("");
  let saved = $state("");
  let savedAt = $state(0);
  let now = $state(Date.now());
  let paletteOpen = $state(false);
  let inspectorOpen = $state(false);
  let paletteCollapsed = $state(false);
  let panelWidth = $state(940);
  let palettePane = $state<{ collapse: () => void; expand: () => void }>();
  let launch = $state(false);
  let program = $state("");
  /**
   * What the hub said about the last save: the compiler's and the
   * typechecker's diagnostics, which carry the node or the line they belong
   * to. They outlive the request so they can be pinned where the mistake is.
   */
  let hubProblems = $state<Problem[]>([]);
  let tab = $state(
    page.url.searchParams.get("tab") === "program" ? "program" : "editor"
  );
  let filter = $state("all");
  let runId = $state<string>();
  let history = $state<string[]>([]);
  let future = $state<string[]>([]);
  const graph = $derived.by(() => {
    let current = root;
    for (const key of bodyPath) {
      const node = current.nodes.find((entry) => entry.id === key);
      if (node?.kind === "map") {
        current = node.body;
      }
    }
    return current;
  });
  const origin = $derived(workflow?.origin ?? "editor");
  const node = $derived(graph.nodes.find((entry) => entry.id === selected));
  const edge = $derived(graph.edges.find((entry) => entry.id === selected));
  const serial = $derived(
    JSON.stringify(
      origin === "code"
        ? { name, description, program }
        : { name, description, graph: root }
    )
  );
  const dirty = $derived(serial !== saved);
  const live = $derived(whiffle.hub === "connected");
  /** The hub refused exactly what is on screen, with diagnostics to show. */
  const refused = $derived(serial === failedPayload && hubProblems.length > 0);
  const localProblems = $derived(
    origin === "code"
      ? []
      : validateWorkflow(root, {
          workflowId: id,
          resolveWorkflow: (key) =>
            key === id
              ? { id, name, graph: root }
              : workflowState.workflows.find((entry) => entry.id === key),
        })
  );
  // What the editor can see as it is typed, plus what the hub said when it
  // last compiled — the compiler's diagnostics are the half no client can
  // derive, and they carry the node they belong to.
  const problems = $derived.by(() => {
    const seen = new Set<string>();
    return [...localProblems, ...hubProblems].filter((problem) => {
      const key = `${problem.nodeId ?? problem.edgeId ?? ""}|${problem.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });
  const runs = $derived(
    Object.values(workflowState.runs)
      .filter(
        (run) =>
          run.workflowId === id && (filter === "all" || run.status === filter)
      )
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
  );
  onMount(() => {
    Promise.all([loadWorkflow(id), loadDelegateTypes(), refreshWorkflows()])
      .then(([value, presets]) => {
        workflow = value;
        ({ name, description, program } = value);
        root = value.graph ?? root;
        hubProblems = value.problems;
        // A code-origin workflow has no canvas: the program is the editor.
        if (value.origin === "code") {
          tab = "program";
        }
        ({ types } = presets);
        saved = JSON.stringify(
          value.origin === "code"
            ? { name, description, program }
            : { name, description, graph: root }
        );
        savedAt = Date.now();
      })
      .catch((caught) => {
        errorMessage = message(caught);
      });
    const clock = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(clock);
  });
  $effect(() => {
    if (!(workflow && dirty && live) || saving || serial === failedPayload) {
      return;
    }
    const payload = serial;
    const timer = setTimeout(() => {
      persist(payload);
    }, 600);
    return () => clearTimeout(timer);
  });
  beforeNavigate((navigation) => {
    if (!dirty) {
      return;
    }
    navigation.cancel();
    const target = navigation.to?.url;
    persist(serial).then(() => {
      if (target && !dirty) {
        goto(target);
      }
    });
  });
  async function persist(payload: string) {
    if (saving || !live) {
      return;
    }
    saving = true;
    try {
      const value = await saveWorkflow(id, JSON.parse(payload));
      workflow = value;
      saved = payload;
      savedAt = Date.now();
      errorMessage = "";
      hubProblems = value.problems;
      workflowState.workflows = [
        ...workflowState.workflows.filter((entry) => entry.id !== id),
        value,
      ];
    } catch (caught) {
      failedPayload = payload;
      if (caught instanceof WorkflowProblems) {
        hubProblems = caught.problems;
        errorMessage = "";
      } else {
        errorMessage = message(caught);
      }
    } finally {
      saving = false;
    }
  }
  /** A save a button asked for: that button is pending until it ends. */
  async function persistFrom(from: "validate" | "retry") {
    pressed = from;
    try {
      await persist(serial);
    } finally {
      pressed = null;
    }
  }
  /**
   * Validate saves and shows what the hub found. On a narrow screen the
   * inspector (where the problems read) opens once the save has answered, so
   * the pending button keeps focus while it runs.
   */
  async function validate() {
    selected = undefined;
    await persistFrom("validate");
    inspectorOpen = narrow.current;
  }
  function commit(next: WorkflowGraph) {
    history = [...history.slice(-49), JSON.stringify(root)];
    future = [];
    function replace(current: WorkflowGraph, path: string[]): WorkflowGraph {
      const [first, ...rest] = path;
      if (!first) {
        return next;
      }
      return {
        ...current,
        nodes: current.nodes.map((entry) =>
          entry.id === first && entry.kind === "map"
            ? { ...entry, body: replace(entry.body, rest) }
            : entry
        ),
      };
    }
    root = replace(root, bodyPath);
  }
  function undo() {
    const prior = history.at(-1);
    if (!prior) {
      return;
    }
    future = [...future, JSON.stringify(root)];
    history = history.slice(0, -1);
    root = JSON.parse(prior);
    selected = undefined;
  }
  function redo() {
    const next = future.at(-1);
    if (!next) {
      return;
    }
    history = [...history, JSON.stringify(root)];
    future = future.slice(0, -1);
    root = JSON.parse(next);
    selected = undefined;
  }
  function select(key?: string) {
    selected = key;
    inspectorOpen = narrow.current;
  }
  function add(kind: WorkflowNode["kind"], preset?: DelegateType) {
    let next = newNode(kind, {
      x: 80 + (graph.nodes.length % 3) * 340,
      y: 120 + Math.floor(graph.nodes.length / 3) * 320,
    });
    if (preset && next.kind === "step") {
      next = {
        ...next,
        title: preset.name,
        delegateType: preset.name,
        harness: preset.harness,
        model: preset.model,
        effort: preset.effort,
        skills: preset.skills,
        denyTools: preset.denyTools,
      };
    }
    commit({ ...graph, nodes: [...graph.nodes, next] });
    select(next.id);
    paletteOpen = false;
  }
  function keys(event: KeyboardEvent) {
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
    ) {
      return;
    }
    if (tab !== "editor" || launch) {
      return;
    }
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if (command && event.key.toLowerCase() === "d" && node) {
      event.preventDefault();
      const copy = {
        ...JSON.parse(JSON.stringify(node)),
        id: newId(),
        title: `${node.title} copy`,
        position: { x: node.position.x + 40, y: node.position.y + 80 },
      };
      commit({ ...graph, nodes: [...graph.nodes, copy] });
      select(copy.id);
    } else if (event.key.toLowerCase() === "a" && !command) {
      event.preventDefault();
      add("step");
    } else if (event.key === "Delete" && selected) {
      event.preventDefault();
      commit({
        ...graph,
        nodes: graph.nodes.filter((entry) => entry.id !== selected),
        edges: graph.edges.filter(
          (entry) =>
            entry.id !== selected &&
            entry.from.node !== selected &&
            entry.to.node !== selected
        ),
      });
      selected = undefined;
    } else if (event.key === "Escape") {
      selected = undefined;
      inspectorOpen = false;
      paletteOpen = false;
    }
  }
</script>
<svelte:window onkeydown={keys} />
{#snippet palette()}
  <div class="palette wf-stack" {@attach highlight({ rows: ".palette-item" })}>
    <div class="wf-row wf-spread">
      <h2>{paletteCollapsed ? 'Add' : 'Nodes'}</h2>
      {#if !narrow.current}
        <button
          aria-label="Toggle palette"
          class="wf-btn"
          onclick={() => { if (paletteCollapsed) { palettePane?.expand(); } else { palettePane?.collapse(); } }}
          type="button"
        >
          {paletteCollapsed ? '›' : '‹'}
        </button>
      {/if}
    </div>
    {#each ['Flow', 'Work', 'People'] as group (group)}
      <section class="wf-stack">
        <h3>{group}</h3>
        {#each kinds.filter((entry) => entry.group === group) as entry (entry.kind)}
          <button
            class="palette-item pressable"
            onclick={() => add(entry.kind)}
            title={entry.meaning}
            type="button"
          >
            <span class="kind-mark" class:filled={entry.kind === 'step'}
              ><entry.icon class="size-4" /></span
            >
            {#if !paletteCollapsed || narrow.current}
              <span>{entry.title}<small>{entry.meaning}</small></span>
            {/if}
          </button>
        {/each}
      </section>
    {/each}
    {#if !paletteCollapsed || narrow.current}
      <section class="wf-stack">
        <h3>Templates</h3>
        {#each types as type (type.name)}
          <button
            class="palette-item pressable"
            onclick={() => add('step', type)}
            type="button"
          >
            <span>{type.name}<small>{type.harness} · {type.model}</small></span>
          </button>
        {/each}
      </section>
    {/if}
  </div>
{/snippet}
{#snippet inspector()}
  <WorkflowInspector
    {description}
    {edge}
    editBody={(key) => { bodyPath = [...bodyPath, key]; selected = undefined; inspectorOpen = false; }}
    {graph}
    {node}
    onchange={commit}
    ondescription={(value) => { description = value; }}
    onselect={select}
    {problems}
    {types}
    workflowId={id}
    workflows={workflowState.workflows}
  />
{/snippet}
{#snippet canvas()}
  <div class="canvas-wrap">
    {#if bodyPath.length}
      <button
        class="wf-btn back-body"
        onclick={() => { bodyPath = bodyPath.slice(0, -1); selected = undefined; }}
        type="button"
      >
        Back to parent graph
      </button>
    {/if}
    <WorkflowCanvas
      canRedo={future.length > 0}
      canUndo={history.length > 0}
      {graph}
      onchange={commit}
      onselect={select}
      {problems}
      {redo}
      selection={selected}
      {undo}
    />
    {#if graph.nodes.length === 1 && graph.nodes[0].kind === 'start'}
      <p class="hint">
        Choose a step from the palette, or press <kbd>A</kbd> to add one.
      </p>
    {/if}
  </div>
{/snippet}
<div class="wf editor" bind:clientWidth={panelWidth}>
  <header class="wf-stack">
    <div class="wf-row wf-spread">
      <div class="breadcrumb">
        <a href="/workflows">Workflows</a><span>/</span>
        <input
          aria-label="Workflow name"
          disabled={!workflow}
          bind:value={name}
        >
      </div>
      <div class="wf-row">
        <button
          aria-busy={pressed === 'validate' || undefined}
          aria-disabled={pressed === 'validate' || undefined}
          class="wf-btn"
          disabled={!(workflow && live) || (saving && pressed !== 'validate')}
          onclick={whileIdle(() => pressed === 'validate', validate)}
          title={live ? undefined : "Can't save while the hub is unreachable"}
          type="button"
        >
          <PendingContent
            failed={errorMessage !== ''}
            label="Validate"
            pending={pressed === 'validate'}
            pendingLabel="Validating…"
          />
        </button><button
          class="wf-btn wf-primary"
          disabled={!(workflow && live) || !!errorMessage || dirty || saving || problems.length > 0}
          onclick={() => { inspectorOpen = false; paletteOpen = false; launch = true; }}
          title={live ? undefined : "Can't run while the hub is unreachable"}
          type="button"
        >
          Run workflow
        </button>
      </div>
    </div>
    <div class="wf-row wf-spread">
      <div class="wf-row">
        {#if origin === 'editor'}
          <button
            aria-pressed={tab === 'editor'}
            class="wf-btn"
            onclick={() => { tab = 'editor'; }}
            type="button"
          >
            Editor
          </button>
        {/if}
        <button
          aria-pressed={tab === 'program'}
          class="wf-btn"
          onclick={() => { tab = 'program'; }}
          type="button"
        >
          Program
        </button><button
          aria-pressed={tab === 'runs'}
          class="wf-btn"
          onclick={() => { tab = 'runs'; }}
          type="button"
        >
          Runs
        </button>
        {#if narrow.current && tab === 'editor'}
          <button
            class="wf-btn"
            onclick={() => { paletteOpen = true; }}
            type="button"
          >
            + Add node
          </button><button
            class="wf-btn num"
            onclick={() => { inspectorOpen = true; }}
            type="button"
          >
            Inspector · {problems.length}
          </button>
        {/if}
      </div>
      <span class="wf-muted num" role="status"
        >{#if saving}
          Saving…
        {:else if refused}
          Not saved · {problems.length}
          {problems.length === 1 ? 'problem' : 'problems'}
        {:else if dirty}
          Unsaved changes
        {:else if savedAt}
          Saved · {Math.max(0, Math.floor((now - savedAt) / 1000))}s ago
        {:else}
          Loading…
        {/if}</span
      >
    </div>
  </header>
  {#if errorMessage}
    <div class="wf-error" role="alert">
      {errorMessage}
      <button
        aria-busy={pressed === 'retry' || undefined}
        aria-disabled={pressed === 'retry' || undefined}
        class="wf-btn"
        onclick={whileIdle(() => pressed === 'retry', () => persistFrom('retry'))}
        type="button"
      >
        <PendingContent
          failed={errorMessage !== ''}
          label="Retry save"
          pending={pressed === 'retry'}
          pendingLabel="Saving…"
        />
      </button>
    </div>
  {/if}
  {#if !workflow}
    <div class="loading wf-stack">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-20 w-full" />
    </div>
  {:else if tab === 'program'}
    <WorkflowProgram
      {live}
      onchange={(value) => { program = value; }}
      {origin}
      {problems}
      {program}
    />
  {:else if tab === 'editor'}
    {#if narrow.current}
      {@render canvas()}
    {:else}
      <Resizable.PaneGroup class="min-h-0 flex-1" direction="horizontal"
        ><Resizable.Pane
          collapsedSize={48 / panelWidth * 100}
          collapsible
          defaultSize={232 / panelWidth * 100}
          maxSize={30}
          minSize={15}
          onCollapse={() => { paletteCollapsed = true; }}
          onExpand={() => { paletteCollapsed = false; }}
          bind:this={palettePane}
          >{@render palette()}</Resizable.Pane
        ><Resizable.Handle />
        <Resizable.Pane defaultSize={100 - 592 / panelWidth * 100} minSize={20}
          >{@render canvas()}</Resizable.Pane
        ><Resizable.Handle />
        <Resizable.Pane
          defaultSize={360 / panelWidth * 100}
          maxSize={50}
          minSize={25}
          ><div class="inspector-scroll">
            {@render inspector()}
          </div></Resizable.Pane
        ></Resizable.PaneGroup
      >
    {/if}
  {:else}
    <div class="runs" {@attach highlight({ rows: ".run-entry" })}>
      <aside class="run-list wf-stack">
        <!-- The kit's ghost and pill: hover glides, and the pill follows the
             choice (the chips draw no fill of their own here). -->
        <div
          class="wf-row filters"
          {@attach highlight({ rows: '.wf-btn', selected: '[aria-pressed="true"]', axis: 'x' })}
        >
          {#each [{ value: 'all', label: 'All' }, { value: 'waiting', label: 'Needs you' }, { value: 'failed', label: 'Failed' }] as item (item.value)}
            <button
              aria-pressed={filter === item.value}
              class="wf-btn"
              onclick={() => { filter = item.value; }}
              type="button"
            >
              {item.label}
            </button>
          {/each}
        </div>
        {#if !runs.length}
          <p class="wf-muted">No workflow runs in this view.</p>
        {/if}
        {#each runs as run (run.id)}
          <button
            class="run-entry wf-stack"
            onclick={() => { runId = run.id; }}
            type="button"
            transition:unfold
          >
            <div class="wf-row wf-spread">
              <span>{run.id.slice(0, 8)}</span>
              <WorkflowStatus status={run.status} />
            </div>
            <span class="wf-muted"
              >{new Date(run.startedAt).toLocaleString()}
              · {duration(run.startedAt, run.endedAt, now)}</span
            ><span class="wf-muted"
              >{run.launchedBy}
              ·
              {run.supervisorInstanceId ? `Supervisor ${run.supervisorInstanceId.slice(0, 8)}` : 'No supervisor'}</span
            >
          </button>
        {/each}
      </aside>
      <div class="run-preview">
        {#if runId}
          <!-- One run gives way to the next in place: they cross-fade in one cell. -->
          {#key runId}
            <div
              class="run-swap"
              in:appear
              out:fade={{ duration: 120, easing: easeOut }}
            >
              <WorkflowRunView onprogram={() => { tab = 'program'; }} {runId} />
            </div>
          {/key}
        {:else}
          <p class="wf-muted">Select a workflow run to inspect its steps.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
{#if workflow && launch}
  <WorkflowLaunch onclose={() => { launch = false; }} {workflow} />
{/if}
{#if narrow.current}
  <Dialog.Root bind:open={paletteOpen}
    ><Dialog.Content class="max-h-[85dvh] overflow-y-auto"
      ><Dialog.Title>Add node</Dialog.Title
      ><Dialog.Description
        >Choose a kind or a delegate template.</Dialog.Description
      >
      <div class="wf">{@render palette()}</div></Dialog.Content
    ></Dialog.Root
  ><Dialog.Root bind:open={inspectorOpen}
    ><Dialog.Content class="max-h-[90dvh] overflow-y-auto"
      ><Dialog.Title>Workflow inspector</Dialog.Title
      ><Dialog.Description
        >Edit the selected node or workflow settings.</Dialog.Description
      >{@render inspector()}</Dialog.Content
    ></Dialog.Root
  >
{/if}
<style>
  .editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
  }
  header {
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-hairline);
    background: var(--surface-raised);
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex: 1 1 220px;
  }
  .breadcrumb a {
    color: var(--ink-muted);
    min-height: 24px;
    display: inline-flex;
    align-items: center;
  }
  .breadcrumb input {
    max-width: 300px;
    border-color: transparent;
    font-size: var(--text-body);
    font-weight: 500;
  }
  .palette {
    padding: var(--space-4) var(--space-3);
    height: 100%;
    overflow-y: auto;
  }
  .palette-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    text-align: left;
    min-height: 46px;
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }
  .palette-item span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .palette-item small {
    display: block;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    line-height: 1.4;
    margin-top: var(--space-1);
  }
  .kind-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border: 1px solid var(--neutral-8);
    border-radius: var(--radius-sm);
  }
  .filled {
    background: var(--brand-solid);
    color: var(--on-brand);
  }
  .inspector-scroll {
    height: 100%;
    overflow-y: auto;
    background: var(--surface-raised);
  }
  .canvas-wrap {
    height: 100%;
    min-height: 300px;
    position: relative;
    flex: 1;
  }
  .hint {
    position: absolute;
    top: var(--space-4);
    inset-inline: var(--space-4);
    text-align: center;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    pointer-events: none;
    color: var(--ink-muted);
  }
  .back-body {
    position: absolute;
    z-index: 5;
    top: var(--space-2);
    left: var(--space-2);
  }
  .loading {
    padding: var(--space-6);
  }
  .runs {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .run-list {
    width: 300px;
    flex-shrink: 0;
    padding: var(--space-3);
    overflow-y: auto;
    border-right: 1px solid var(--border-hairline);
  }
  .run-entry {
    padding: var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--border-hairline);
  }
  .run-preview {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-width: 0;
    flex: 1;
  }
  .run-swap {
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 0;
  }
  .filters :global(.wf-btn),
  .filters :global(.wf-btn[aria-pressed="true"]) {
    background: transparent;
    filter: none;
  }
  @media (pointer: coarse) {
    .breadcrumb a {
      min-height: 44px;
    }
  }
  @media (max-width: 1023px) {
    header {
      padding: var(--space-3);
    }
    .runs {
      flex-direction: column;
      overflow-y: auto;
    }
    .run-list {
      width: 100%;
      max-height: 35dvh;
      border-right: 0;
    }
    .run-preview {
      min-height: 400px;
    }
  }
</style>
