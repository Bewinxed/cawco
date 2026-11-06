<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What a session waits on the person for, one row per question (rows.ts):
   * the permission asks its turn is parked on, the questions its tree put
   * to him and he has not answered, then, under their head, those he
   * answered that the agent has not taken up yet.
   *
   * Every row reads down the same columns (DESIGN.md, The Row Grid Rule):
   * its kind's glyph centred in the 28px lead column (a decision, a canvas
   * to judge, a pin, a permission), the question in body over its facts in
   * meta (the artifact, and the session under this one that asked), its
   * state in a trailing column of the same width: empty while it waits on
   * him (the list's own title says so), the tick once he answered. The
   * words alone wrap, from one x.
   *
   * A press opens what asks it where it asks (`onopen`): an artifact in its
   * session's panel at its card, its pin or its top; a permission ask in
   * the composer that holds it.
   */
  import type { Component } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconDecisions,
    IconEye,
    IconPin,
    IconShield,
    IconTick,
  } from "#lib/icons.js";
  import type { WaitingKind, WaitingRow } from "./rows";

  let {
    rows,
    onopen,
  }: {
    rows: WaitingRow[];
    onopen: (row: WaitingRow) => void;
  } = $props();

  const KIND_GLYPH: Record<WaitingKind, Component<Record<string, unknown>>> = {
    card: IconDecisions,
    judge: IconEye,
    pin: IconPin,
    permission: IconShield,
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
    return [row.kind === "permission" ? null : row.artifact.title, from].filter(
      (one): one is string => !!one
    );
  };
</script>

<div
  data-slot="waiting-list"
  class="relative flex flex-col"
  {@attach highlight({ rows: "[data-waiting-row]" })}
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
      aria-label={waitingWords.answeredHead}
    >
      {#if open.length > 0}
        <h3
          class="type-label mark-line m-0 flex min-h-c-section-head-h items-center gap-c-row-inset px-c-row-inset text-ink-muted"
        >
          {waitingWords.answeredHead}
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
  <li class="relative" data-waiting-row data-state={row.state}>
    <button
      aria-label={row.kind === "permission"
        ? waitingWords.showAsk(row.words)
        : waitingWords.open(row.words)}
      class="focus-inset press-tint grid w-full grid-cols-(--waiting-cols) items-start gap-x-c-row-inset rounded-sm px-c-row-inset py-space-2 text-start"
      data-kind={row.kind}
      onclick={() => onopen(row)}
      style:--waiting-cols="var(--c-row-lead) minmax(0, 1fr) var(--c-row-lead)"
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
        <span class="type-body line-clamp-3 wrap-anywhere text-ink-strong"
          >{row.words}</span
        >
        {#if said.length > 0}
          <span class="type-meta truncate text-ink-muted"
            >{said.join(" · ")}</span
          >
        {/if}
      </span>
      <span
        class="mark-cell type-body w-c-row-lead"
        title={waitingWords.state[row.state]}
        data-box
      >
        {#if row.state === "answered"}
          <IconTick aria-hidden="true" class="size-icon-md text-ink-muted" />
        {/if}
        <span class="sr-only">{waitingWords.state[row.state]}</span>
      </span>
    </button>
  </li>
{/snippet}
