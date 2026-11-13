<script lang="ts">
  /**
   * Caw's on/off, the project's own (fable-lead-switch.md §1), opened from
   * the project head's `⋯`: what he is doing in one sentence, and the
   * switch for whether the project's events reach a conversation
   * (CawLeadSwitch, the one the head's details tray draws too). Talking to
   * him is his panel over the page (CawFloat).
   */
  import { untrack } from "svelte";

  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { connectionStore } from "#lib/cawco/hub/socket.svelte.js";
  import { sheetScroller } from "#lib/components/ui/drawer/sheet-head.js";
  import CawLeadSwitch from "./CawLeadSwitch.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    sheet = false,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /**
     * In the touch sheet: the sheet's header names it and the sheet's own
     * inset holds it, so the panel draws neither; it scrolls beneath the
     * sheet's floating header (`sheetScroller`).
     */
    sheet?: boolean;
  } = $props();

  // A turn begins: his view is read again, so the panel says what runs.
  let wasWorking = false;
  $effect(() => {
    const working = lead.status === "working";
    if (working && !wasWorking) {
      untrack(() => lead.read());
    }
    wasWorking = working;
  });
</script>

<div
  data-slot="caw-panel"
  class={[
    "type-label flex flex-col gap-space-2 text-ink-strong",
    sheet
      ? ["w-full min-h-0 overflow-y-auto", sheetScroller]
      : "w-(--panel-w) pt-space-3 pr-space-4 pb-space-4 pl-space-4",
  ]}
  data-sheet={sheet || undefined}
  style:--panel-w={"min(var(--spacing-c-panel-w), calc(100vw - 2 * var(--spacing-space-5)))"}
>
  <div
    data-slot="row"
    class="mark-line flex flex-wrap items-center gap-space-2"
  >
    <CawFace size={18} status={lead.status} />
    <span data-slot="sentence" class="min-w-0">{lead.sentence}</span>
  </div>
  {#if lead.capLine}
    <p class="type-meta text-status-attn-ink">{lead.capLine}</p>
  {/if}
  <CawLeadSwitch {lead} {projectId} {projectName} />
  {#if connectionStore.hub === "unreachable"}
    <p class="type-meta text-ink-muted">
      The hub is not answering; what shows was read before.
    </p>
  {/if}
</div>
