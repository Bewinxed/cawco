<script lang="ts" module>
  /** Where an answer stands: not sent, on its way, said by the hub, or refused by it. */
  export type AnswerState =
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "answered"; choice: string }
    | { kind: "refused"; sentence: string };
</script>

<script lang="ts">
  /**
   * The ask block (shared part S3), a run's question: who asks, what it is
   * about and since when; the ask in the asker's own words, as a
   * quotation; the evidence that run gave with "Read the whole run"; that
   * the routine will not start again until he answers; the run's choices
   * as option chips; Send answer. Sent, its control stays pending until the
   * hub answers; refused, the hub's sentence stands under it with his pick
   * kept; answered, the block is one line saying what happened.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import type { Ask } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    ask,
    about,
    choice,
    state,
    live = true,
    onchoose,
    onsend,
    onreadrun,
  }: {
    ask: Ask;
    /** The line's sentence it concerns, when it names one. */
    about: string | null;
    /** What he picked, kept when the card closes. */
    choice: string | null;
    state: AnswerState;
    /** The hub answers; with it away, nothing can be sent. */
    live?: boolean;
    onchoose: (choice: string | null) => void;
    onsend: () => void;
    onreadrun: () => void;
  } = $props();
</script>

{#if state.kind === "answered"}
  <p
    data-slot="answered"
    class="m-0 mark-line flex items-start gap-space-2 type-body text-ink-strong"
  >
    <span class="mark-cell">
      <IconSuccess
        aria-hidden="true"
        class="size-icon-md text-status-done-glyph"
      />
    </span>
    <span>{outcomesWords.answered(state.choice, ask.from)}</span>
  </p>
{:else}
  <div data-slot="ask" class="flex flex-col gap-space-3">
    <p class="m-0 flex flex-wrap gap-x-space-2 type-meta text-ink-muted">
      <span class="font-medium text-status-attn-ink">{ask.from}</span>
      {#if about}<span>About: {about}</span>{/if}
      <span>{ask.since}</span>
    </p>
    <blockquote
      class="m-0 border-s-2 border-border-control ps-space-3 type-body text-pretty text-ink-strong"
    >
      {ask.ask}
    </blockquote>
    <div class="flex flex-col items-start gap-space-1">
      <ul
        class="m-0 flex w-full list-none flex-col gap-px p-0 font-mono type-meta text-ink-muted"
      >
        {#each ask.evidence.slice(0, 4) as said (said)}
          <li class="wrap-anywhere">{said}</li>
        {/each}
      </ul>
      <Button
        label={outcomesWords.readRun}
        onclick={onreadrun}
        size="xs"
        variant="link"
        pad="none"
      />
    </div>
    <p class="m-0 type-label text-ink-muted">{ask.holds}</p>
    <OptionGroup
      aria-label={ask.ask}
      disabled={!live || state.kind === "sending"}
      bind:value={
        () => (choice === null ? [] : [choice]),
        (next) => onchoose(next[0] ?? null)
      }
    >
      {#each ask.choices as each, index (each)}
        <OptionGroupItem digit={index + 1} value={each}>{each}</OptionGroupItem>
      {/each}
    </OptionGroup>
    <div class="flex flex-wrap items-center gap-space-3">
      <Button
        disabled={!live || choice === null}
        label={outcomesWords.sendAnswer}
        onclick={onsend}
        pending={state.kind === "sending"}
        pendingLabel={outcomesWords.sending}
        size="sm"
        title={live ? undefined : outcomesWords.notLiveReason}
      />
      {#if !live}
        <span class="type-meta text-ink-muted"
          >{outcomesWords.notLiveReason}</span
        >
      {/if}
    </div>
    {#if state.kind === "refused"}
      <p
        role="alert"
        class="m-0 mark-line flex items-start gap-space-2 type-label text-status-fail-ink"
      >
        <span class="mark-cell">
          <IconWarningTriangle
            aria-hidden="true"
            class="size-icon-md text-status-fail-glyph"
          />
        </span>
        <span>{outcomesWords.refused(state.sentence)}</span>
      </p>
    {/if}
  </div>
{/if}
