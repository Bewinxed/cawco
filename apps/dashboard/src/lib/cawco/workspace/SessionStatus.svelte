<script lang="ts">
  import type { WorkflowStep } from "@cawco/core";
  import type { TransitionConfig } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import Passed from "~icons/solar/check-circle-bold-duotone";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import Sleeping from "~icons/solar/moon-sleep-bold-duotone";
  import Pause from "~icons/solar/pause-circle-bold-duotone";
  import Unknown from "~icons/solar/question-circle-bold-duotone";
  import Working from "~icons/solar/refresh-circle-bold-duotone";
  import { cawco, isFailed, isStale } from "../client.svelte";
  import {
    dur,
    easeOut,
    morphMs,
    motionOk,
    popScale,
  } from "../motion/curves.svelte";
  import { runIdOf } from "../workflow-runs";
  import { workflowState } from "../workflow-state.svelte";

  let {
    sessionId = "",
    step,
    compact = false,
    duration = morphMs(),
  }: {
    sessionId?: string;
    /** A workflow step's status, read in the session glyphs instead of a session's. */
    step?: WorkflowStep["status"];
    compact?: boolean;
    /** How long the label takes to morph into the next one. */
    duration?: number;
  } = $props();
  const row = $derived(cawco.instanceIndex.byId.get(sessionId));
  const activity = $derived(cawco.activityOf(sessionId));
  /** A step's status on the session's scale: going, needing someone, done, or not. */
  const STEP = {
    running: { label: "Working", icon: Working, tone: "working" },
    waiting: { label: "Needs you", icon: Attention, tone: "attention" },
    held: { label: "Held", icon: Attention, tone: "attention" },
    failed: { label: "Failed", icon: Failed, tone: "failed" },
    passed: { label: "Passed", icon: Passed, tone: "done" },
    pending: { label: "Pending", icon: Pause, tone: "quiet" },
    skipped: { label: "Skipped", icon: Pause, tone: "quiet" },
    cancelled: { label: "Cancelled", icon: Pause, tone: "quiet" },
    unknown: { label: "Unknown", icon: Unknown, tone: "quiet" },
  } as const;
  /** The workflow run the id names, when it names one: its end says how. */
  const run = $derived.by(() => {
    const runId = runIdOf(sessionId);
    return runId ? workflowState.runs[runId] : undefined;
  });
  const status = $derived.by(() => {
    if (step) {
      return STEP[step];
    }
    // A run that ended stopped, on a session's scale; it says which way.
    if (run?.status === "done") {
      return { label: "Done", icon: Passed, tone: "done" };
    }
    if (run?.status === "cancelled") {
      return { label: "Cancelled", icon: Pause, tone: "quiet" };
    }
    if (row && isFailed(row)) {
      return { label: "Failed", icon: Failed, tone: "failed" };
    }
    if (row && isStale(row)) {
      return { label: "Unreachable", icon: Unknown, tone: "quiet" };
    }
    if (row?.status === "sleeping") {
      return { label: "Sleeping", icon: Sleeping, tone: "quiet" };
    }
    if (row?.status === "stopped") {
      return { label: "Stopped", icon: Pause, tone: "quiet" };
    }
    if (activity === "blocked") {
      return { label: "Needs you", icon: Attention, tone: "attention" };
    }
    if (activity === "working") {
      return { label: "Working", icon: Working, tone: "working" };
    }
    if (!row) {
      return { label: "Stored", icon: Pause, tone: "quiet" };
    }
    return { label: "Idle", icon: Pause, tone: "quiet" };
  });

  /**
   * A new glyph cross-fades over the old one at the control tier, coming up
   * from the pop scale; the old one only fades. With less motion, only the
   * fade.
   */
  function glyphIn(_node: Element): TransitionConfig {
    const scale = motionOk.current ? popScale() : 1;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
    };
  }
  function glyphOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
</script>

<span
  aria-label={status.label}
  class="session-status {status.tone}"
  role="img"
  class:compact
>
  <span class="glyph">
    {#key status.icon}
      <span class="mark" in:glyphIn out:glyphOut>
        <status.icon aria-hidden="true" />
      </span>
    {/key}
  </span>
  {#if !compact}
    <TextMorph as="span" {duration} text={status.label} />
  {/if}
</span>

<style>
  .session-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--ink-muted);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    white-space: nowrap;
  }
  .session-status :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  /* The two glyphs of a change share one cell while they cross-fade. */
  .glyph {
    display: inline-grid;
    flex: none;
  }
  .mark {
    grid-area: 1 / 1;
    display: inline-flex;
  }
  .compact :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* The glyph wears its status hue; the word beside it stays text ink.
     Nothing loops: a change cross-fades once (glyphIn) and then holds. */
  .working .glyph {
    color: var(--status-live-glyph);
  }
  .attention .glyph {
    color: var(--status-attn-glyph);
  }
  .failed .glyph {
    color: var(--status-fail-glyph);
  }
  .quiet .glyph {
    color: var(--status-idle-glyph);
  }
  .done .glyph {
    color: var(--status-done-glyph);
  }
</style>
