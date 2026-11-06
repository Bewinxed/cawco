<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What a session waits on the person for, one row per question (rows.ts):
   * the asks its tree's turns are parked on, the questions its tree put
   * to him and he has not answered, then, under their head, those he
   * answered that the agent has not taken up yet.
   *
   * Every row reads down the same columns (DESIGN.md, The Row Grid Rule):
   * its kind's glyph centred in the 28px lead column (a decision, a preview
   * to judge, a pin, a permission, a question, a sign-in, each Solar's
   * duotone tile), then the question in body over its facts in meta (the
   * artifact, and the session under this one that asked, whole: who asked
   * is never cut). The words alone wrap, from one x, to the row's end.
   *
   * Whose move it is is said by where a row stands: the list's title says
   * what waits on him; what he answered that the agent has not taken up
   * stands under a head of the same form naming the agent ("Waiting on
   * Claude Code"), its question quieter and his answer under it.
   *
   * A press opens what asks it where it asks (`onopen`): an artifact in its
   * session's panel at its card, its pin or its top; a permission or a
   * question in the composer that holds it; a sign-in at its card in the transcript.
   * An open that did not go says why under its row, with Try again
   * (`faultOf`, RowFault).
   */
  import type { Component } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconDecisions,
    IconEye,
    IconKey,
    IconPin,
    IconQuestion,
    IconShield,
  } from "#lib/icons.js";
  import RowFault from "../RowFault.svelte";
  import { isAsk, type WaitingKind, type WaitingRow } from "./rows";

  let {
    agent,
    rows,
    onopen,
    faultOf = () => null,
  }: {
    /** The session's agent, by the name the conversation gives it: whose move an answered row is. */
    agent: string;
    rows: WaitingRow[];
    onopen: (row: WaitingRow) => void;
    /** Why the row's last open did not go; null once it went. */
    faultOf?: (row: WaitingRow) => string | null;
  } = $props();

  const KIND_GLYPH: Record<WaitingKind, Component<Record<string, unknown>>> = {
    card: IconDecisions,
    judge: IconEye,
    pin: IconPin,
    permission: IconShield,
    question: IconQuestion,
    connect: IconKey,
  };

  const open = $derived(rows.filter((row) => row.state === "open"));
  const answered = $derived(rows.filter((row) => row.state === "answered"));

  /** The row's facts: the artifact that asks it, and the session under this one that did. */
  const facts = (row: WaitingRow): string[] => {
    let from: string | null = null;
    if (row.from) {
      from = row.from.ended
        ? waitingWords.fromEnded(row.from.title)
        : waitingWords.fromSession(row.from.title);
    }
    return [isAsk(row) ? null : row.artifact.title, from].filter(
      (one): one is string => !!one
    );
  };
</script>

<div
  data-slot="waiting-list"
  class="relative flex flex-col"
  {@attach highlight({ rows: "[data-waiting-face]" })}
>
  {#if open.length > 0}
    <ul class="flex flex-col">
      {#each open as row (row.key)}
        {@render item(row)}
      {/each}
    </ul>
  {/if}
  {#if answered.length > 0}
    <!-- Headed only under rows that wait on him: alone, the list's title says it. -->
    <section
      class="flex flex-col not-first:mbs-space-2 not-first:pbs-space-2 not-first:border-bs not-first:border-bs-border-hairline"
      aria-label={waitingWords.answeredHead(agent)}
    >
      {#if open.length > 0}
        <h3
          class="type-label mark-line m-0 flex min-h-c-section-head-h items-center gap-c-row-inset px-c-row-inset text-ink-muted"
        >
          {waitingWords.answeredHead(agent)}
        </h3>
      {/if}
      <ul class="flex flex-col">
        {#each answered as row (row.key)}
          {@render item(row)}
        {/each}
      </ul>
    </section>
  {/if}
</div>

{#snippet item(row: WaitingRow)}
  {@const Glyph = KIND_GLYPH[row.kind]}
  {@const said = facts(row)}
  {@const answer = !isAsk(row) && row.answer ? row.answer : null}
  <li class="relative" data-waiting-row data-state={row.state}>
    <!-- The face is the highlight's row: hover, press and focus draw on its one rounded box. -->
    <button
      aria-label={isAsk(row)
        ? waitingWords.showAsk(row.words)
        : waitingWords.open(row.words)}
      class="focus-inset press-tint grid w-full grid-cols-(--waiting-cols) items-start gap-x-c-row-inset rounded-sm px-c-row-inset py-space-2 text-start"
      data-kind={row.kind}
      data-waiting-face
      onclick={() => onopen(row)}
      style:--waiting-cols="var(--c-row-lead) minmax(0, 1fr)"
      type="button"
    >
      <span
        class="mark-cell type-body w-c-row-lead text-ink-muted"
        title={waitingWords.kind[row.kind]}
        data-box
      >
        <Glyph aria-hidden="true" class="size-icon-md" />
      </span>
      <span class="flex min-w-0 flex-col gap-space-row">
        <span
          class={[
            "type-body line-clamp-3 wrap-anywhere",
            answer ? "text-ink-row" : "text-ink-strong",
          ]}>{row.words}</span
        >
        {#if answer}
          <span class="type-meta line-clamp-2 wrap-anywhere text-ink-strong"
            >{waitingWords.yourAnswer(answer.by, answer.said)}</span
          >
        {/if}
        {#if said.length > 0}
          <span class="type-meta text-pretty wrap-anywhere text-ink-muted"
            >{said.join(" · ")}</span
          >
        {/if}
        <span class="sr-only">{waitingWords.state[row.state]}</span>
      </span>
    </button>
    <RowFault
      again={() => onopen(row)}
      end="var(--c-row-inset)"
      indent="calc(var(--c-row-inset) * 2 + var(--c-row-lead))"
      reason={faultOf(row)}
    />
  </li>
{/snippet}
