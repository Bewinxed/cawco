<script lang="ts">
  import type { WorkflowRunStatus, WorkflowStepStatus } from "@whiffle/core";
  import {
    IconCheck,
    IconChevronUp,
    IconClose,
    IconDot,
    IconStop,
  } from "$lib/icons";

  let {
    status,
  }: { status: WorkflowRunStatus | WorkflowStepStatus | "unknown" } = $props();
  const tones = {
    running: "live",
    waiting: "attn",
    passed: "done",
    done: "done",
    failed: "fail",
    pending: "idle",
    skipped: "idle",
    cancelled: "idle",
    unknown: "idle",
  } as const;
  const tone = $derived(tones[status]);
  const labels = {
    live: "live",
    attn: "needs you",
    done: "done",
    fail: "failed",
    idle: "",
  };
  const label = $derived(labels[tone] || status);
  const icons = {
    live: IconDot,
    attn: IconChevronUp,
    done: IconCheck,
    fail: IconClose,
    idle: IconStop,
  };
  const Glyph = $derived(icons[tone]);
</script>
<!-- Keyed: in a `reflow` list (the rail, the board's queue) a new status
     pops in over the old one leaving (motion/rows); elsewhere it is set. -->
{#key status}
  <span
    class="wf-status"
    data-flip="pop"
    style="--chip-bg: var(--status-{tone}-bg); --chip-ink: var(--status-{tone}-ink)"
    ><Glyph aria-hidden="true" class="size-3" />{label}</span
  >
{/key}
<style>
  .wf-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--chip-bg);
    color: var(--chip-ink);
    font-size: var(--text-label);
    white-space: nowrap;
    font-weight: var(--weight-strong);
  }
</style>
