<script lang="ts">
  import type { WorkflowRunStatus, WorkflowStepStatus } from "@whiffle/core";
  import { TextMorph } from "torph/svelte";
  import {
    IconCheck,
    IconChevronUp,
    IconClose,
    IconDot,
    IconStop,
  } from "$lib/icons";
  import { crossIn } from "$lib/whiffle/motion/curves.svelte";

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
<!-- One chip for the life of the status: a change tints it over --dur-panel,
     the glyph cross-fades in its cell and the label morphs in place. In a
     `reflow` list (the rail, the board's queue) the chip still pops in and
     out as a whole (motion/rows). -->
<span
  class="wf-status"
  data-flip="pop"
  style="--chip-bg: var(--status-{tone}-bg); --chip-ink: var(--status-{tone}-ink)"
  ><span aria-hidden="true" class="glyph"
    >{#key tone}
      <span transition:crossIn><Glyph class="size-3" /></span>
    {/key}</span
  ><TextMorph as="span" duration={150} text={label} /></span
>
<style>
  .wf-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--chip-bg);
    color: var(--chip-ink);
    font: var(--type-label);
    white-space: nowrap;
    transition:
      background-color var(--dur-panel) var(--ease-out),
      color var(--dur-panel) var(--ease-out);
  }
  .glyph {
    display: grid;
  }
  .glyph > :global(*) {
    grid-area: 1 / 1;
    display: grid;
  }
</style>
