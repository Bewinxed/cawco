<script lang="ts">
  /**
   * Caw's settings, as the project head's `⋯ › Caw settings…` opens them
   * (a popover on a desk, a sheet under a finger): one panel, read top to
   * bottom.
   *
   * - A hero picture of Caw awake or asleep across the panel's top
   *   (CawHero), his one switch on its faded lower edge with the line of
   *   what that state means; it crossfades as he turns.
   * - What Caw can change: whether he may propose changes to Who decides.
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
  import { TRIGGER_KINDS, type TriggerKind } from "@cawco/core/triggers";
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import type { SwitchedLead } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { sheetScroller } from "#lib/components/ui/drawer/sheet-head.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconBolt, IconChat, IconCloudCross, IconPen } from "#lib/icons.js";
  import SwitchField from "../config/SwitchField.svelte";
  import CawHero from "./CawHero.svelte";
  import type {
    CawRunsAs,
    TriggerLayer,
    TriggerSettingsView,
  } from "./caw-settings";
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
    refusedProposes = null,
    proposesDecides,
    onchat,
    onproposes,
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
    /** His proposing switch's last change, refused: the hub's words. */
    refusedProposes?: string | null;
    /** A change to what his chat runs as. */
    onchat: (patch: Partial<TriggerLayer>) => void;
    /** Whether Caw may propose changes to Who decides (the project's `cawProposesDecides`). */
    proposesDecides: boolean;
    /** His proposing switch flipped. */
    onproposes: (next: boolean) => void;
    /** A change to a kind's own settings. */
    onkind: (kind: TriggerKind, patch: Partial<TriggerLayer>) => void;
    /**
     * In the touch sheet: the sheet's own inset holds it, its width the
     * sheet's, and it scrolls beneath the sheet's floating head
     * (`sheetScroller`), as his panel did.
     */
    sheet?: boolean;
  } = $props();

  const HEAD = "var(--color-ink-muted)";
</script>

<div
  data-slot="caw-settings"
  class={[
    "flex flex-col gap-space-5 text-ink-strong",
    sheet
      ? [
          // The scroller reaches the sheet's edges, so the hero can too;
          // its own inset puts the rest back on the sheet's.
          "-mx-4 min-h-0 overflow-y-auto px-4 pb-space-5",
          sheetScroller,
        ]
      : "w-115 max-w-full",
  ]}
>
  <CawHero disabled={hubAway} {lead} {projectId} {projectName} {sheet} />
  <!-- The settings, from the hero's edge; on the sheet its own inset holds them. -->
  <div class={["flex flex-col gap-space-6", !sheet && "px-space-4 pb-space-4"]}>
    {#if hubAway}
      <p
        data-slot="hub-away"
        class="mark-line m-0 flex items-center gap-space-2 type-meta text-ink-muted"
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
    <section data-slot="changes" class="grid gap-space-2">
      <SectionHeader
        hue={HEAD}
        icon={IconPen}
        label={words.changes}
        level={3}
      />
      <SwitchField
        checked={proposesDecides}
        disabled={hubAway}
        hint={words.proposesHint}
        id={`caw-proposes-${projectId}`}
        label={words.proposes}
        onchange={onproposes}
      />
      {#if refusedProposes}
        <p data-slot="refused" class="m-0 type-meta text-error-11" role="alert">
          {refusedProposes}
        </p>
      {/if}
    </section>
    <section data-slot="chat" class="grid gap-space-2">
      <SectionHeader hue={HEAD} icon={IconChat} label={words.chat} level={3} />
      <RunsAs
        account={chat.account}
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
        <p data-slot="refused" class="m-0 type-meta text-error-11" role="alert">
          {refusedChat}
        </p>
      {/if}
    </section>
    <section data-slot="triggers" class="grid gap-space-1">
      <SectionHeader
        hue={HEAD}
        icon={IconBolt}
        label={words.triggers}
        level={3}
      />
      {#if triggers}
        <ul class="m-0 grid list-none p-0">
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
        <p class="m-0 type-meta text-ink-muted">{words.reading}</p>
      {/if}
    </section>
  </div>
</div>
