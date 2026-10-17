<script lang="ts">
  import type {
    UserAnswers,
    UserQuestion,
    UserQuestionResult,
  } from "@cawco/core";
  import { QUESTION_UNSHOWN, questionsOf } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    CURVE,
    crossIn,
    dur,
    easeOut,
    lifting,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { fold } from "#lib/cawco/motion/fold.svelte.js";
  import { depart, land } from "#lib/cawco/motion/share.svelte.js";
  import { IconAsk, IconCheck, IconClose } from "#lib/icons.js";
  /**
   * An answered (or dismissed) `AskUserQuestion` as it settled in the transcript
   * history — the same `.hitl` anatomy as the live prompt, but read-only: the
   * chosen option carries `.sel`, and any freeform reply shows under the options.
   * Ported from the mock's `#q-card` (.hitl / .lede / .qopts; chips are the kit option chip).
   */
  import { CLI_REJECTED } from "../question";
  import type { Message } from "../types";
  import { useLedger } from "./arrivals.svelte";

  let {
    message,
    asker = "the agent",
  }: {
    message: Message;
    /** Who asked, as the conversation names its agent ("Caw" in a thread). */
    asker?: string;
  } = $props();

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
  /**
   * The call failed before anyone was asked (the tool refused its input):
   * nothing waits on the reader, so the card says so instead of "needs you".
   */
  const failed = $derived(
    !(answered || dismissed) && message.metadata?.toolStatus === "error"
  );
  /**
   * It was asked, and taken back before it was answered: the turn interrupted
   * while it waited, or the hub could not show it anyone (its denial begins
   * {@link QUESTION_UNSHOWN}). The line "Question withdrawn" says so in the
   * transcript, and the card says the same.
   */
  const withdrawn = $derived(
    failed &&
      typeof message.metadata?.toolResult === "string" &&
      (message.metadata.toolResult.startsWith(CLI_REJECTED) ||
        message.metadata.toolResult.startsWith(QUESTION_UNSHOWN))
  );
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
  /**
   * SETTLING. Answered, the card becomes its summary: each option picked is
   * the one chip left, and the options not picked go. The picked chip travels
   * from where it stood among the options to its place in the summary
   * (`share`, --dur-pop on the drawer curve); the others fade where they
   * stood (--dur-control), out of the flow from the start, so nothing else
   * waits on them. Dismissed, every option fades and their row folds shut
   * toward the question (--dur-exit). Only a card that settles while it is
   * drawn plays this; one that is drawn settled is simply its summary.
   */
  const settled = $derived(answered || dismissed);
  const card = $derived(String(message.toolCallId ?? message.id));
  const shareKey = (question: string, label: string): string =>
    `question:${card}:${question}:${label}`;
  let section = $state<HTMLElement>();
  /** Where each option stood as the card settled, in its row. */
  const stood = new WeakMap<
    Element,
    { top: number; left: number; width: number }
  >();
  /** Each options row's height as the card settled, by its question. */
  const rowHeights = new Map<string, number>();
  /** Every options row's height and every option's place, as the card settles. */
  function measure(root: HTMLElement): void {
    for (const row of root.querySelectorAll<HTMLElement>(
      '[data-slot="qopts"]'
    )) {
      rowHeights.set(row.dataset.question ?? "", row.offsetHeight);
      for (const option of row.querySelectorAll<HTMLElement>(".kit-chip")) {
        stood.set(option, {
          top: option.offsetTop,
          left: option.offsetLeft,
          width: option.offsetWidth,
        });
      }
    }
  }
  /** The picked options leave for the answer that replaces the card. */
  function departChosen(root: HTMLElement): void {
    for (const q of questions) {
      for (const label of chosen(q.question)) {
        const option = root.querySelector<HTMLElement>(
          `.kit-chip[data-key="${CSS.escape(shareKey(q.question, label))}"]`
        );
        if (option) {
          option.dataset.share = shareKey(q.question, label);
          depart(option);
        }
      }
    }
  }
  let wasSettled = untrack(() => settled);
  $effect.pre(() => {
    const now = settled;
    const root = section;
    if (now && !wasSettled && root) {
      untrack(() => {
        measure(root);
        departChosen(root);
      });
    }
    wasSettled = now;
  });
  /** A row's height from what it was to what it is now; shut when nothing is left in it. */
  function settleRow(row: HTMLElement, question: string): void {
    const was = rowHeights.get(question);
    rowHeights.delete(question);
    if (was === undefined || !motionOk.current) {
      return;
    }
    fold(row, !dismissed, { ms: dur("--dur-exit"), easing: CURVE.out }, was);
  }
  /** An option not picked fades where it stood, out of the flow. */
  function leave(node: HTMLElement) {
    return lifting(
      node,
      (): Record<string, string> => {
        const at = stood.get(node);
        return at
          ? {
              position: "absolute",
              top: `${at.top}px`,
              left: `${at.left}px`,
              width: `${at.width}px`,
              "pointer-events": "none",
            }
          : {};
      },
      {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      }
    );
  }
  $effect(() => {
    if (!settled) {
      return;
    }
    untrack(() => {
      for (const row of section?.querySelectorAll<HTMLElement>(
        '[data-slot="qopts"]'
      ) ?? []) {
        settleRow(row, row.dataset.question ?? "");
      }
    });
  });

  /** A freeform answer whose text matches no listed option label. */
  const otherText = (q: UserQuestion): string | null => {
    const picks = chosen(q.question);
    const labels = new Set(q.options.map((o) => o.label));
    const other = picks.find((p) => !labels.has(p));
    return other ?? null;
  };
</script>

