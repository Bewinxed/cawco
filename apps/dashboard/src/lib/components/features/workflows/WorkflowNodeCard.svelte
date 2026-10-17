<script lang="ts">
  /**
   * One node of a workflow being edited. Watching a run is the run's tab
   * (WorkflowRunView), never this graph.
   */
  import type { WorkflowNode } from "@cawco/core";
  import { workflowPorts } from "@cawco/core";
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { JEV_TYPE_NAMES, kinds } from "./workflow-ui";

  let { data, selected }: NodeProps = $props();
  const node = $derived(data.node as WorkflowNode);

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
  const ports = $derived(workflowPorts(node));
  const title = $derived(node.title);
  const modelled = $derived(node.kind === "step");
  const Glyph = $derived(
    kinds.find((entry) => entry.kind === node.kind)?.icon ?? kinds[0].icon
  );
  const summary = $derived.by(() => {
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

<!-- The selection ring is always drawn, over the card's own border (so the
     border itself turns the colour, never a second ring round it); choosing a
     node fades its colour in over --dur-control, and the one let go fades out
     the same way. Keyboard focus on the node uses the same ring in the focus
     colour. -->
<!-- literal: 260px, 28px, 17px, 12px, 24px -->
<article
  data-slot="node-card"
  data-workflow-node-card-selected={selected || undefined}
  class="w-(--card-w) rounded-md border border-border-hairline bg-surface-raised text-size-body font-normal text-ink-strong shadow-tile outline-(length:--focus-ring-width) outline-solid outline-transparent outline-offset-(--focus-ring-inset) transition-[outline-color] dur-control ease-out data-is-selected:outline-brand-solid"
  data-is-selected={selected || undefined}
  data-map={node.kind === "map" || undefined}
  style:--card-w="260px"
>
  {#if node.kind !== "start"}
    <Handle
      aria-label="Input for {title}"
      class="pointer-hit"
      position={Position.Left}
      type="target"
    />
  {/if}
  <header class="mark-line flex items-center gap-space-2 px-space-4 py-space-3">
    <span
      data-slot="glyph"
      class="grid size-(--glyph) shrink-0 place-items-center rounded-sm border border-neutral-8 data-filled:border-transparent data-filled:bg-brand-solid data-filled:text-on-brand"
      data-box
      data-filled={modelled || undefined}
      style:--glyph="28px"
      ><Glyph aria-hidden="true" class="size-icon-md" /></span
    ><strong class="flex-1 font-medium wrap-anywhere text-ink-strong"
      >{title}</strong
    >
  </header>
  <div data-slot="body" class="grid gap-space-2 px-space-4 pb-space-3">
    {#if node.kind === "step"}
      <p
        data-slot="meta"
        class="text-size-meta font-normal wrap-anywhere text-ink-muted num"
      >
        {node.harness} · {node.model || "Choose a model"}
      </p>
    {/if}
    <p class="line-clamp-2 wrap-anywhere">{summary}</p>
    {#if node.kind === "map"}
      <p
        data-slot="group"
        class="rounded-sm border border-dashed border-neutral-8 p-space-3"
      >
        {node.body.nodes.length} nodes in body
      </p>
    {/if}
    {#if data.problem}
      <div class="grid gap-space-1 text-size-body font-normal">
        <WorkflowStatus status="waiting" /><span>{String(data.problem)}</span>
      </div>
    {/if}
  </div>
  {#if ports.length > 1}
    <div
      data-slot="ports"
      class="relative border-t border-border-hairline py-space-2"
      bind:this={portsEl}
    >
      {#each ports as port (port)}
        <div
          data-slot="port"
          class="group relative px-space-4 py-space-1 text-right text-size-label font-medium fine:data-near:text-ink-strong"
          data-near={near === port || undefined}
        >
          {port}
          <Handle
            aria-label="{title}: {port}"
            id={port}
            position={Position.Right}
            type="source"
          />
        </div>
      {/each}
      <!-- The column's one target: its full height and the half-gap stops
           above and below, 24px wide on screen at any zoom, centred on the
           handles. -->
      <div
        aria-hidden="true"
        data-slot="port-hit"
        class="nodrag nopan hidden fine:absolute fine:inset-y-(--off-block) fine:end-(--off-end) fine:block fine:w-(--hit-w) fine:cursor-crosshair"
        onclick={route}
        onmousedown={route}
        onmouseleave={() => {
          near = null;
        }}
        onmousemove={aim}
        style:--hit-gap-y="17px"
        style:--off-block="calc(var(--hit-gap-y) / -2)"
        style:--off-end="calc(-12px / var(--hit-scale, 1))"
        style:--hit-w="calc(24px / var(--hit-scale, 1))"
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
  {/if}
</article>

<style>
  /* residual: foreign-dom — the node's wrapper and its handles are xyflow's;
     both outweigh a utility on the card or the handle. */
  :global(.svelte-flow__node:focus-visible) [data-slot="node-card"] {
    outline-color: var(--focus-ring);
  }
  @media (pointer: fine) {
    [data-slot="ports"] [data-slot="port"] :global(.svelte-flow__handle) {
      pointer-events: none;
    }
    [data-slot="port"][data-near] :global(.svelte-flow__handle) {
      background: var(--brand-solid);
    }
  }
</style>
