<script lang="ts">
  import type { WorkflowRunStatus, WorkflowStepStatus } from "@cawco/core";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";

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
</script>

<!-- The board's state pill (DESIGN.md, Board state pill): the word inside
     its status tint, with no glyph; idle drops the tint and the padding. A
     change turns the tint over --dur-panel and morphs the word in place. In
     a `reflow` list the pill still pops in and out as a whole (motion/rows). -->
<span
  data-slot="workflow-status"
  class={[
    "mark-text type-label inline-flex h-c-pill-h flex-none items-center rounded-pill whitespace-nowrap text-status-idle-ink transition-[background-color,color] duration-(--dur-panel) ease-out tone-live:bg-status-live-bg tone-live:text-status-live-ink tone-attn:bg-status-attn-bg tone-attn:text-status-attn-ink tone-done:bg-status-done-bg tone-done:text-status-done-ink tone-fail:bg-status-fail-bg tone-fail:text-status-fail-ink",
    tone !== "idle" && "px-space-3",
  ]}
  data-flip="pop"
  data-tone={tone}><MorphText text={label} /></span
>
