<script lang="ts">
  import type { WorkflowNode, WorkflowRun, WorkflowStep } from "@whiffle/core";
  import { workflowPorts } from "@whiffle/core";
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import {
    IconCpuDuo,
    IconToolQuestion,
    IconToolTodo,
    IconWorkflow,
  } from "$lib/icons";
  import type { JournalCheckpoint, JournalNode } from "./journal-graph";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { kinds } from "./workflow-ui";

  let { data, selected }: NodeProps = $props();
  /** Present for an authored node, and for the journal's `run`/`spawn` steps. */
  const node = $derived(data.node as WorkflowNode | undefined);
  /** Present only on a code-origin run, where the journal is the graph. */
  const journal = $derived(data.journal as JournalNode | undefined);
  const checkpoints = $derived((data.checkpoints ?? []) as JournalCheckpoint[]);
  /** A call the journal records but no authored node stands behind. */
  const effectGlyphs = {
    run: IconCpuDuo,
    spawn: IconCpuDuo,
    ask: IconToolQuestion,
    exec: IconToolTodo,
    exists: IconToolTodo,
    workflow: IconWorkflow,
  } as const;
  const step = $derived(data.step as WorkflowStep | undefined);
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
    {#if node?.kind === 'step' && node.context.mode === 'continue'}
      <p class="meta">continues {node.context.from}</p>
    {/if}
    {#if node?.kind === 'map'}
      <p class="group">{node.body.nodes.length} nodes in body</p>
    {/if}
    {#if step && node?.kind === 'step'}
      <p class="meta">{String(data.duration)} · {String(data.cost)}</p>
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
    <div class="ports">
      {#each ports as port (port)}
        <div class="port">
          {port}
          <Handle
            aria-label="{title}: {port}"
            id={port}
            position={Position.Right}
            type="source"
          />
        </div>
      {/each}
    </div>
  {:else if ports[0]}
    <Handle
      aria-label="{title}: {ports[0]}"
      id={ports[0]}
      position={Position.Right}
      type="source"
    />
  {:else if journal}
    <Handle aria-label="{title}: out" position={Position.Right} type="source" />
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
    font-size: var(--text-label);
  }
  .selected {
    outline: 2px solid var(--brand-solid);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
  }
  strong {
    font-weight: 500;
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
    font-size: var(--text-label);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .ports {
    padding-block: var(--space-2);
    border-top: 1px solid var(--border-hairline);
  }
  .port {
    position: relative;
    text-align: right;
    padding: var(--space-1) var(--space-4);
    font-size: var(--text-label);
  }
  .problem {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-label);
  }
  /* A checkpoint is a marker, not a status: the word and the time, on the
     step the program had just finished when it marked. No hue. */
  .checkpoint {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
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
  .running {
    animation: workflow-breath var(--breath) ease-in-out infinite;
  }
  @keyframes workflow-breath {
    50% {
      outline: 2px solid var(--status-live-ink);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .running {
      animation: none;
      outline: 2px solid var(--status-live-ink);
    }
  }
</style>
