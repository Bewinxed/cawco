<script lang="ts">
  import type { WorkflowNode, WorkflowRun, WorkflowStep } from "@cawco/core";
  import { workflowPorts } from "@cawco/core";
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import {
    IconCpu,
    IconJev,
    IconToolQuestion,
    IconToolTodo,
    IconWorkflow,
  } from "$lib/icons";
  import type {
    JournalCheckpoint,
    JournalJev,
    JournalNode,
  } from "./journal-graph";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { JEV_TYPE_NAMES, kinds } from "./workflow-ui";

  let { data, selected }: NodeProps = $props();
  /** Present for an authored node, and for the journal's `run`/`spawn` steps. */
  const node = $derived(data.node as WorkflowNode | undefined);
  /** Present only on a code-origin run, where the journal is the graph. */
  const journal = $derived(data.journal as JournalNode | undefined);
  const checkpoints = $derived((data.checkpoints ?? []) as JournalCheckpoint[]);
  /** What a Jev call on this node answered, once it has. */
  const jevCall = $derived(data.jev as JournalJev | undefined);
  /** A call the journal records but no authored node stands behind. */
  const effectGlyphs = {
    run: IconCpu,
    spawn: IconCpu,
    ask: IconToolQuestion,
    exec: IconToolTodo,
    exists: IconToolTodo,
    jev: IconJev,
    workflow: IconWorkflow,
  } as const;
  const step = $derived(data.step as WorkflowStep | undefined);

  /**
   * Stacked ports sit a few screen pixels apart at fit zoom, too close for
   * a target each. Under a mouse the port column is one target, and it acts
   * for the port whose centre is nearest the pointer: that handle shows it
   * on hover, and a press starts the connection from it.
   */
  let portsEl = $state<HTMLElement | null>(null);
  let near = $state<string | null>(null);
  const nearest = (y: number): HTMLElement =>
    [
      ...(portsEl as HTMLElement).querySelectorAll<HTMLElement>(
        ".svelte-flow__handle"
      ),
    ]
      .map((handle) => {
        const box = handle.getBoundingClientRect();
        return { handle, gap: Math.abs(box.top + box.height / 2 - y) };
      })
      .reduce((a, b) => (b.gap < a.gap ? b : a)).handle;
  const aim = (event: MouseEvent) => {
    near = nearest(event.clientY).dataset.handleid ?? null;
  };
  /** The press and the click go to the nearest port's handle, where Svelte Flow listens. */
  const route = (event: MouseEvent) => {
    event.preventDefault();
    nearest(event.clientY).dispatchEvent(
      new MouseEvent(event.type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        button: event.button,
        buttons: event.buttons,
      })
    );
  };
  const child = $derived(data.child as WorkflowRun | undefined);
  // A journal node has no authored ports — the journal records calls, not a
  // wiring the operator drew — so it carries one plain out handle.
  const ports = $derived(journal || !node ? [] : workflowPorts(node));
  const title = $derived(node?.title ?? journal?.title ?? "");
  const modelled = $derived(
    node?.kind === "step" ||
      journal?.kind === "run" ||
      journal?.kind === "spawn"
  );
  const Glyph = $derived(
    node
      ? (kinds.find((entry) => entry.kind === node.kind)?.icon ?? kinds[0].icon)
      : (effectGlyphs[journal?.kind as keyof typeof effectGlyphs] ??
          kinds[0].icon)
  );
  const summary = $derived.by(() => {
    if (!node) {
      return journal?.kind === "workflow"
        ? String(data.childName ?? "Child workflow")
        : (journal?.lines.join(" · ") ?? "");
    }
    switch (node.kind) {
      case "start":
        return node.inputs.map((input) => input.name).join(", ") || "No inputs";
      case "end":
        return Object.keys(node.outputs).join(", ") || "No outputs";
      case "step":
        return node.prompt.split("\n")[0] || "Write a task in the inspector";
      case "check":
        return `${node.rules.length} rules · all must pass`;
      case "ask":
        return node.question || "What should happen next?";
      case "branch":
        return "First matching case";
      case "map":
        return node.over || "Choose an array";
      case "workflow":
        return `${String(data.childName || "Choose a workflow")} · ${Object.keys(node.inputs).length} inputs`;
      case "jev":
        return `${node.questions.length} ${node.questions.length === 1 ? "question" : "questions"} · ${[
          ...new Set(
            node.questions.map((question) => JEV_TYPE_NAMES[question.type])
          ),
        ].join(", ")}`;
      default:
        return "";
    }
  });
</script>
<article
  class="wf-node"
  class:map={node?.kind === 'map'}
  class:running={step?.status === 'running'}
  class:selected={selected}
