<script lang="ts">
  import type { WorkflowStep } from "@cawco/core";
  import type { TransitionConfig } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import {
    dur,
    easeOut,
    morphMs,
    motionOk,
    popScale,
  } from "../motion/curves.svelte";
  import { sessionStatus } from "./session-status";

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
  const status = $derived(sessionStatus(sessionId, step));

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
