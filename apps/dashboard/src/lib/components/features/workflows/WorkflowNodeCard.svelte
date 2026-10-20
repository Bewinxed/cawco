<script lang="ts">
  /**
   * One node of a workflow being edited. Watching a run is the run's tab
   * (WorkflowRunView), never this graph.
   */
  import type { WorkflowNode } from "@cawco/core";
  import { workflowPorts } from "@cawco/core";
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { JEV_TYPE_NAMES, kinds, RUN_HIT_GAP } from "./workflow-ui";

  let { data, selected }: NodeProps = $props();
  const node = $derived(data.node as WorkflowNode);
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

<!-- Each dot's area (`pointer-hit`, `touch-hit`, held on screen by the
     canvas's --hit-scale) stops at the midpoint to its edge's Delete
     button, which stands in the middle of the run between two cards
     (WorkflowEdge). `absolute` keeps Svelte Flow's own place for the dot:
     the areas' `position: relative` would otherwise put it in the row's
     flow. The selection ring is always drawn, over the card's own border (so the
     border itself turns the colour, never a second ring round it); choosing a
     node fades its colour in over --dur-control, and the one let go fades out
     the same way. Keyboard focus on the node uses the same ring in the focus
     colour. -->
<article
  data-slot="node-card"
  data-workflow-node-card-selected={selected || undefined}
  class="w-c-wf-node-w rounded-md border border-border-hairline bg-surface-raised text-size-body font-normal text-ink-strong shadow-tile outline-(length:--focus-ring-width) outline-solid outline-transparent outline-offset-(--focus-ring-inset) transition-[outline-color] duration-(--dur-control) ease-out data-is-selected:outline-brand-solid node-focus-visible:outline-focus-ring"
  data-is-selected={selected || undefined}
  data-map={node.kind === "map" || undefined}
  style:--hit-gap-x={RUN_HIT_GAP}
>
  {#if node.kind !== "start"}
    <Handle
      aria-label="Input for {title}"
      class="pointer-hit touch-hit absolute z-1"
      position={Position.Left}
      type="target"
    />
  {/if}
  <header class="mark-line flex items-center gap-space-2 px-space-4 py-space-3">
    <span
      data-slot="glyph"
      class="grid size-c-row-lead shrink-0 place-items-center rounded-sm border border-neutral-8 data-filled:border-transparent data-filled:bg-brand-solid data-filled:text-on-brand"
      data-box
      data-filled={modelled || undefined}
      ><Glyph aria-hidden="true" class="size-icon-md" /></span
    ><strong class="flex-1 type-label wrap-anywhere text-ink-strong"
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
    <!-- Each port's dot is its own target: its area reaches the floor on
         screen at any zoom (--hit-scale) and stops at the midpoint to the
         next port's, one row's pitch apart. -->
    <div
      data-slot="ports"
      class="border-t border-t-border-hairline py-space-2"
      style:--hit-gap-y="calc(var(--c-btn-h-sm) - var(--c-graph-handle))"
    >
      {#each ports as port (port)}
        <div
          data-slot="port"
          class="relative flex h-c-btn-h-sm items-center justify-end px-space-4 text-size-label font-medium hover:text-ink-strong hover:xy-handle-brand"
        >
          {port}
          <Handle
            aria-label="{title}: {port}"
            class="pointer-hit touch-hit absolute z-1"
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
      class="pointer-hit touch-hit absolute z-1"
      id={ports[0]}
      position={Position.Right}
      type="source"
    />
  {/if}
</article>
