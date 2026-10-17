<script lang="ts">
  import type { WorkflowRunStatus, WorkflowStepStatus } from "@cawco/core";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconCheck,
    IconChevronUp,
    IconDot,
    IconError,
    IconStop,
  } from "#lib/icons.js";

  let {
    status,
  }: { status: WorkflowRunStatus | WorkflowStepStatus | "unknown" } = $props();
  const tones = {
    running: "live",
    waiting: "attn",
    held: "attn",
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
  // A held step waits on its run's supervisor, not the operator: it says so
  // in its own word under the same attention tone.
  const label = $derived(status === "held" ? "held" : labels[tone] || status);
  const icons = {
    live: IconDot,
    attn: IconChevronUp,
    done: IconCheck,
    fail: IconError,
    idle: IconStop,
  };
  const Glyph = $derived(icons[tone]);
</script>

<!-- One chip for the life of the status: a change tints it over --dur-panel,
     the glyph cross-fades in its cell and the label morphs in place. In a
     `reflow` list (the rail, the board's queue) the chip still pops in and
     out as a whole (motion/rows). -->
<!-- literal: 3px -->
<span
  class="mark-line type-label inline-flex items-center gap-space-1 rounded-pill bg-(color:--chip-bg) px-space-2 py-(--pad-y) whitespace-nowrap text-(color:--chip-ink) transition-[background-color,color] dur-panel ease-out"
  data-flip="pop"
  style:--chip-bg="var(--status-{tone}-bg)"
  style:--chip-ink="var(--status-{tone}-ink)"
  style:--pad-y="3px"
  ><span data-slot="glyph" aria-hidden="true" class="grid" data-box
    >{#key tone}
      <span class="col-start-1 row-start-1 grid" transition:crossIn
        ><Glyph class="size-icon-sm" /></span
      >
    {/key}</span
  ><MorphText text={label} /></span
>
