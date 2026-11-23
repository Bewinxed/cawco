<script lang="ts">
  /**
   * What a running session does when its account runs out and another is
   * free: wait for a reset that is close, or move. A conversation of the
   * floor or more that moves to another organization is made small as the
   * policy says (core `Compaction`): at its limit with a warm cache, its own
   * /compact, a summary, or whole; with a cold cache, whole or the cheapest
   * path the hub prices (core `ColdMove`). Who writes
   * summaries is the New session form's model picker. The figure under the
   * numbers plays that policy, rebuilt as they change. Off, the numbers fold
   * away with the figure and the terms. Under them, on or off, the room, in
   * thousands of tokens, short of where its harness compacts a session at
   * which it files its open items (core `Compaction.fileRoom`), and how long
   * past its reset a stopped session is still carried on by itself (core
   * `AtLimit.staleAfterHours`). While the provider's saved policy can't be
   * read (`unread`), a warning heads the block: the settings shown are the
   * restrictive policy the hub acts on, and a save here clears it. For
   * ChatGPT (`onePlan`, core `isChatgptPlan`) no session moves at its limit:
   * a note says it waits on its own plan and what its line offers, in the
   * move settings' place.
   */
  import type { Account, AtLimit } from "@cawco/core/accounts";
  import {
    COLD_MOVES,
    COMPACT_METHODS,
    type ColdMove,
    type CompactMethod,
  } from "@cawco/core/accounts/kinds";
  import { HARNESSES } from "@cawco/core/harness/kinds";
  import { accountsWords } from "@cawco/core/words/accounts";

  import ModelSection from "#lib/cawco/spawn/ModelSection.svelte";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconArrowUpRight, IconWarningTriangle } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { hueVar, nameOf, TERMS_URL } from "./model.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    atLimit = $bindable(),
    accounts,
    onePlan = false,
    terms,
    unread,
  }: {
    /** ChatGPT: its sessions wait on their own plan and move to no other. */
    onePlan?: boolean;
    atLimit: AtLimit;
    /** The saved policy's fields that can't be read (core `ProviderRouting.atLimitUnread`); undefined when it reads. */
    unread?: string;
    /** The account that runs out, then the one that is free. */
    accounts: [Account, Account];
    /** Claude subscriptions: Anthropic's terms cover the move, so they are linked. */
    terms: boolean;
  } = $props();

  const words = accountsWords.atLimit;
  const id = $props.id();
  const lanes = $derived(
    accounts.map((account) => ({
      name: nameOf(account),
      color: hueVar(account.hue),
    }))
  );
  const policy = $derived({
    wait: atLimit.waitMinutes,
    over: atLimit.moveWholeUnderK,
    method: atLimit.compaction.atLimit,
  });
  const summarises = $derived(atLimit.compaction.atLimit === "summary");
  /** The machines a summariser may run on: every connected one. */
  const online = $derived(
    boardStore.machines.filter((machine) => machine.status === "online")
  );
  const installed = $derived(
    HARNESSES.filter((kind) =>
      online.some((machine) =>
        machine.harnesses?.some(
          (entry) => entry.harness === kind && entry.installed
        )
      )
    )
  );

  /** A field's number: whole, at least 0; empty reads as 0. */
  function whole(value: string): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  const isMethod = (value: string): value is CompactMethod =>
    COMPACT_METHODS.some((one) => one === value);
  const isColdMove = (value: string): value is ColdMove =>
    COLD_MOVES.some((one) => one === value);
</script>

