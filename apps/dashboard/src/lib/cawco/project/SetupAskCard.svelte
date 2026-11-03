<script lang="ts">
  /**
   * One question Caw asked while he sets a project up (his `ask` call, hub
   * asks.ts), as it floats on the project's board before setup (decision
   * page `onboarding-design`, card `setup-form`, option `asks`). It is the
   * ask the hub holds for his conversation, the one his composer would grow
   * into: its stance line says whether his work waits on it ("Blocks work ·
   * … is paused until you answer", with the Needs-you mark) or goes on with
   * what he assumes ("Work goes on · …"). Its options are the kit's chips;
   * Other opens a line for an answer in the person's own words. A pick
   * answers it as the composer's card would (`questionAnswer`); the card
   * says it is answering until the hub takes the ask away, and a refusal
   * stays under it with the chips to try again.
   */
  import { askStanceLine } from "@cawco/core/asks";
  import type { UserAnswers } from "@cawco/core/harness";
  import { questionsOf } from "@cawco/core/question";
  import { setupWords } from "@cawco/core/words/onboarding";
  import {
    commandRecord,
    type PendingPermission,
  } from "#lib/cawco/client.svelte.js";
  import { questionAnswer } from "#lib/cawco/question.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";

  let {
    request,
    onanswer,
    count,
  }: {
    request: PendingPermission;
    /** Sends the answer; hands back the command it went out as, or null when it could not go. */
    onanswer: (result: ReturnType<typeof questionAnswer>) => string | null;
    /** Where it stands among the open ones, on a phone ("1 of 3"). */
    count?: { at: number; of: number };
  } = $props();

  const id = $props.id();
  const questions = $derived(
    questionsOf(request.toolName, request.input) ?? []
  );
  const stance = $derived(
    request.input as {
      blocks?: unknown;
      meanwhile?: unknown;
      waiting?: unknown;
    }
  );
  const blocks = $derived(stance.blocks === true);
  const stanceLine = $derived(
    askStanceLine({
      blocks,
      meanwhile: typeof stance.meanwhile === "string" ? stance.meanwhile : "",
      waiting: typeof stance.waiting === "string" ? stance.waiting : "",
    })
  );

  /** What is picked, by question: an option's label, or the person's own words. */
  let picked = $state<UserAnswers>({});
  /** The questions whose answer is their own words, its line open. */
  let other = $state<Record<string, string>>({});
  let commandId = $state<string | null>(null);
  const sending = $derived(
    commandId !== null && commandRecord(commandId)?.stage !== "failed"
  );
  const failed = $derived.by(() => {
    const record = commandId === null ? null : commandRecord(commandId);
    return record?.stage === "failed" ? (record.reason ?? null) : null;
  });

  const answeredAll = (next: UserAnswers): boolean =>
    questions.every((question) => {
      const value = next[question.question];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });

  function send(next: UserAnswers): void {
    if (!answeredAll(next)) {
      return;
    }
    commandId = onanswer(questionAnswer(request.input, next));
  }

  /** A chip pressed: one pick answers a single-pick question; a multiple pick toggles. */
  function choose(question: string, label: string, many: boolean): void {
    const { [question]: _, ...rest } = other;
    other = rest;
    if (many) {
      const now = picked[question];
      const list = Array.isArray(now) ? now : [];
      picked = {
        ...picked,
        [question]: list.includes(label)
          ? list.filter((one) => one !== label)
          : [...list, label],
      };
      return;
    }
    picked = { ...picked, [question]: label };
    send(picked);
  }

  const isPicked = (question: string, label: string): boolean => {
    const now = picked[question];
    return Array.isArray(now) ? now.includes(label) : now === label;
  };
  const multiple = $derived(questions.some((question) => question.multiSelect));
  const owns = $derived(Object.keys(other).length > 0);
</script>

<article
  aria-labelledby="{id}-q0"
  data-slot="setup-ask"
  class="flex w-full flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-overlay"
  data-blocks={blocks || undefined}
>
  <!-- mark-line: the Needs-you dot leads its stance words as one pair. -->
  <span
    class={[
      "mark-line flex items-center gap-space-2 type-meta",
      blocks ? "text-status-attn-ink" : "text-ink-muted",
    ]}
  >
    {#if sending}
      <LiveDot /><span>{setupWords.answering}</span>
    {:else}
      {#if blocks}
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
      {/if}
      <span class="min-w-0 wrap-anywhere">{stanceLine}</span>
    {/if}
    {#if count}
      <span class="ms-auto type-meta num text-ink-muted"
        >{setupWords.questionAt(count.at, count.of)}</span
      >
    {/if}
  </span>
  {#each questions as question, qi (question.question)}
    <fieldset
      class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0"
      disabled={sending}
    >
      <legend
        id="{id}-q{qi}"
        class="mb-space-2 p-0 type-label text-ink-strong wrap-anywhere"
        >{question.question}</legend
      >
      <div class={chipsVariants()}>
        {#each question.options as option (option.label)}
          <button
            class={chipVariants()}
            aria-pressed={isPicked(question.question, option.label)}
            onclick={() =>
              choose(question.question, option.label, question.multiSelect)}
            title={option.description || undefined}
            type="button"
          >
            <span class="wrap-anywhere">{option.label}</span>
          </button>
        {/each}
        <button
          class={chipVariants()}
          aria-pressed={question.question in other}
          onclick={() => {
            other = { ...other, [question.question]: "" };
          }}
          type="button"><span>Other</span></button
        >
      </div>
      {#if question.question in other}
        <Input
          aria-label="Your answer to: {question.question}"
          oninput={(event: Event) => {
            const text = (event.currentTarget as HTMLInputElement).value;
            other = { ...other, [question.question]: text };
            picked = { ...picked, [question.question]: text.trim() };
          }}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              send(picked);
            }
          }}
          value={other[question.question]}
        />
      {/if}
    </fieldset>
  {/each}
  {#if multiple || owns}
    <div class="flex justify-end" data-box>
      <Button
        disabled={!answeredAll(picked)}
        label="Answer"
        onclick={() => send(picked)}
        pending={sending}
        pendingLabel={setupWords.answering}
        size="sm"
      />
    </div>
  {/if}
  <RowFault again={() => send(picked)} reason={failed ?? null} />
</article>
