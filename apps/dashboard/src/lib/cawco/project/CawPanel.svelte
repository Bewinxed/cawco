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

<!-- literal: 22rem -->
<div
  data-slot="caw-panel"
  class="type-label flex w-(--panel-w) flex-col gap-space-2 pt-space-3 pr-space-4 pb-space-4 pl-space-4 text-ink-strong"
  style:--panel-w="min(22rem, calc(100vw - 2 * var(--space-5)))"
>
  <p data-slot="head" class="type-label font-medium">Caw · lead of {projectName}</p>
  <div data-slot="row" class="mark-line flex flex-wrap items-center gap-space-2">
    <CawFace size={18} status={lead.status} />
    <span data-slot="sentence" class="min-w-0">{lead.sentence}</span>
  </div>
  {#if lead.capLine}
    <p class="type-meta text-status-attn-ink">{lead.capLine}</p>
  {/if}
  <CawLeadSwitch {lead} {projectId} {projectName} />
  {#if cawco.hub === "unreachable"}
    <p class="type-meta text-ink-muted">The hub is not answering; what shows was read before.</p>
  {/if}
</div>
