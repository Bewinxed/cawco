<script lang="ts">
  /**
   * Caw's settings, as the project head's `⋯ › Caw settings…` opens them
   * (a popover on a desk, a sheet under a finger): one panel, read top to
   * bottom.
   *
   * - A hero picture of Caw awake or asleep across the panel's top
   *   (CawHero), his one switch on its faded lower edge with the line of
   *   what that state means; it crossfades as he turns.
   * - Whether Caw may change these settings (what his chat and each kind
   *   of trigger run as): one switch, under the hero.
   * - Your chat with Caw: what it runs as (RunsAs: account, harness and
   *   model, mode), the project's Caw.
   * - Triggers: each kind (TriggerRow) and what its short sessions start
   *   as, each picker inline, inherited or the project's own.
   *
   * Props in, events out: what the hub holds arrives as props, and each
   * change leaves as an event the page sends (his switch goes through his
   * lead, as the head's does). With the hub away every section still says
   * what it last read, its controls sunk and its line saying so.
   */
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import {
    TRIGGER_KINDS,
    type TriggerKind,
    type TriggerSetting,
  } from "@cawco/core/triggers";
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import type { SwitchedLead } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { sheetScroller } from "#lib/components/ui/drawer/sheet-head.js";
  import { IconCloudCross } from "#lib/icons.js";
  import SwitchField from "../config/SwitchField.svelte";
  import CawHero from "./CawHero.svelte";
  import type { CawRunsAs, TriggerSettingsView } from "./caw-settings";
  import RunsAs from "./RunsAs.svelte";
  import TriggerRow from "./TriggerRow.svelte";

  let {
    lead,
    projectId,
    projectName,
    chat,
    triggers,
    machine,
    installed,
    hubAway = false,
    refusedKind = null,
    refusedChat = null,
    unread = null,
    refusedChanges = null,
    changesSettings,
    onchat,
    onchanges,
    onkind,
    sheet = false,
  }: {
    /** His on and off, as the page's Caw holds it. */
    lead: SwitchedLead;
    projectId: string;
    projectName: string;
    /** What his chat runs as. */
    chat: CawRunsAs;
    /** Each kind's settings, once read. */
    triggers: TriggerSettingsView | null;
    /** The machine his runs start on. */
    machine: { id: string; name: string };
    /** The harnesses installed there. */
    installed: HarnessKind[];
    /** The hub is out of reach: what shows is what it said last. */
    hubAway?: boolean;
    /** The kind whose last change the hub refused, and its words. */
    refusedKind?: { kind: TriggerKind; words: string } | null;
    /** His chat's last change, refused: the hub's words. */
    refusedChat?: string | null;
    /** Why the kinds could not be read, in the hub's words: said where they stand. */
    unread?: string | null;
    /** His changing switch's last change, refused: the hub's words. */
    refusedChanges?: string | null;
    /** A change to what his chat runs as. */
    onchat: (patch: Partial<TriggerSetting>) => void;
    /**
     * Whether Caw may change these settings, what his chat and each kind of
     * trigger run as (the project's `changesSettings`).
     */
    changesSettings: boolean;
    /** His changing switch flipped. */
    onchanges: (next: boolean) => void;
    /** A change to a kind's own settings. */
    onkind: (kind: TriggerKind, patch: Partial<TriggerSetting>) => void;
    /**
     * In the touch sheet: the sheet's own inset holds it, its width the
     * sheet's, and it scrolls beneath the sheet's floating head
     * (`sheetScroller`), as his panel did.
     */
    sheet?: boolean;
  } = $props();
</script>

<div
  data-slot="caw-settings"
  class={[
    "flex flex-col gap-space-4 text-tx",
    sheet
      ? [
          // The scroller reaches the sheet's edges, so the hero can too;
          // its own inset puts the rest back on the sheet's.
          "-mx-4 min-h-0 overflow-y-auto px-4 pb-space-4",
          sheetScroller,
        ]
      : "w-115 max-w-full",
  ]}
>
  <CawHero disabled={hubAway} {lead} {projectId} {projectName} {sheet} />
  <!-- The settings, from the hero's edge; on the sheet its own inset holds them. -->
  <div class={["flex flex-col", !sheet && "px-space-4 pb-space-4"]}>
    {#if hubAway}
      <p
        data-slot="hub-away"
        class="m-0 flex items-center gap-space-2 mark-line pb-space-4 text-tx-2 type-meta"
        role="status"
      >
        <IconCloudCross
          aria-hidden="true"
          class="size-icon-md flex-none"
          data-box
        />
        <span>{words.hubAway}</span>
      </p>
    {/if}
    <div data-slot="changes" class="grid gap-space-2 pb-space-4">
      <SwitchField
        checked={changesSettings}
        disabled={hubAway}
        id={`caw-changes-${projectId}`}
        label={words.changes}
        onchange={onchanges}
      />
      {#if refusedChanges}
        <p data-slot="refused" class="m-0 text-red type-meta" role="alert">
          {refusedChanges}
        </p>
      {/if}
    </div>
    <section
      data-slot="chat"
      class="grid gap-space-2 border-t border-ui py-space-4"
    >
      <h3 class="m-0 type-title text-tx">{words.chat}</h3>
      <RunsAs
        account={chat.account}
        from={chat.mode === null ? { mode: words.from.fleet } : {}}
        harness={chat.harness}
        id="caw-chat"
        {installed}
        machineId={machine.id}
        machineName={machine.name}
        mode={chat.mode}
        model={chat.model}
        onchange={onchat}
        readonly={hubAway}
      />
      {#if refusedChat}
        <p data-slot="refused" class="m-0 text-red type-meta" role="alert">
          {refusedChat}
        </p>
      {/if}
    </section>
    <section
      data-slot="triggers"
      class="grid gap-space-3 border-t border-ui pt-space-4"
    >
      <h3 class="m-0 type-title text-tx">{words.triggers}</h3>
      {#if triggers}
        <ul
          class="m-0 grid list-none grid-cols-pickers gap-x-space-2 gap-y-space-3 p-0"
        >
          {#each TRIGGER_KINDS as kind (kind)}
            <TriggerRow
              {installed}
              {kind}
              machineId={machine.id}
              machineName={machine.name}
              onchange={(patch) => onkind(kind, patch)}
              readonly={hubAway}
              refused={refusedKind?.kind === kind ? refusedKind.words : null}
              view={triggers.kinds[kind]}
            />
          {/each}
        </ul>
      {:else}
        <p class="m-0 text-tx-2 type-meta" role={unread ? "alert" : undefined}>
          {unread ? words.unread(unread) : words.reading}
        </p>
      {/if}
    </section>
  </div>
</div>
