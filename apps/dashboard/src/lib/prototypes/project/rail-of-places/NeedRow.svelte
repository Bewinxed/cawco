<script lang="ts" module>
  import type { Component } from "svelte";
  import {
    IconAsk,
    IconDecisions,
    IconError,
    IconGlobe,
    IconNeedsYou,
    IconSend,
    IconTaskList,
  } from "#lib/icons.js";
  import type { NeedKind } from "./model";

  /** Each kind of wait's glyph, in the row's lead column; its word is the glyph's name. */
  export const NEED_GLYPHS: Record<NeedKind, Component> = {
    task: IconTaskList,
    failed: IconError,
    ask: IconAsk,
    picks: IconDecisions,
    action: IconSend,
    browser: IconGlobe,
    proposal: IconNeedsYou,
  };
</script>

<script lang="ts">
  /**
   * One wait in Home's Needs you, answered where it stands (TOM task 2): its
   * kind as a glyph in the lead column (the word in its name and tooltip),
   * the thing it belongs to and how long it has waited, what it asks, the
   * exact call where there is one, then its answer. A grant's two answers
   * are peers at the row's two ends (DESIGN.md, The Peer Rule); Not now
   * keeps it answerable and stands apart, on the title's line.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconCheck, IconClose, IconPlay, IconRefresh } from "#lib/icons.js";
  import type { Need } from "./model";

  let {
    need,
    held = false,
    onanswer,
    onopen,
    onlater,
  }: {
    need: Need;
    /** The hub is not live: kept as it was, its answers wait. */
    held?: boolean;
    /** Approve (true) or deny (false) a grant in place. */
    onanswer: (need: Need, yes: boolean) => void;
    /** Open what it belongs to: the task in its pane, the decision page at its question. */
    onopen: (need: Need) => void;
    onlater: (need: Need) => void;
  } = $props();

  const Glyph = $derived(NEED_GLYPHS[need.kind]);
  const kindWord = $derived(w.needKinds[need.kind]);
  const grant = $derived(
    need.kind === "ask" || need.kind === "action" || need.kind === "proposal"
  );
</script>

<li
  class="flex gap-space-3 px-space-3 py-space-4 data-held:opacity-55"
  data-flip
  data-held={held || undefined}
  data-kind={need.kind}
>
  <Tip label={kindWord}>
    {#snippet children(props)}
      <span
        {...props}
        class="mark-cell grid h-c-row-mark w-c-row-lead flex-none place-items-center text-status-attn-glyph data-[kind=failed]:text-status-fail-glyph"
        data-kind={need.kind}
        role="img"
        aria-label={kindWord}
      >
        <Glyph class="size-icon-md" aria-hidden="true" />
      </span>
    {/snippet}
  </Tip>
  <div class="flex min-w-0 flex-1 flex-col gap-space-2">
    <div class="mark-line flex min-w-0 items-center gap-space-3">
      <span class="min-w-0 flex-1 truncate type-label text-ink-row"
        >{need.title}</span
      >
      <span
        class="w-c-ledger-when-w flex-none text-end type-meta num text-ink-muted"
        >{need.wait}</span
      >
      <Button
        class="flex-none"
        variant="ghost"
        size="xs"
        tone="quiet"
        disabled={held}
        onclick={() => onlater(need)}>{w.notNow}</Button
      >
    </div>
    <p class="type-body text-pretty text-ink-strong">{need.asks}</p>
    {#if need.call}
      <code
        class="block overflow-x-auto rounded-sm bg-code-bg px-space-3 py-space-2 type-code whitespace-pre-wrap break-word text-ink-strong"
        >{need.call}</code
      >
    {/if}
    {#if grant}
      <div class="mt-space-1 flex justify-between gap-space-8">
        <Button
          class="flex-none"
          variant="secondary"
          size="sm"
          answer="approve-strong"
          hit="always"
          fit="prompt"
          width="shrink"
          icon={IconCheck}
          label={w.approve}
          disabled={held}
          onclick={() => onanswer(need, true)}
        />
        <Button
          class="flex-none"
          variant="secondary"
          size="sm"
          answer="deny-strong"
          hit="always"
          fit="prompt"
          width="shrink"
          icon={IconClose}
          label={need.kind === "action" ? w.decline : w.deny}
          disabled={held}
          onclick={() => onanswer(need, false)}
        />
      </div>
    {:else}
      <div class="mt-space-1 flex flex-wrap items-center gap-space-3">
        {#if need.kind === "picks" && need.picked}
          <Button
            class="flex-none"
            variant="outline"
            size="sm"
            disabled={held}
            onclick={() => onopen(need)}
            >{w.openAtQuestion(need.question ?? 1)}</Button
          >
          <span class="type-meta num text-ink-muted"
            >{w.picked(need.picked[0], need.picked[1])}</span
          >
        {:else if need.kind === "failed"}
          <Button
            class="flex-none"
            variant="outline"
            size="sm"
            icon={IconRefresh}
            label={w.tryAgain}
            disabled={held}
          />
          <Button
            class="flex-none"
            variant="ghost"
            size="sm"
            onclick={() => onopen(need)}>{w.open}</Button
          >
        {:else if need.kind === "browser"}
          <Button
            class="flex-none"
            variant="outline"
            size="sm"
            icon={IconPlay}
            label={w.takeOver}
            disabled={held}
          />
        {:else}
          <Button
            class="flex-none"
            variant="outline"
            size="sm"
            aria-label={w.openTask(need.title)}
            onclick={() => onopen(need)}>{w.open}</Button
          >
        {/if}
      </div>
    {/if}
  </div>
</li>
