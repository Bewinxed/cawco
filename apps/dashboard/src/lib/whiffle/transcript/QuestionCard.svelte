<script lang="ts">
  import type {
    UserAnswers,
    UserQuestion,
    UserQuestionResult,
  } from "@whiffle/core";
  import { IconCheck, IconClose } from "$lib/icons";
  import { dur, easeOut, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import { questionsOf } from "../question";
  /**
   * An answered (or dismissed) `AskUserQuestion` as it settled in the transcript
   * history — the same `.hitl` anatomy as the live prompt, but read-only: the
   * chosen option carries `.sel`, and any freeform reply shows under the options.
   * Ported from the mock's `#q-card` (.hitl / .lede / .qopts / .kc).
   */
  import type { Message } from "../types";
  import { useLedger } from "./arrivals.svelte";

  let { message }: { message: Message } = $props();

  const input = $derived(
    (message.metadata?.toolInput ?? {}) as Record<string, unknown>
  );
  const questions = $derived<UserQuestion[]>(
    questionsOf(message.metadata?.toolName ?? "", input) ?? []
  );
  const result = $derived(
    message.metadata?.toolUseResult as UserQuestionResult | undefined
  );
  const answered = $derived(result?.outcome === "answered");
  const dismissed = $derived(result?.outcome === "dismissed");
  const answers = $derived<UserAnswers>(
    result?.outcome === "answered" ? result.answers : {}
  );
  const freeform = $derived(
    result?.outcome === "answered" ? result.response : undefined
  );

  const chosen = (question: string): string[] => {
    const value = answers[question];
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  };
  const isSelected = (question: string, label: string): boolean =>
    chosen(question).includes(label);

  /**
   * Answering morphs the card where it stands: the state pill cross-fades to
   * its new word (--dur-control) and the picked option takes its selected
   * look on the same beat. Only when the reader is watching; the card never
   * plays this on its first render.
   */
  const ledger = useLedger();
  function pillSwap(_node: Element) {
    if (!(motionOk.current && ledger?.watched)) {
      return { duration: 0 };
    }
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /** A freeform answer whose text matches no listed option label. */
  const otherText = (q: UserQuestion): string | null => {
    const picks = chosen(q.question);
    const labels = new Set(q.options.map((o) => o.label));
    const other = picks.find((p) => !labels.has(p));
    return other ?? null;
  };
</script>

<section aria-label="Question from the agent" class="hitl">
  <h2>
    <span class="state">
      {#if answered}
        <span class="pill done" in:pillSwap out:pillSwap
          ><IconCheck />answered</span
        >
      {:else if dismissed}
        <span class="pill muted" in:pillSwap out:pillSwap
          ><IconClose />dismissed</span
        >
      {:else}
        <span class="pill attn" in:pillSwap out:pillSwap>needs you</span>
      {/if}
    </span>
    Question from the agent
  </h2>

  {#each questions as q (q.question)}
    <p class="lede">{q.question}</p>
    <div class="qopts">
      {#each q.options as opt, i (opt.label)}
        <span class="opt" class:sel={isSelected(q.question, opt.label)}>
          <span class="kc">{i + 1}</span><span>{opt.label}</span>
        </span>
      {/each}
    </div>
    {#if otherText(q)}
      <p class="answer-free"><span class="lbl">Answered</span>{otherText(q)}</p>
    {/if}
  {/each}

  {#if freeform}
    <p class="answer-free">
      <span class="lbl">In your own words</span>{freeform}
    </p>
  {/if}
</section>

<style>
  .hitl {
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    margin-block-start: var(--space-4);
    margin-inline-start: var(--space-2);
    padding: var(--space-3);
    box-shadow: var(--shadow-hairline, var(--shadow-tile));

    @media (width <= 900px) {
      margin-inline-start: 0;
    }
  }
  h2 {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  /* One cell, so the outgoing pill and the incoming one cross-fade in place. */
  .state {
    display: inline-grid;

    & > :global(*) {
      grid-area: 1 / 1;
    }
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    block-size: 20px;
    padding-block: 0;
    padding-inline: var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    white-space: nowrap;

    & :global(svg) {
      inline-size: 9px;
      block-size: 9px;
      flex: 0 0 auto;
    }
    &.attn {
      background: var(--status-attn-bg);
      color: var(--status-attn-ink);
    }
    &.done {
      background: var(--status-done-bg, var(--surface-recess));
      color: var(--status-done-ink, var(--ink-strong));
    }
    &.muted {
      background: var(--surface-recess);
      color: var(--ink-muted);
    }
  }
  .lede {
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    margin-block-end: var(--space-2);
    max-inline-size: 72ch;
  }
  .qopts {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-block: 2px var(--space-2);
  }
  .kc {
    display: inline-grid;
    place-items: center;
    min-inline-size: 17px;
    block-size: 17px;
    padding-block: 0;
    padding-inline: 4px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
    line-height: 1;
    flex: 0 0 auto;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        color var(--dur-control) var(--ease-out);
    }
  }
  .opt {
    min-block-size: 30px;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font-family: var(--font-body);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    text-align: start;
    max-inline-size: 100%;

    @media (pointer: coarse) {
      min-block-size: 44px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition:
        border-color var(--dur-control) var(--ease-out),
        background-color var(--dur-control) var(--ease-out);
    }
    /* Identical to the live card's `.qopts button.sel` — the settled record
       is the same anatomy as the prompt that produced it, just inert, so what
       the reader picked must look picked and not flagged. --status-attn-*
       stays reserved for "a person is holding this up". */
    &.sel {
      border-color: var(--brand-solid);
      background: var(--surface-recess);
      color: var(--ink-strong);

      & .kc {
        background: var(--brand-solid);
        color: var(--on-brand);
      }
    }
  }
  .answer-free {
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    max-inline-size: 72ch;
    display: flex;
    gap: var(--space-2);
    align-items: baseline;

    & .lbl {
      font-size: var(--text-meta);
      font-weight: var(--weight-strong);
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--ink-muted);
      flex: 0 0 auto;
    }
  }
</style>
