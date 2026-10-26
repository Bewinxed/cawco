<script lang="ts">
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { glyphIn, glyphOut, sessionStatusOf } from "./session-status";

  let {
    sessionId = "",
    compact = false,
  }: {
    sessionId?: string;
    compact?: boolean;
  } = $props();
  const status = $derived(sessionStatusOf(sessionId));
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
      status.tone === "working" &&
        "loops text-status-live-glyph motion-safe:animate-breath",
      status.tone === "attention" && "text-status-attn-glyph",
      status.tone === "failed" && "text-status-fail-glyph",
      status.tone === "quiet" && "text-status-idle-glyph",
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
          <Spinner aria-hidden="true" role="presentation" class="flex-none" />
        {/if}
      </span>
    {/key}
  </span>
  {#if !compact}
    <MorphText text={status.label} />
  {/if}
</span>
