<script lang="ts">
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import StatusGlyph from "../StatusGlyph.svelte";
  import { sessionStatusOf } from "./session-status";

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
  class="inline-flex items-center gap-space-1 mark-line text-base font-medium whitespace-nowrap text-tx-2"
  data-slot="session-status"
  data-session-status-tone={status.tone}
  role="img"
>
  <!-- The glyphs of a change share one cell, on the house's glyph swap.
       The glyph wears its status hue; the word beside it stays text ink. -->
  <StatusGlyph
    breathes={status.tone === "working"}
    icon={status.icon}
    tone={status.tone}
  />
  {#if !compact}
    <MorphText text={status.label} />
  {/if}
</span>
