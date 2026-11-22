<script lang="ts" module>
  /** Where an answer stands: not sent, on its way to the hub, taken, or refused in the hub's words. */
  export type AnswerState =
    | { kind: "open" }
    | { kind: "sending"; choice: string }
    | { kind: "answered"; choice: string }
    | { kind: "refused"; choice: string; why: string };
</script>

<script lang="ts">
  /**
   * S3, the ask block, for a run's question: who asks, about which line and
   * since when; the ask in the asker's own words; the evidence the run gave
   * with the way to the whole run; that the routine waits; then the run's
   * choices as option chips and Send answer, the view's one coral act
   * while it stands (DESIGN.md, Coral is the act). It is drawn in the lead
   * tile, never as a card inside it (DESIGN.md, the only card inside a card
   * is the stat tile's well): its parts are set apart by space and the
   * quotation's edge. The answer is no answer until the hub takes it: Send
   * holds its pending state, a refusal stands under the block in the hub's
   * sentence with the pick kept, and a taken answer replaces the block, in
   * place, with one line saying what happened.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import type { RunQuestion } from "./outcomes";

  let {
    ask,
    about,
    answer,
    offline,
    evidence = true,
    onsend,
    onreadrun,
  }: {
    ask: RunQuestion;
    /** The line's sentence the ask concerns; null where the line, marked, stands right under it. */
    about: string | null;
    answer: AnswerState;
    /** Why no answer can go now (the hub is not answering); null while it can. */
    offline: string | null;
    /** The run's evidence stands in the block; where room is short it is one press away, in the whole run. */
    evidence?: boolean;
    onsend: (choice: string) => void;
    onreadrun: () => void;
  } = $props();

  /** The person's pick, kept through a refusal. */
  let picked = $state<string[]>([]);
  const choice = $derived(picked[0] ?? null);
  const sending = $derived(answer.kind === "sending");
</script>

{#if answer.kind === "answered"}
  <p class="type-body text-ink-strong" data-slot="answered">
    You answered: {answer.choice}. {ask.goesOn}
  </p>
{:else}
  <section
    aria-label="{ask.who} asks"
    class="flex min-w-0 flex-col gap-space-3"
    data-slot="ask"
  >
    <div class="flex min-w-0 flex-col gap-space-1">
      <p class="mark-line flex min-w-0 items-center gap-space-2 type-label">
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-sm flex-none text-status-attn-glyph"
        />
        <span class="min-w-0 text-status-attn-ink">{ask.who} asks</span>
        <span class="ms-auto flex-none type-meta text-ink-muted tabular-nums"
          >since {ask.since}</span
        >
      </p>
      {#if about}
        <p class="type-meta text-ink-muted">About: {about}</p>
      {/if}
    </div>

    <blockquote
      class="border-s-2 border-border-control ps-space-3 type-body text-ink-strong"
    >
      {ask.quote}
    </blockquote>

    {#if evidence}
      <ul class="flex min-w-0 flex-col type-meta text-ink-muted">
        {#each ask.evidence as line (line)}
          <li class="min-w-0">{line}</li>
        {/each}
      </ul>
    {/if}

    <p
      class="flex flex-wrap items-baseline gap-x-space-2 type-meta text-ink-muted"
    >
      <span>{ask.held}</span>
      <Button
        pad="none"
        label="Read the whole run"
        onclick={onreadrun}
        size="xs"
        variant="link"
      />
    </p>

    <div class="flex min-w-0 flex-wrap items-center gap-space-3">
      <OptionGroup
        aria-label="Your answer"
        bind:value={picked}
        disabled={sending || offline !== null}
      >
        {#each ask.choices as one (one)}
          <OptionGroupItem value={one}>{one}</OptionGroupItem>
        {/each}
      </OptionGroup>
      <Button
        class="ms-auto"
        disabled={choice === null || offline !== null}
        label="Send answer"
        onclick={() => {
          if (choice !== null) {
            onsend(choice);
          }
        }}
        pending={sending}
        pendingLabel="Sending…"
        size="sm"
        title={offline ?? undefined}
      />
    </div>

    {#if offline !== null}
      <p class="type-meta text-ink-muted">{offline}</p>
    {:else if answer.kind === "refused"}
      <p class="type-meta text-status-fail-ink" role="alert">{answer.why}</p>
    {/if}
  </section>
{/if}
