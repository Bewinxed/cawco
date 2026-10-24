<script lang="ts">
  /**
   * A step on a workflow's shape (the Canvas view's Svelte Flow node): its
   * kind's glyph and title, its delegate type or connection under it, and
   * in a run its state as the routines page says one (RunStatus). The start
   * node is the run's own: what the run is started with. Its handles are
   * where edges meet it, unseen, as on the task canvas (TaskNode).
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import RunStatus, {
    type Status,
  } from "#lib/cawco/routines/RunStatus.svelte";
  import {
    IconAgent,
    IconAsk,
    IconConnection,
    IconHourglass,
    IconPlay,
  } from "#lib/icons.js";
  import { KIND_WORD, type Lit, type Step } from "./release";

  let { data }: NodeProps = $props();
  const node = $derived(
    data as {
      step: Step | null;
      lit: Lit | null;
      selected: boolean;
      flow: "LR" | "TB";
      compact: boolean;
    }
  );
  const GLYPH = {
    agent: IconAgent,
    call: IconConnection,
    wait: IconHourglass,
    ask: IconAsk,
  } as const;
  const STATUS: Record<Lit["status"], Status> = {
    done: "done",
    live: "running",
    attn: "waiting",
    fail: "failed",
    idle: "neutral",
    planned: "neutral",
  };
  const ends = $derived(
    node.flow === "TB"
      ? { in: Position.Top, out: Position.Bottom }
      : { in: Position.Left, out: Position.Right }
  );
  const Glyph = $derived(node.step ? GLYPH[node.step.kind] : IconPlay);
</script>

<div
  data-slot="wf-shape-node"
  class="flex w-c-decision-node-w flex-col gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-3 py-space-2 shadow-tile data-attn:border-status-attn-ink data-planned:border-dashed data-planned:bg-surface-recess data-selected:outline-2 data-selected:outline-offset-1 data-selected:outline-brand-solid data-start:w-auto"
  data-attn={node.lit?.status === "attn" || undefined}
  data-planned={node.lit?.status === "planned" || undefined}
  data-selected={node.selected || undefined}
  data-start={node.step ? undefined : ""}
>
  <Handle
    id="flow-in"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.in}
    type="target"
  />
  <span class="mark-line flex min-w-0 items-center gap-space-1">
    <Glyph aria-hidden="true" class="size-icon-sm flex-none text-ink-muted" />
    <span
      class="min-w-0 flex-initial overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
      >{node.step ? KIND_WORD[node.step.kind] : "Start"}</span
    >
  </span>
  {#if node.step}
    <span class="type-label text-pretty text-ink-row"
      >{node.compact ? node.step.short : node.step.title}</span
    >
    {#if node.lit}
      <RunStatus
        status={STATUS[node.lit.status]}
        text={node.lit.took ? `${node.lit.phase} · ${node.lit.took}` : node.lit.phase}
      />
    {:else if node.step.who && !node.compact}
      <span class="type-meta text-ink-muted">{node.step.who}</span>
    {/if}
  {:else}
    <span class="type-meta text-ink-muted">version</span>
  {/if}
  <Handle
    id="flow-out"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.out}
    type="source"
  />
</div>
