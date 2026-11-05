<script lang="ts">
  /**
   * Caw's on/off, the project's own (fable-lead-switch.md §1), opened from
   * his panel's bar (ProjectConversation's settings), the one place it
   * stands (the owner's rule 8): what he is doing in one sentence, and the
   * switch for whether he acts on his own (the project's events reach his
   * conversation) (CawLeadSwitch), and whether he moves while he works
   * (feel.svelte.ts `cawLoop`, kept in this browser). Talking to him is his
   * panel over the page (CawFloat).
   */
  import { cawSwitchWords } from "@cawco/core/words/project-conversation";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { cawLoop, setCawLoop } from "#lib/cawco/feel.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import CawLeadSwitch from "./CawLeadSwitch.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    sheet = false,
    place,
  }: {
    /** Where the switch's off tray stands (CawLeadSwitch `place`). */
    place?: string;
    lead: CawLead;
    projectId: string;
    projectName: string;
    /**
     * In the touch sheet: the sheet's header names it and the sheet's own
     * inset holds it, so the panel draws neither.
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
  class="type-label flex w-(--panel-w) flex-col gap-space-2 pt-space-3 pr-space-4 pb-space-4 pl-space-4 text-ink-strong data-sheet:w-full data-sheet:p-0"
  data-sheet={sheet || undefined}
  style:--panel-w="min(var(--c-panel-w), calc(100vw - 2 * var(--space-5)))"
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
  <CawLeadSwitch {lead} {place} {projectId} {projectName} />
  <!-- How he looks while he works: his own, so it stands in his settings,
       his one surface (the owner's rule 8), not in the rail. -->
  <label
    data-slot="loop-switch"
    class="flex flex-wrap items-center gap-space-2"
  >
    <Switch
      data-caw-loop-switch
      bind:checked={() => cawLoop.on, (next) => setCawLoop(next)}
    />
    <span>{cawSwitchWords.moves}</span>
  </label>
  {#if cawco.hub === "unreachable"}
    <p class="type-meta text-ink-muted">
      The hub is not answering; what shows was read before.
    </p>
  {/if}
</div>