<!-- `data-frame`: the card's surface is its frame, opened before what is
     on it (Row's arrival). The surface starts on the rail's edge; inside
     it, the content starts on the glyph column, so the head and everything
     under it sit on the same columns as every rail row around the card. -->
<section
  data-slot="hitl"
  aria-label="Question from {asker}"
  class="mt-space-4 ms-(--x-rail) py-space-3 pe-space-3 ps-(--hitl-start) border border-border-control rounded-lg bg-surface-raised shadow-hairline"
  data-frame
  bind:this={section}
  style:--hitl-start="calc(var(--x-glyph) - var(--x-rail) - 1px)"
>
  <!-- The card's head is a rail line: its state's mark in the glyph cell,
       the title at the text column, the state in words after it. Each
       state cell is one grid cell, so the outgoing mark or word and the
       incoming one cross-fade in place. -->
  <h2
    class="rail-line text-size-label font-medium text-ink-strong mb-space-2"
  >
    <span data-slot="rail-cell" class="rail-cell inline-grid">
      {#if answered}
        <span
          data-slot="mark"
          data-question-card-done
          class="col-start-1 row-start-1 grid place-items-center text-status-done-ink"
          in:pillSwap
          out:pillSwap><IconCheck class="size-(--w-glyph)" /></span
        >
      {:else if dismissed || failed}
        <span
          data-slot="mark"
          class="col-start-1 row-start-1 grid place-items-center text-ink-muted"
          in:pillSwap
          out:pillSwap><IconClose class="size-(--w-glyph)" /></span
        >
      {:else}
        <span
          data-slot="mark"
          class="col-start-1 row-start-1 grid place-items-center text-status-attn-ink"
          in:pillSwap
          out:pillSwap><IconAsk class="size-(--w-glyph)" /></span
        >
      {/if}
    </span>
    <span>Question from {asker}</span>
    <span class="inline-grid" data-box>
      {#if answered}
        <span
          data-slot="done"
          class="mark-line col-start-1 row-start-1 inline-flex items-center h-icon-lg py-0 px-space-2 rounded-pill text-size-label font-medium whitespace-nowrap bg-status-done-bg text-status-done-ink"
          in:pillSwap
          out:pillSwap><span>answered</span></span
        >
      {:else if dismissed}
        <span
          class="mark-line col-start-1 row-start-1 inline-flex items-center h-icon-lg py-0 px-space-2 rounded-pill text-size-label font-medium whitespace-nowrap bg-surface-recess text-ink-muted"
          in:pillSwap
          out:pillSwap><span>dismissed</span></span
        >
      {:else if withdrawn}
        <span
          class="mark-line col-start-1 row-start-1 inline-flex items-center h-icon-lg py-0 px-space-2 rounded-pill text-size-label font-medium whitespace-nowrap bg-surface-recess text-ink-muted"
          in:pillSwap
          out:pillSwap><span>withdrawn</span></span
        >
      {:else if failed}
        <span
          class="mark-line col-start-1 row-start-1 inline-flex items-center h-icon-lg py-0 px-space-2 rounded-pill text-size-label font-medium whitespace-nowrap bg-surface-recess text-ink-muted"
          in:pillSwap
          out:pillSwap><span>not asked</span></span
        >
      {:else}
        <span
          class="mark-line col-start-1 row-start-1 inline-flex items-center h-icon-lg py-0 px-space-2 rounded-pill text-size-label font-medium whitespace-nowrap bg-status-attn-bg text-status-attn-ink"
          in:pillSwap
          out:pillSwap><span>needs you</span></span
        >
      {/if}
    </span>
  </h2>

  {#each questions as q (q.question)}
    <!-- literal: 72ch -->
    <p
      data-slot="lede"
      class="rail-hang text-size-body font-normal leading-body text-ink-strong mb-space-2 max-w-(--measure)"
      style:--measure="72ch">{q.question}</p>
    <!-- The settled record is the live card's anatomy, inert: the same kit
         option chips (.kit-chips / .kit-chip / .kit-keycap in app.css), so a
         pick looks picked, not flagged, and the card settles without a jump. -->
    <div
      data-slot="qopts"
      class="kit-chips rail-hang relative mt-space-row mb-space-2"
      data-question={q.question}
    >
      {#each settled ? [] : q.options as opt, i (opt.label)}
        <span
          class="kit-chip"
          data-key={shareKey(q.question, opt.label)}
          out:leave
        >
          <span class="kit-keycap">{i + 1}</span><span>{opt.label}</span>
        </span>
      {/each}
      {#if answered}
        {#each q.options.filter( (opt) => isSelected(q.question, opt.label) ) as opt (opt.label)}
          <span
            data-slot="sel"
            class="kit-chip sel"
            {@attach land(() => shareKey(q.question, opt.label), {
              ms: dur("--dur-pop"),
            })}
          >
            <span class="kit-keycap">{q.options.indexOf(opt) + 1}</span><span
              >{opt.label}</span
            >
          </span>
        {/each}
      {/if}
    </div>
    {#if otherText(q)}
      <!-- literal: 72ch -->
      <p
        class="rail-hang text-size-body font-normal leading-body text-ink-strong max-w-(--measure) flex gap-space-2 items-baseline"
        in:crossIn
        style:--measure="72ch"
      >
        <span
          class="text-size-label font-medium uppercase tracking-caps text-ink-muted flex-none"
          >Answered</span
        >{otherText(q)}
      </p>
    {/if}
  {/each}

  {#if freeform}
    <!-- literal: 72ch -->
    <p
      class="rail-hang text-size-body font-normal leading-body text-ink-strong max-w-(--measure) flex gap-space-2 items-baseline"
      in:crossIn
      style:--measure="72ch"
    >
      <span
        class="text-size-label font-medium uppercase tracking-caps text-ink-muted flex-none"
        >In your own words</span
      >{freeform}
    </p>
  {/if}
</section>
