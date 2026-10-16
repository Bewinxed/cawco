<script lang="ts">
  /**
   * Caw's on/off, the project's own (fable-lead-switch.md §1), opened from
   * the project head's `⋯`: who he is and what he is doing in one
   * sentence, and the lead switch (CawLeadSwitch, the one the head's details
   * tray draws too). Talking to him is his panel over the page (CawFloat);
   * his harness and model are his lead session's card, from his name there
   * (SessionDetails).
   */
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import CawLeadSwitch from "./CawLeadSwitch.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
  }: { lead: CawLead; projectId: string; projectName: string } = $props();

  // A turn begins: his view is read again, so the panel says what it answers
  // (a turn no thread woke works here, not on a thread).
  let wasWorking = false;
  $effect(() => {
    const working = lead.status === "working";
    if (working && !wasWorking) {
      untrack(() => lead.read());
    }
    wasWorking = working;
  });
</script>

<div class="caw-panel">
  <p class="head">Caw · lead of {projectName}</p>
  <div class="row status mark-line">
    <CawFace size={18} status={lead.status} />
    <span class="sentence">{lead.sentence}</span>
  </div>
  {#if lead.capLine}
    <p class="capped">{lead.capLine}</p>
  {/if}
  <CawLeadSwitch {lead} {projectId} {projectName} />
  {#if cawco.hub === "unreachable"}
    <p class="muted">The hub is not answering; what shows was read before.</p>
  {/if}
</div>

<style>
  .caw-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: min(22rem, calc(100vw - 2 * var(--space-5)));
    padding: var(--space-3) var(--space-4) var(--space-4);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .head {
    font: var(--type-label);
    font-weight: var(--weight-strong);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .sentence {
    min-inline-size: 0;
  }
  .muted {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Past the cap: said in the needs-you ink, a fact about him, not an error. */
  .capped {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
</style>