>
  {#if node?.kind !== 'start'}
    <Handle
      aria-label="Input for {title}"
      class="pointer-hit"
      position={Position.Left}
      type="target"
    />
  {/if}
  <header>
    <span class="glyph" class:filled={modelled}
      ><Glyph aria-hidden="true" class="size-4" /></span
    ><strong>{title}</strong>
    {#if step}
      <WorkflowStatus status={step.status} />
    {/if}
  </header>
  <div class="body">
    {#if node?.kind === 'step'}
      <p class="meta">{node.harness} · {node.model || 'Choose a model'}</p>
    {/if}
    <p class="summary">{summary}</p>
    {#if node?.kind === 'map'}
      <p class="group">{node.body.nodes.length} nodes in body</p>
    {/if}
    {#if step && node?.kind === 'step'}
      <p class="meta">{String(data.duration)} · {String(data.cost)}</p>
    {/if}
    {#if jevCall?.failure}
      <div class="problem">
        <WorkflowStatus status="failed" /><span>{jevCall.failure}</span>
      </div>
    {:else if jevCall}
      <dl class="answers">
        {#each jevCall.answers as answer (answer.id)}
          <div>
            <dt>{answer.id}</dt>
            <dd>{answer.text}</dd>
          </div>
        {/each}
      </dl>
      <p class="meta">{jevCall.cost}</p>
    {/if}
    {#each checkpoints as mark (mark.seq)}
      <p class="checkpoint">
        <span aria-hidden="true" class="mark"></span>{mark.label}
        <time>{new Date(mark.at).toLocaleTimeString()}</time>
      </p>
    {/each}
    {#if child}
      <div class="child nodrag">
        <WorkflowStatus status={child.status} />
        <a href="/workflows/{child.workflowId}/runs/{child.id}"
          >Open child run</a
        >
      </div>
    {/if}
    {#if data.problem}
      <div class="problem">
        <WorkflowStatus status="waiting" /><span>{String(data.problem)}</span>
      </div>
    {/if}
  </div>
  {#if ports.length > 1}
    <div class="ports" bind:this={portsEl}>
      {#each ports as port (port)}
        <div class="port" class:near={near === port}>
          {port}
          <Handle
            aria-label="{title}: {port}"
            id={port}
            position={Position.Right}
            type="source"
          />
        </div>
      {/each}
      <div
        aria-hidden="true"
        class="port-hit nodrag nopan"
        onclick={route}
        onmousedown={route}
        onmouseleave={() => { near = null; }}
        onmousemove={aim}
      ></div>
    </div>
  {:else if ports[0]}
    <Handle
      aria-label="{title}: {ports[0]}"
      class="pointer-hit"
      id={ports[0]}
      position={Position.Right}
      type="source"
    />
  {:else if journal}
    <Handle
      aria-label="{title}: out"
      class="pointer-hit"
      position={Position.Right}
      type="source"
    />
  {/if}
</article>
<style>
  .wf-node {
    width: 260px;
    background: var(--surface-raised);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    /* The selection ring is always drawn, over the card's own border (so
       the border itself turns the colour, never a second ring round it);
       choosing a node fades its colour in over --dur-control, and the one
       let go fades out the same way. Keyboard focus on the node uses the
       same ring in the focus colour. */
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);
    transition: outline-color var(--dur-control) var(--ease-out);
  }
  .selected {
    outline-color: var(--brand-solid);
  }
  :global(.svelte-flow__node:focus-visible) .wf-node {
    outline-color: var(--focus-ring);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
  }
  strong {
    font-weight: var(--weight-strong);
    flex: 1;
    overflow-wrap: anywhere;
    color: var(--ink-strong);
  }
  .glyph {
    width: 28px;
    height: 28px;
    border: 1px solid var(--neutral-8);
    border-radius: var(--radius-sm);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .filled {
    background: var(--brand-solid);
    color: var(--on-brand);
    border-color: transparent;
  }
  .body {
    padding: 0 var(--space-4) var(--space-3);
    display: grid;
    gap: var(--space-2);
  }
  .summary {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
  .meta {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .ports {
    position: relative;
    padding-block: var(--space-2);
    border-top: 1px solid var(--border-hairline);
  }
  /* The column's one target: its full height and the half-gap stops above
     and below, 24px wide on screen at any zoom, centred on the handles. */
  .port-hit {
    display: none;
  }
  @media (pointer: fine) {
    .port-hit {
      --hit-gap-y: 17px;
      display: block;
      position: absolute;
      inset-block: calc(var(--hit-gap-y) / -2);
      inset-inline-end: calc(-12px / var(--hit-scale, 1));
      inline-size: calc(24px / var(--hit-scale, 1));
      cursor: crosshair;
    }
    .ports .port :global(.svelte-flow__handle) {
      pointer-events: none;
    }
    .port.near :global(.svelte-flow__handle) {
      background: var(--brand-solid);
    }
    .port.near {
      color: var(--ink-strong);
    }
  }
  .port {
    position: relative;
    text-align: right;
    padding: var(--space-1) var(--space-4);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  /* A Jev call's answers: the question id, then what came back. */
  .answers {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
  }
  .answers div {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }
  .answers dt {
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .answers dd {
    margin-inline-start: auto;
    text-align: right;
    overflow-wrap: anywhere;
    color: var(--ink-strong);
  }
  .problem {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
  }
  /* A checkpoint is a marker, not a status: the word and the time, on the
     step the program had just finished when it marked. No hue. */
  .checkpoint {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    background: var(--surface-recess);
    border-radius: var(--radius-pill);
    padding: 3px var(--space-3) 3px var(--space-2);
    overflow-wrap: anywhere;
  }
  .checkpoint .mark {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: var(--radius-pill);
    border: 1px solid var(--neutral-8);
  }
  .checkpoint time {
    margin-inline-start: auto;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .group {
    border: 1px dashed var(--neutral-8);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
  }
  .child {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .child a {
    text-decoration: underline;
  }
  /* Running holds its live outline; nothing breathes. */
  .running {
    outline-color: var(--status-live-glyph);
  }
</style>
