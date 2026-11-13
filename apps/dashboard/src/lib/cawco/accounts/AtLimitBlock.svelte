<script lang="ts">
  /**
   * What a running session does when its account runs out and another is
   * free: wait for a reset that is close, or move. A conversation of the
   * floor or more that moves to another organization is made small as the
   * policy says, by the moment it moves at (core `Compaction`): ahead of its
   * limit, or at it; its own /compact, a summary, or whole. Who writes
   * summaries is the New session form's model picker. The figure under the
   * numbers plays that policy, rebuilt as they change. Off, the numbers fold
   * away with the figure and the terms. Under them, on or off, the room, in
   * thousands of tokens, short of where its harness compacts a session at
   * which it files its open items (core `Compaction.fileRoom`), and how long
   * past its reset a stopped session is still carried on by itself (core
   * `AtLimit.staleAfterHours`).
   */
  import type { Account, AtLimit } from "@cawco/core/accounts";
  import {
    COMPACT_METHODS,
    type CompactMethod,
  } from "@cawco/core/accounts/kinds";
  import { HARNESSES } from "@cawco/core/harness/kinds";
  import { accountsWords } from "@cawco/core/words/accounts";

  import ModelSection from "#lib/cawco/spawn/ModelSection.svelte";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconArrowUpRight } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { hueVar, nameOf, TERMS_URL } from "./model.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    atLimit = $bindable(),
    accounts,
    terms,
  }: {
    atLimit: AtLimit;
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
  /** The two moments a move is made small at, each its own choice. */
  const moments = [
    { key: "beforeMove", label: words.beforeMove },
    { key: "atLimit", label: words.atLimit },
  ] as const;
  const summarises = $derived(
    atLimit.compaction.beforeMove === "summary" ||
      atLimit.compaction.atLimit === "summary"
  );
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
</script>

<div class="@container flex flex-col">
  <h3
    data-slot="head"
    class="type-label mb-space-3 text-balance text-ink-strong"
  >
    {words.head}
  </h3>
  <div
    class="flex items-center justify-between gap-space-4 pt-space-2 pb-space-3 text-ink-row"
  >
    <label for="{id}-move">{words.move}</label>
    <Switch id="{id}-move" bind:checked={atLimit.move} />
  </div>
  {#if atLimit.move}
    <div class="flex flex-col" in:unfold out:unfold>
      <p
        class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-row"
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
        class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-row"
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
      {#each moments as moment (moment.key)}
        <div
          class="flex flex-wrap items-center justify-between gap-space-3 py-space-2 text-pretty text-ink-row"
        >
          <span id="{id}-{moment.key}">{moment.label}</span>
          <Tabs.Root
            onValueChange={(value) => {
              if (isMethod(value)) {
                atLimit.compaction[moment.key] = value;
              }
            }}
            value={atLimit.compaction[moment.key]}
          >
            <Tabs.List aria-labelledby="{id}-{moment.key}">
              {#each COMPACT_METHODS as method (method)}
                <Tabs.Trigger value={method}>
                  {words.methods[method]}
                </Tabs.Trigger>
              {/each}
            </Tabs.List>
          </Tabs.Root>
        </div>
      {/each}
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
          class="mark-line inline-flex items-center gap-space-1 self-start rounded-xs type-label text-pretty text-link-ink no-underline hover:text-link-hover"
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
    class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-row"
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
    class="flex flex-wrap items-center gap-space-3 py-space-2 text-pretty text-ink-row"
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
