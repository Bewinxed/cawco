<script lang="ts">
  import type {
    DelegateType,
    Problem,
    WorkflowGraph,
    WorkflowNode,
  } from "@cawco/core";
  import { validateWorkflow } from "@cawco/core";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { loadDelegateTypes } from "#lib/cawco/delegate-types.js";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { newId } from "#lib/cawco/id.js";
  import {
    crossIn,
    dur,
    reveal,
    revealOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { sessionTitle } from "#lib/cawco/session-names.svelte.js";
  import { workflowLaunches } from "#lib/cawco/workflow-launch.svelte.js";
  import { runHref } from "#lib/cawco/workflow-runs.js";
  import {
    refreshWorkflows,
    workflowState,
  } from "#lib/cawco/workflow-state.svelte.js";
  import {
    loadWorkflow,
    saveWorkflow,
    type WorkflowDetail,
    WorkflowProblems,
  } from "#lib/cawco/workflows.js";
  import { Alert } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconHistory } from "#lib/icons.js";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { paneSlide, towards } from "./pane-slide";
  import WorkflowCanvas from "./WorkflowCanvas.svelte";
  import WorkflowInspector from "./WorkflowInspector.svelte";
  import WorkflowLaunch from "./WorkflowLaunch.svelte";
  import WorkflowLaunchParked from "./WorkflowLaunchParked.svelte";
  import WorkflowProgram from "./WorkflowProgram.svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { duration, inspectorTitle, kinds, newNode } from "./workflow-ui";

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
  /** The editor's width, which the panes' shares are of: read as it mounts, and a change in the next frame (frameSize). */
  let panelWidth = $state(940);
  const measurePanel = frameSize<HTMLElement>((editor) => {
    panelWidth = editor.clientWidth;
  });
  let palettePane = $state<{ collapse: () => void; expand: () => void }>();
  /**
   * The palette folded to its 48px rail, as a share of the editor. paneforge
   * keeps every size to 10 decimals and tells a folded pane (and unfolds
   * one) by an exact match with this, so it is kept to the same 10: at full
   * precision the match never held, the palette folded once, never came
   * back, and never said it had folded.
   */
  const railSize = $derived(
    Number.parseFloat(((48 / panelWidth) * 100).toFixed(10))
  );

  let program = $state("");
  /**
   * What the hub said about a payload: the compiler's and the typechecker's
   * diagnostics, which carry the node or the line they belong to. Each one
   * describes only the payload it answered — the saved one, or the one it
   * refused — and is read only while the editor holds that payload again.
   */
  let savedProblems = $state<Problem[]>([]);
  let refusedProblems = $state<Problem[]>([]);
  let tab = $state(
    page.url.searchParams.get("tab") === "program" ? "program" : "editor"
  );
  const TABS = ["editor", "program", "runs"] as const;
  /** Which way the last tab change went, for the panes' slide. */
  let dir = $state(1);
  function show(next: string) {
    dir = towards(TABS, tab, next);
    tab = next;
  }
  let filter = $state("all");
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
  /** What the save line says; its words morph in place as the editor works. */
  const saveState = $derived.by(() => {
    if (!workflow) {
      return "Loading…";
    }
    if (saving) {
      return "Saving…";
    }
    if (refused) {
      return `Not saved · ${problems.length} ${problems.length === 1 ? "problem" : "problems"}`;
    }
    if (dirty) {
      return "Unsaved changes";
    }
    return `Saved · ${Math.max(0, Math.floor((now - savedAt) / 1000))}s ago`;
  });
  const live = $derived(cawco.hub === "connected");
  /**
   * The hub's word on exactly what is on screen, or nothing. An edit the hub
   * has not answered yet has no hub problems: an earlier answer described an
   * earlier graph, and showing it would pin a mistake already fixed. The
   * graph rules still read at once, from the local validator below.
   */
  const hubProblems = $derived.by(() => {
    if (serial === saved) {
      return savedProblems;
    }
    return serial === failedPayload ? refusedProblems : [];
  });
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
        savedProblems = value.problems;
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
    if (navigation.shallow) {
      return;
    }

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
      savedProblems = value.problems;
      workflowState.workflows = [
        ...workflowState.workflows.filter((entry) => entry.id !== id),
        value,
      ];
    } catch (caught) {
      failedPayload = payload;
      if (caught instanceof WorkflowProblems) {
        refusedProblems = caught.problems;
        errorMessage = "";
      } else {
        refusedProblems = [];
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
    if (narrow.current) {
      openInspector();
    }
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
  /** The workflow can run as it stands: saved, sound, and the hub there. */
  const runnable = $derived(
    !!(workflow && live) &&
      !errorMessage &&
      !dirty &&
      !saving &&
      problems.length === 0
  );
  /** Opens the launch form under the button that asked for it (workflow-launch.svelte.ts). */
  function openLaunch(from: HTMLElement) {
    if (!workflow) {
      return;
    }
    inspectorOpen = false;
    paletteOpen = false;
    workflowLaunches.openFor(workflow.id, workflow.name, from);
  }
  function openInspector() {
    inspectorOpen = true;
  }
  function select(key?: string) {
    selected = key;
    if (narrow.current) {
      openInspector();
    } else {
      inspectorOpen = false;
    }
  }
  /**
   * The palette's toggle folds it to its rail and back: every pane's width
   * glides together (paneforge marks the pane collapsing or expanding until
   * its flex-grow transition ends; app.css's components rule
   * `[data-slot="pane"] [data-pane-group]:has(> [data-pane-state="collapsing"],
   * > [data-pane-state="expanding"]) > [data-pane]` runs it, with motion
   * allowed).
   */
  function togglePalette() {
    if (paletteCollapsed) {
      palettePane?.expand();
    } else {
      palettePane?.collapse();
    }
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
    if (tab !== "editor" || workflowLaunches.open === workflow?.id) {
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
  <div
    data-slot="palette"
    class="kit-edge-fade-block flex h-full min-w-0 flex-col gap-space-4 overflow-y-auto px-space-1 py-space-4"
    {@attach highlight({ rows: '[data-slot="palette-item"]' })}
  >
    <!-- Heads and rows share one edge: the rows' highlight runs the
         palette's width, and their words start where the heads do. -->
    <div
      class="flex flex-wrap items-center justify-between gap-space-2 px-space-2"
    >
      <h2 class="type-label">
        <MorphText text={paletteCollapsed ? "Add" : "Nodes"} />
      </h2>
      {#if !narrow.current}
        <Button
          aria-label="Toggle palette"
          onclick={togglePalette}
          size="icon"
          type="button"
          variant="outline"
        >
          {paletteCollapsed ? "›" : "‹"}
        </Button>
      {/if}
    </div>
    {#each ["Flow", "Work", "People"] as group (group)}
      <section class="flex min-w-0 flex-col gap-space-4">
        <h3 class="px-space-2 type-label">{group}</h3>
        {#each kinds.filter((entry) => entry.group === group) as entry (entry.kind)}
          <button
            data-slot="palette-item"
            class="select-none press-tint flex min-h-c-btn-h-lg items-center gap-space-3 rounded-sm p-space-2 text-start"
            onclick={() => add(entry.kind)}
            title={entry.meaning}
            type="button"
          >
            <span
              class="grid size-c-mark min-w-0 shrink-0 place-items-center rounded-sm border border-border-control wrap-anywhere data-filled:bg-brand-solid data-filled:text-on-brand"
              data-filled={entry.kind === "step" || undefined}
              ><entry.icon class="size-icon-md" /></span
            >
            {#if !paletteCollapsed || narrow.current}
              <span class="min-w-0 wrap-anywhere" transition:crossIn
                >{entry.title}<small
                  class="mt-space-1 block text-meta text-ink-muted"
                  >{entry.meaning}</small
                ></span
              >
            {/if}
          </button>
        {/each}
      </section>
    {/each}
    {#if !paletteCollapsed || narrow.current}
      <section class="flex min-w-0 flex-col gap-space-4" transition:crossIn>
        <h3 class="px-space-2 type-label">Templates</h3>
        {#each types as type (type.name)}
          <button
            data-slot="palette-item"
            class="select-none press-tint flex min-h-c-btn-h-lg items-center gap-space-3 rounded-sm p-space-2 text-start"
            onclick={() => add("step", type)}
            type="button"
          >
            <span class="min-w-0 wrap-anywhere"
              >{type.name}<small
                class="mt-space-1 block text-meta text-ink-muted"
                >{type.harness} · {type.model}</small
              ></span
            >
          </button>
        {/each}
      </section>
    {/if}
  </div>
{/snippet}
{#snippet inspector(sheet = false)}
  <WorkflowInspector
    {sheet}
    {description}
    {edge}
    editBody={(key) => {
      bodyPath = [...bodyPath, key];
      selected = undefined;
      inspectorOpen = false;
    }}
    {graph}
    {node}
    onchange={commit}
    ondescription={(value) => {
      description = value;
    }}
    onselect={select}
    {problems}
    {types}
    workflowId={id}
    workflows={workflowState.workflows}
  />
{/snippet}
{#snippet canvas()}
  <div class="relative h-full min-h-c-graph-canvas-min flex-1">
    {#if bodyPath.length}
      <Button
        class="absolute top-space-2 start-space-2 z-5"
        onclick={() => {
          bodyPath = bodyPath.slice(0, -1);
          selected = undefined;
        }}
        type="button"
        variant="outline"
      >
        Back to parent graph
      </Button>
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
    {#if graph.nodes.length === 1 && graph.nodes[0].kind === "start"}
      <p
        class="pointer-events-none absolute inset-x-space-4 top-space-4 text-center text-size-meta font-normal text-ink-muted"
      >
        Choose a step from the palette, or press <kbd>A</kbd> to add one.
      </p>
    {/if}
  </div>
{/snippet}
<div
  data-slot="editor"
  class="flex h-full min-h-0 min-w-0 flex-1 flex-col type-body text-ink-strong"
  {@attach measurePanel}
>
  <header
    class="flex min-w-0 flex-col gap-space-4 border-b border-b-border-hairline bg-surface-raised px-space-5 py-space-3 max-wide:p-space-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-space-2">
      <div
        class="flex min-w-0 shrink grow basis-c-workflow-crumb items-center gap-space-2"
      >
        <a
          class="inline-flex min-h-c-btn-h-xs items-center text-ink-muted coarse:min-h-c-btn-h-lg"
          href="/workflows">Workflows</a
        ><span>/</span>
        <Input
          class="max-w-c-workflow-name-max"
          aria-label="Workflow name"
          disabled={!workflow}
          bind:value={name}
        />
      </div>
      <div class="flex flex-wrap items-center gap-space-2">
        <Button
          disabled={!(workflow && live) || (saving && pressed !== "validate")}
          failed={errorMessage !== ""}
          label="Validate"
          onclick={validate}
          pending={pressed === "validate"}
          pendingLabel="Validating…"
          title={live ? undefined : "Can't save while the hub is unreachable"}
          type="button"
          variant="outline"
        /><Button
          data-run-workflow={workflow?.id}
          disabled={!runnable}
          onclick={(event) => openLaunch(event.currentTarget)}
          title={live ? undefined : "Can't run while the hub is unreachable"}
          type="button"
        >
          Run workflow
        </Button>
      </div>
    </div>
    {#if workflow}
      <WorkflowLaunchParked workflowId={workflow.id} />
    {/if}
    <div class="flex flex-wrap items-center justify-between gap-space-2">
      <div class="flex flex-wrap items-center gap-space-2">
        <Tabs.Root onValueChange={show} value={tab}>
          <Tabs.List aria-label="Workflow views">
            {#if origin === "editor"}
              <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
            {/if}
            <Tabs.Trigger value="program">Program</Tabs.Trigger>
            <Tabs.Trigger value="runs">Runs</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <!-- Narrow-only, by the wrapper's display: the server renders this
             row before any media query can be asked, and a row that gained
             two buttons on hydration wrapped and pushed the page down. -->
        {#if tab === "editor"}
          <span class="hidden max-wide:contents"
            ><Button
              onclick={() => {
                paletteOpen = true;
              }}
              type="button"
              variant="outline"
            >
              + Add node
            </Button><Button
              figures="tabular"
              onclick={openInspector}
              type="button"
              variant="outline"
            >
              Inspector{#if problems.length}<span data-slot="num" class="num"
                  >&nbsp;· {problems.length}</span
                >{/if}
            </Button></span
          >
        {/if}
      </div>
      <span
        data-slot="num"
        class="num mark-line ms-auto flex w-c-workflow-save-w items-center justify-end gap-space-2 text-end type-meta text-ink-muted"
        role="status"
        >{#if !workflow || saving}<LiveDot />{/if}<MorphText
          text={saveState}
        /></span
      >
    </div>
  </header>
  {#if errorMessage}
    <Alert variant="destructive">
      {errorMessage}
      <Button
        failed={errorMessage !== ""}
        label="Retry save"
        onclick={() => persistFrom("retry")}
        pending={pressed === "retry"}
        pendingLabel="Saving…"
        type="button"
        variant="outline"
      />
    </Alert>
  {/if}
  {#if !workflow}
    <!-- It hands its place to the editor in its reveal (motion/curves). -->
    <div class="flex min-w-0 flex-col gap-space-4 p-space-6" out:revealOut>
      <Skeleton class="w-full" height="block" />
      <Skeleton class="w-full" height="block" />
    </div>
  {:else}
    <!-- One tab's pane gives way to the next in one cell, sliding across in
         tab order (pane-slide). -->
    <div
      class="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden"
      in:reveal
    >
      {#key tab}
        <div
          data-slot="pane"
          class="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col"
          in:paneSlide={{ dir }}
          out:paneSlide={{ dir }}
        >
          {#if tab === "program"}
            <WorkflowProgram
              {live}
              onchange={(value) => {
                program = value;
              }}
              {origin}
              {problems}
              {program}
            />
          {:else if tab === "editor"}
            {#if narrow.current}
              {@render canvas()}
            {:else}
              <Resizable.PaneGroup
                class="flex-1"
                direction="horizontal"
                height="shrink"
                ><Resizable.Pane
                  collapsedSize={railSize}
                  collapsible
                  defaultSize={(232 / panelWidth) * 100}
                  maxSize={30}
                  minSize={15}
                  onCollapse={() => {
                    paletteCollapsed = true;
                  }}
                  onExpand={() => {
                    paletteCollapsed = false;
                  }}
                  bind:this={palettePane}>{@render palette()}</Resizable.Pane
                ><Resizable.Handle />
                <Resizable.Pane
                  defaultSize={100 - (592 / panelWidth) * 100}
                  minSize={20}>{@render canvas()}</Resizable.Pane
                ><Resizable.Handle />
                <Resizable.Pane
                  defaultSize={(360 / panelWidth) * 100}
                  maxSize={50}
                  minSize={25}
                  ><div class="h-full overflow-y-auto bg-surface-raised">
                    {@render inspector()}
                  </div></Resizable.Pane
                ></Resizable.PaneGroup
              >
            {/if}
          {:else}
            <div
              data-slot="runs"
              class="flex min-h-0 flex-1 max-wide:flex-col max-wide:overflow-y-auto"
              {@attach highlight({ rows: '[data-slot="run-entry"]' })}
            >
              <!-- A run that starts, or a filter that changes what is
                   listed, moves the rows the house way (motion/rows). -->
              <aside
                class="flex w-c-workflow-runs-w min-w-0 shrink-0 flex-col gap-space-4 overflow-y-auto border-e border-e-border-hairline p-space-3 max-wide:w-full max-wide:border-e-0"
                {@attach reflow()}
              >
                <!-- Filters over the runs (DESIGN.md, filter-chip-active):
                     the chosen one in the brand wash, a 21px pill. -->
                <div
                  data-slot="filters"
                  class="flex flex-wrap items-center gap-space-2"
                >
                  {#each [{ value: "all", label: "All" }, { value: "waiting", label: "Needs you" }, { value: "failed", label: "Failed" }] as item (item.value)}
                    <button
                      data-slot="run-filter"
                      class="select-none pointer-hit touch-hit inline-flex h-space-6 items-center rounded-pill px-space-3 type-label text-ink-muted transition-colors aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover"
                      aria-pressed={filter === item.value}
                      onclick={() => {
                        filter = item.value;
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  {/each}
                </div>
                {#if !runs.length}
                  <p class="type-meta text-ink-muted" data-flip>
                    No workflow runs in this view.
                  </p>
                {/if}
                <!-- A run opens in its own tab, as a session does: watching
                     a run is not editing its workflow. -->
                {#each runs as run (run.id)}
                  {@const supervisor = run.supervisorInstanceId
                    ? sessionTitle(run.supervisorInstanceId)
                    : null}
                  <!-- When it started over how long it took, as one
                       block, its state at the end. -->
                  <a
                    data-slot="run-entry"
                    class="flex min-w-0 items-center justify-between gap-space-3 border-b border-b-border-hairline p-space-3 text-start text-inherit no-underline"
                    data-flip
                    href={runHref(run.id)}
                  >
                    <span class="flex min-w-0 flex-col gap-space-1">
                      <span class="wrap-anywhere"
                        >{new Date(run.startedAt).toLocaleString()}</span
                      >
                      <span class="type-meta wrap-anywhere text-ink-muted"
                        >{duration(run.startedAt, run.endedAt, now)}
                        {supervisor ? ` · from ${supervisor}` : ""}</span
                      >
                    </span>
                    <WorkflowStatus status={run.status} />
                  </a>
                {/each}
              </aside>
              <!-- Beside the list on a desk: a run opens in its own tab, so
                   nothing is chosen here, and the pane offers the work that
                   fills the list (DESIGN.md, Empty). -->
              <div class="flex min-w-0 flex-1 max-wide:hidden">
                <EmptyState
                  class="flex-1"
                  icon={IconHistory}
                  line="A run opens in its own tab, as a session does."
                  pad="pane"
                  title={runs.length ? "Open a run to watch it" : "No runs yet"}
                >
                  {#snippet action()}
                    <Button
                      disabled={!runnable}
                      onclick={(event) => openLaunch(event.currentTarget)}
                      size="sm"
                      title={live
                        ? undefined
                        : "Can't run while the hub is unreachable"}
                      type="button"
                      variant="outline">Run workflow</Button
                    >
                  {/snippet}
                </EmptyState>
              </div>
            </div>
          {/if}
        </div>
      {/key}
    </div>
  {/if}
</div>
{#if workflow && workflowLaunches.open === workflow.id}
  <WorkflowLaunch {workflow} />
{/if}
{#if narrow.current}
  <Dialog.Root bind:open={paletteOpen}
    ><Dialog.Content
      ><Dialog.Title>Add node</Dialog.Title><Dialog.Description
        >Choose a kind or a delegate template.</Dialog.Description
      >
      {@render palette()}</Dialog.Content
    ></Dialog.Root
  >
  <!-- The inspector is the house phone sheet (DESIGN.md, A sheet's
       inspector, and the Drawer recipe): over the page's foot, edge to edge,
       as tall as it needs up to 60% of the screen, the graph above it live
       (The Open Page Rule), and it follows a drag 1:1 back down. -->
  <Drawer.Root direction="bottom" modal={false} bind:open={inspectorOpen}>
    <Drawer.Content
      height="shrink"
      modal={false}
      style="--drawer-max-height: var(--c-sheet-inspector-max-h)"
      title={inspectorTitle(node, edge)}
    >
      {#snippet actions()}
        {#if node}
          <Button
            onclick={() => select()}
            size="sm"
            type="button"
            variant="ghost">Settings</Button
          >
        {/if}
      {/snippet}
      <Drawer.Description visible={false}
        >Edit the selected node or workflow settings.</Drawer.Description
      >
      <div
        class="kit-sheet-scroll kit-edge-fade-block min-h-0 touch-pan-y overflow-y-auto overscroll-contain"
      >
        {@render inspector(true)}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