<div class="@container flex flex-col">
  <h3
    data-slot="head"
    class="type-label mb-space-3 text-balance text-ink-strong"
  >
    {words.head}
  </h3>
  {#if unread !== undefined}
    <Alert class="mb-space-3" role="status" variant="warning">
      <IconWarningTriangle />
      <AlertDescription>{words.unread(unread)}</AlertDescription>
    </Alert>
  {/if}
  {#if onePlan}
    <p
      data-slot="one-plan"
      class="pt-space-2 pb-space-3 text-pretty text-ink-strong"
    >
      {words.onePlan}
    </p>
  {:else}
    <div
      class="flex items-center justify-between gap-space-4 pt-space-2 pb-space-3 text-ink-strong"
    >
      <label for="{id}-move">{words.move}</label>
      <Switch id="{id}-move" bind:checked={atLimit.move} />
    </div>
  {/if}
  {#if atLimit.move && !onePlan}
    <div class="flex flex-col" in:unfold out:unfold>
      <p
        class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-strong"
      >
        <label for="{id}-wait">{words.wait}</label>
        <Input
          data-num
          data-field
          class="flex-none"
          field="number"
          id="{id}-wait"
          inputmode="numeric"
          min="0"
          oninput={(event) => {
            atLimit.waitMinutes = whole(event.currentTarget.value);
          }}
          type="number"
          value={atLimit.waitMinutes}
        />
        <span>{words.minutes}</span>
      </p>
      <p
        class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-strong"
      >
        <label for="{id}-over">{words.over}</label>
        <Input
          data-num
          data-field
          class="flex-none"
          field="number"
          id="{id}-over"
          inputmode="numeric"
          min="0"
          oninput={(event) => {
            atLimit.moveWholeUnderK = whole(event.currentTarget.value);
          }}
          type="number"
          value={atLimit.moveWholeUnderK}
        />
        <span>{words.kTokens}</span>
      </p>
      <div
        class="flex flex-wrap items-center justify-between gap-space-3 py-space-2 text-pretty text-ink-strong"
      >
        <span id="{id}-at-limit">{words.atLimit}</span>
        <Tabs
          onValueChange={(value) => {
            if (isMethod(value)) {
              atLimit.compaction.atLimit = value;
            }
          }}
          value={atLimit.compaction.atLimit}
          values={COMPACT_METHODS}
        >
          <TabsList aria-labelledby="{id}-at-limit">
            {#each COMPACT_METHODS as method (method)}
              <TabItem label={words.methods[method]} value={method} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      <div
        class="flex flex-wrap items-center justify-between gap-space-3 py-space-2 text-pretty text-ink-strong"
      >
        <span id="{id}-cold-move">{words.coldMove}</span>
        <Tabs
          onValueChange={(value) => {
            if (isColdMove(value)) {
              atLimit.compaction.coldMove = value;
            }
          }}
          value={atLimit.compaction.coldMove}
          values={COLD_MOVES}
        >
          <TabsList aria-labelledby="{id}-cold-move">
            {#each COLD_MOVES as move (move)}
              <TabItem label={words.coldMoves[move]} value={move} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      {#if summarises}
        <div class="flex flex-col gap-space-3 py-space-2" in:unfold out:unfold>
          <p class="type-meta m-0 text-pretty text-ink-muted">
            {words.summaryHint}
          </p>
          <ModelSection
            harness={atLimit.compaction.summarizer.harness}
            {installed}
            label={words.summarizer}
            machineIds={online.map((machine) => machine.machineId)}
            machineName={online[0]?.hostname ?? ""}
            model={atLimit.compaction.summarizer.model}
            onharness={(harness) => {
              atLimit.compaction.summarizer = { harness, model: "" };
            }}
            onmodel={(model) => {
              atLimit.compaction.summarizer.model = model;
            }}
          />
        </div>
      {/if}
      <div class="my-space-3">
        <StrategyFigure board="limit" {lanes} playing {policy} />
      </div>
      {#if terms}
        <a
          class="mark-line inline-flex items-center gap-space-1 self-start rounded-xs type-label text-pretty text-accent-ink no-underline hover:text-accent-ink"
          href={TERMS_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{words.terms}</span>
          <IconArrowUpRight class="size-icon-sm flex-none" />
        </a>
      {/if}
    </div>
  {/if}
  <p
    class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-strong"
  >
    <label for="{id}-file-room">{words.fileRoom}</label>
    <Input
      data-num
      data-field
      class="flex-none"
      field="number"
      id="{id}-file-room"
      inputmode="numeric"
      min="0"
      oninput={(event) => {
        atLimit.compaction.fileRoom = whole(event.currentTarget.value) * 1000;
      }}
      type="number"
      value={atLimit.compaction.fileRoom / 1000}
    />
    <span>{words.fileRoomUnit}</span>
    <span class="type-meta text-ink-muted">{words.fileRoomOff}</span>
  </p>
  <p
    class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-strong"
  >
    <label for="{id}-stale">{words.stale}</label>
    <Input
      data-num
      data-field
      class="flex-none"
      field="number"
      id="{id}-stale"
      inputmode="numeric"
      min="1"
      oninput={(event) => {
        atLimit.staleAfterHours = Math.max(1, whole(event.currentTarget.value));
      }}
      type="number"
      value={atLimit.staleAfterHours}
    />
    <span>{words.staleHours}</span>
    <span class="type-meta text-ink-muted">{words.staleAfter}</span>
  </p>
</div>
