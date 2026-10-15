<script lang="ts">
  /**
   * Caw's panel (fable-lead-switch.md §1, "switch in panel"): who he is and
   * what he is doing in one sentence, the lead switch, the harness he runs
   * on and the model his session runs, what he has spent with the way to
   * the Usage page, and the way to talk to him, on or off. Off, he acts only
   * when you write to him: no event wakes him (WORDS.md, Caw on and off).
   */
  import type { CawHarness, CawInitiated, CawRunning } from "@cawco/core";
  import { untrack } from "svelte";
  import CawOffTray, { type CawOffAsk } from "#lib/cawco/CawOffTray.svelte";
  import {
    cawco,
    onProjectStop,
    startThread,
    threadsOf,
  } from "#lib/cawco/client.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import ModelCombobox from "#lib/cawco/ModelCombobox.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
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
  let talking = $state(false);

  /**
   * Turning him off (The Stay In Context Rule): nothing he started runs,
   * and it just flips. Only his own turn an event started is in flight: one
   * line here asks whether it finishes or stops, a light choice about one
   * thing. Sessions he started still run: the tray (CawOffTray) unfolds
   * under the switch and names each one first, as a forget does. What runs
   * is read again as you flip, so the choice is about what is true now.
   */
  let turnLine = $state<CawRunning | null>(null);
  /** The turn's stop was asked: the line waits for the hub's word that it stopped. */
  let cutting = $state(false);
  /** What he started still runs: the tray asks about it, under the switch. */
  let offAsk = $state<CawOffAsk | null>(null);

  async function flip(next: boolean): Promise<void> {
    if (turnLine) {
      // The switch again while the line asks: nothing changes.
      turnLine = null;
      return;
    }
    if (offAsk) {
      // The switch again while the tray asks: nothing changes.
      offAsk = null;
      return;
    }
    if (next) {
      await lead.configure({ on: true });
      return;
    }
    await lead.read();
    const running = lead.view?.running ?? [];
    if (running.length === 0) {
      await lead.configure({ on: false });
    } else if (running.every((one) => one.kind === "turn")) {
      turnLine = running[0] ?? null;
    } else {
      offAsk = {
        projectId,
        projectName,
        running,
        settled: (view) => {
          lead.view = view;
        },
      };
    }
  }

  /** His own turn finishes or stops as he turns off; a stop's line stays until it has. */
  async function offWithTurn(initiated: CawInitiated): Promise<void> {
    const turn = turnLine;
    if (!turn) {
      return;
    }
    if (initiated === "finish") {
      await lead.configure({ on: false, initiated });
      turnLine = null;
      return;
    }
    cutting = true;
    const unhear = onProjectStop((frame) => {
      if (frame.instanceId === turn.id) {
        unhear();
        cutting = false;
        turnLine = null;
      }
    });
    await lead.configure({ on: false, initiated });
    if (lead.refused) {
      unhear();
      cutting = false;
    }
  }
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
  <div class="row status">
    <CawFace size={18} status={lead.status} />
    <span class="sentence">{lead.sentence}</span>
  </div>
  {#if lead.capLine}
    <p class="capped">{lead.capLine}</p>
  {/if}
  <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch component renders a native button the label names; Biome can't see through the component boundary -->
  <label class="row switch">
    <!-- The hub's answer is the switch's state: a flip asks it, and a
         refusal leaves the switch where the hub says Caw is. -->
    <Switch
      disabled={lead.moving || !lead.view || cutting}
      bind:checked={() => on, (next) => flip(next)}
    />
    <span>Caw lead</span>
  </label>
  {#if turnLine}
    <div class="row turn-off" data-caw-turn-line transition:unfold>
      <span class="turn-words"
        >{turnLine.title ?? "Answering an event"}. Off, it can finish or stop
        now.</span
      >
      <Button
        disabled={cutting || lead.moving}
        label="Let him finish"
        onclick={() => offWithTurn("finish")}
        size="sm"
        variant="outline"
      />
      <Button
        disabled={lead.moving}
        label="Stop now"
        onclick={() => offWithTurn("stop")}
        pending={cutting}
        pendingLabel="Stopping…"
        size="sm"
        variant="outline"
      />
    </div>
  {/if}
  {#if offAsk}
    {@const asked = offAsk}
    <CawOffTray
      ask={asked}
      onclose={() => {
        if (offAsk === asked) {
          offAsk = null;
        }
      }}
    />
  {/if}
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
    {#if lead.view}
      <ModelCombobox
        harness={lead.view.harness}
        onchoose={(chosen) => lead.configure({ model: chosen || null })}
        showDefault
        value={lead.view.model ?? ""}
      />
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
  {#if !lead.view?.problem || lastThread}
    <div class="row actions">
      {#if !(lead.view?.problem || talking)}
        <Button
          onclick={() => {
            talking = true;
          }}
          size="sm"
          variant="outline">Message Caw</Button
        >
      {/if}
      {#if lastThread}
        <Button
          class="ml-auto"
          href="/session/thread:{lastThread.id}"
          size="sm"
          variant="ghost">Open last thread</Button
        >
      {/if}
    </div>
  {/if}
  {#if talking}
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
    min-block-size: var(--c-btn-h-sm);
  }
  /* The status line and the switch are read, not worked: a line's height. */
  .row.status,
  .row.switch {
    min-block-size: auto;
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
  /* His own turn, asked about under the switch: its words, then the two ways. */
  .turn-words {
    flex: 1 1 100%;
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Past the cap: said in the needs-you ink, a fact about him, not an error. */
  .capped {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .refused {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
