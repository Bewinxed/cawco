<script lang="ts">
  import { TextMorph } from "torph/svelte";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import Sleeping from "~icons/solar/moon-sleep-bold-duotone";
  import Pause from "~icons/solar/pause-circle-bold-duotone";
  import Unknown from "~icons/solar/question-circle-bold-duotone";
  import Working from "~icons/solar/refresh-circle-bold-duotone";
  import { isFailed, isStale, whiffle } from "../client.svelte";

  let {
    sessionId,
    compact = false,
    duration = 150,
  }: {
    sessionId: string;
    compact?: boolean;
    /** How long the label takes to morph into the next one. */
    duration?: number;
  } = $props();
  const row = $derived(whiffle.instanceIndex.byId.get(sessionId));
  const activity = $derived(whiffle.activityOf(sessionId));
  const status = $derived.by(() => {
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
</script>

<span
  aria-label={status.label}
  class="session-status {status.tone}"
  role="img"
  class:compact
>
  <status.icon aria-hidden="true" />
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
  .compact :global(svg) {
    width: 16px;
    height: 16px;
  }
  .working {
    color: var(--status-live-ink);
  }
  .attention {
    color: var(--status-attn-ink);
  }
  .failed {
    color: var(--status-fail-ink);
  }
  @media (prefers-reduced-motion: no-preference) {
    .working :global(svg) {
      animation: session-working var(--breath) ease-in-out infinite;
    }
  }
  @keyframes session-working {
    50% {
      opacity: 0.45;
    }
  }
</style>
