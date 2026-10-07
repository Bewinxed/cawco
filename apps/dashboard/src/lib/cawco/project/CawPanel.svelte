<script lang="ts">
  /**
   * Caw's panel (fable-lead-switch.md §1, "switch in panel"): who he is and
   * what he is doing in one sentence, the lead switch, the harness he runs
   * on and the model his session runs, what he has spent with the way to
   * the Usage page, and the way to talk to him. Off, he is asleep: nothing
   * wakes a model, and there is nobody to message.
   */
  import type { CawHarness } from "@cawco/core";
  import { cawco, startThread, threadsOf } from "#lib/cawco/client.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { usd } from "#lib/cawco/usage.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import CawField from "./CawField.svelte";
  import { CAW_HARNESS_LABEL, type CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
  }: { lead: CawLead; projectId: string; projectName: string } = $props();

  const on = $derived(lead.view?.on ?? false);
  const lastThread = $derived(threadsOf(projectId)[0] ?? null);
  /** The model the lead's session runs, once there is one. */
  const model = $derived(lead.lead?.model ?? null);
  let talking = $state(false);
  /** The harness picker's word: where he runs, or that he is moving there. */
  const harnessWord = $derived.by(() => {
    if (lead.moving) {
      return "Moving…";
    }
    return lead.view ? CAW_HARNESS_LABEL[lead.view.harness] : "Reading…";
  });

  $effect(() => {
    lead.readSpend();
  });
</script>

<div class="caw-panel">
  <p class="head">Caw · lead of {projectName}</p>
  <div class="row">
    <CawFace size={18} status={on ? lead.status : "sleeping"} />
    <span class="sentence">{lead.sentence}</span>
  </div>
  <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch component renders a native button the label names; Biome can't see through the component boundary -->
  <label class="row switch">
    <!-- The hub's answer is the switch's state: a flip asks it, and a
         refusal leaves the switch where the hub says Caw is. -->
    <Switch
      disabled={lead.moving || !lead.view}
      bind:checked={() => on, (next) => lead.configure({ on: next })}
    />
    <span>Caw lead</span>
  </label>
  {#if lead.refused}
    <p class="refused" role="alert">{lead.refused}</p>
  {/if}
  <div class="row">
    <span class="muted">Runs on</span>
    <Select.Root
      disabled={lead.moving || !lead.view}
      onValueChange={(value) => {
        if (value && value !== lead.view?.harness) {
          lead.configure({ harness: value as CawHarness });
        }
      }}
      type="single"
      value={lead.view?.harness ?? ""}
    >
      <Select.Trigger aria-label="Harness" size="sm">
        {harnessWord}
      </Select.Trigger>
      <Select.Content>
        {#each Object.entries(CAW_HARNESS_LABEL) as [value, label] (value)}
          <Select.Item {label} {value} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if model}
      <span class="model">{model}</span>
    {/if}
  </div>
  <div class="row meta">
    {#if lead.spend}
      <span
        >Spent <span class="num">{usd(lead.spend.caw.todayUsd)}</span> today ·
        <span class="num">{usd(lead.spend.caw.monthUsd)}</span>
        this month</span
      >
    {/if}
    <a class="see" href="/usage?project={encodeURIComponent(projectId)}"
      >See spend →</a
    >
  </div>
  {#if on || lastThread}
    <div class="row actions">
      {#if on && !talking}
        <Button
          onclick={() => {
            talking = true;
          }}
          size="sm"
          variant="outline"
          >Message Caw</Button
        >
      {/if}
      {#if lastThread}
        <Button
          class="ml-auto"
          href="/session/thread:{lastThread.id}"
          size="sm"
          variant="ghost"
          >Open last thread</Button
        >
      {/if}
    </div>
  {/if}
  {#if on && talking}
    <CawField
      autofocus
      label="Message Caw"
      onsend={async (text) => {
        await startThread(projectId, text);
        talking = false;
      }}
      placeholder="Message the project…"
    />
  {/if}
  {#if cawco.hub === "unreachable"}
    <p class="muted">The hub is not answering; what shows was read before.</p>
  {/if}
</div>

<style>
  .caw-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: min(22rem, calc(100vw - 2 * var(--space-5)));
    padding: var(--space-4);
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
    min-block-size: var(--c-btn-h-sm);
  }
  .switch {
    cursor: pointer;
  }
  .sentence {
    min-inline-size: 0;
  }
  .muted,
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .model {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .see {
    margin-inline-start: auto;
    color: var(--link-ink);
    text-decoration: none;
  }
  @media (hover: hover) {
    .see:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .actions {
    justify-content: flex-start;
  }
  .refused {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
