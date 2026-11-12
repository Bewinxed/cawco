<script lang="ts">
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What a session waits on the person for, one row per question (rows.ts):
   * the asks its tree's turns are parked on, then the questions its tree
   * put to him and he has not answered. Once he answers one it leaves.
   *
   * Every row reads down the same columns (DESIGN.md, The Row Grid Rule):
   * its kind's glyph centred in the 28px lead column (a decision, a preview
   * to judge (Preview), a pin, a permission, a question, a sign-in, each Solar's
   * duotone tile), then the question in body over its facts in meta (the
   * artifact, and the session under this one that asked, whole: who asked
   * is never cut). The words alone wrap, from one x, to the row's end.
   *
   * A press opens what asks it where it asks (`onopen`): an artifact in its
   * session's panel at its card, its pin or its top; a permission or a
   * question in the composer that holds it; a sign-in at its card in the transcript.
   * An open that did not go says why under its row, with Try again
   * (`faultOf`, RowFault). A row's button is named by what it shows: its
   * question and its facts.
   */
  import type { Component } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import {
    IconDecisions,
    IconEye,
    IconKey,
    IconPin,
    IconQuestion,
    IconShieldKeyhole,
  } from "#lib/icons.js";
  import RowFault from "../RowFault.svelte";
  import { isAsk, type WaitingKind, type WaitingRow } from "./rows";

  let {
    rows,
    onopen,
    faultOf = () => null,
  }: {
    rows: WaitingRow[];
    onopen: (row: WaitingRow) => void;
    /** Why the row's last open did not go; null once it went. */
    faultOf?: (row: WaitingRow) => string | null;
  } = $props();

  const KIND_GLYPH: Record<WaitingKind, Component<Record<string, unknown>>> = {
    card: IconDecisions,
    judge: IconEye,
    pin: IconPin,
    permission: IconShieldKeyhole,
    question: IconQuestion,
    connect: IconKey,
  };

  /** The row's facts: the artifact that asks it, and the session under this one that did. */
  const facts = (row: WaitingRow): string[] =>
    [
      isAsk(row) ? null : row.artifact.title,
      row.from ? waitingWords.fromSession(row.from.title) : null,
    ].filter((one): one is string => !!one);
</script>

<!-- The highlight draws in a shadow root, which a list element cannot hold. -->
<div
  data-slot="waiting-list"
  class="relative flex flex-col"
  {@attach highlight({ rows: "[data-waiting-face]" })}
>
  <ul class="flex flex-col">
    {#each rows as row (row.key)}
      {@const Glyph = KIND_GLYPH[row.kind]}
      {@const said = facts(row)}
      <li class="relative" data-waiting-row>
        <!-- The face is the highlight's row: hover, press and focus draw on its one rounded box. -->
        <button
          class="focus-inset press-tint grid w-full grid-cols-(--waiting-cols) items-start gap-x-c-row-inset rounded-sm px-c-row-inset py-space-2 text-start"
          data-kind={row.kind}
          data-waiting-face
          onclick={() => onopen(row)}
          style:--waiting-cols="var(--spacing-c-row-lead) minmax(0, 1fr)"
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
              <span class="type-meta text-pretty wrap-anywhere text-ink-muted"
                >{said.join(" · ")}</span
              >
            {/if}
          </span>
        </button>
        <RowFault
          again={() => onopen(row)}
          end="var(--spacing-c-row-inset)"
          indent="calc(var(--spacing-c-row-inset) * 2 + var(--spacing-c-row-lead))"
          reason={faultOf(row)}
        />
      </li>
    {/each}
  </ul>
</div>
