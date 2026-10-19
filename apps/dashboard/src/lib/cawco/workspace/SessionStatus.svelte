<script lang="ts">
  import type { WorkflowStep } from "@cawco/core";
  import type { TransitionConfig } from "svelte/transition";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { dur, easeOut, motionOk, popScale } from "../motion/curves.svelte";
  import { stepSessionStatus } from "./session-status";

  let {
    sessionId = "",
    step,
    compact = false,
  }: {
    sessionId?: string;
    /** A workflow step's status, read in the session glyphs instead of a session's. */
    step?: WorkflowStep["status"];
    compact?: boolean;
  } = $props();
  const status = $derived(stepSessionStatus(sessionId, step));

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
  class="mark-line inline-flex items-center gap-space-1 text-ink-muted text-size-label font-medium whitespace-nowrap"
  data-slot="session-status"
  data-session-status-tone={status.tone}
  role="img"
>
  <!-- The two glyphs of a change share one cell while they cross-fade. The
       glyph wears its status hue; the word beside it stays text ink. -->
  <span
    data-slot="glyph"
    class={[
      "inline-grid flex-none",
      status.tone === "working" && "text-status-live-glyph",
      status.tone === "attention" && "text-status-attn-glyph",
      status.tone === "failed" && "text-status-fail-glyph",
      status.tone === "quiet" && "text-status-idle-glyph",
      status.tone === "done" && "text-status-done-glyph",
    ]}
    data-box
  >
    {#key status.icon}
      <span
        data-slot="mark"
        class="row-start-1 col-start-1 inline-flex"
        in:glyphIn
        out:glyphOut
      >
        {#if status.icon}
          <status.icon aria-hidden="true" class="size-icon-md flex-none" />
        {:else}
          <Spinner
            aria-hidden="true"
            role="presentation"
            class="size-icon-md flex-none"
          />
        {/if}
      </span>
    {/key}
  </span>
  {#if !compact}
    <MorphText text={status.label} />
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
     A change cross-fades once (glyphIn); then the Working glyph breathes
     (DESIGN.md Live work breathes) and every other holds, but for the
     stopping spinner (StopTray's, until the machine confirms). */
  .working .glyph {
    color: var(--status-live-glyph);

    @media (prefers-reduced-motion: no-preference) {
      animation: breath var(--breath) var(--ease-in-out) infinite;
    }
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
