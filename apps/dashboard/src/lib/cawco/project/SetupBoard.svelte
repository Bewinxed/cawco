<script lang="ts">
  /**
   * A project's board while Caw sets it up (decision page
   * `onboarding-first-minutes`: `draft-where` "As the board it becomes",
   * `asks-where` "On the board on a desk, in his composer on a phone"): his
   * draft drawn as the board it becomes (SetupDraft), and on a desk his open
   * questions standing above its stages, each answered where it stands
   * (SetupAskCard); on a phone his composer holds them, and the draft bar's
   * Answer Caw opens it. The project's page and the onboarding bench both
   * draw this, the page from the setup page he writes (setup-draft.svelte.ts),
   * the bench from fixtures.
   */
  import { setupWords } from "@cawco/core/words/onboarding";
  import {
    type BlockedRequest,
    submitCommand,
  } from "#lib/cawco/client.svelte.js";
  import type {
    SetupDelegate,
    Stage,
  } from "#lib/cawco/decisions/host/setup/stage.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import type { questionAnswer } from "#lib/cawco/question.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import SetupAskCard from "./SetupAskCard.svelte";
  import SetupDraft from "./SetupDraft.svelte";

  let {
    name,
    aim,
    stages,
    delegates,
    coming,
    asks,
    cards = [],
    pageHref = null,
    onBoard,
    sending,
    problem,
    onaim,
    onstages,
    onanswercaw,
    onsetup,
  }: {
    name: string;
    aim: string;
    stages: Stage[];
    delegates: SetupDelegate[];
    /** Stages he has still to write. */
    coming: number;
    /** His open questions on the setup, oldest first. */
    asks: BlockedRequest[];
    /** The ids of the setup page's cards beside the draft (`place`, `routines`, `what-moves`). */
    cards?: string[];
    /** The setup page in the project's Decisions, where those cards are answered. */
    pageHref?: string | null;
    /** The board draws his questions (a desk); else his composer does. */
    onBoard: boolean;
    sending: boolean;
    /** Why the draft could not be read, kept or sent; null when it was. */
    problem: string | null;
    onaim: (next: string) => void;
    onstages: (next: Stage[]) => void;
    /** The draft bar's Answer Caw where the board holds no questions: his composer. */
    onanswercaw: () => void;
    onsetup: () => void;
  } = $props();

  /** What else the page asks, each in words; a card with no words of its own is left to the page. */
  const also = $derived(
    cards.flatMap((id) => {
      const part = setupWords.alsoAsks[id];
      return part ? [part] : [];
    })
  );
  const blocks = (one: BlockedRequest): boolean =>
    (one.request.input as { blocks?: unknown }).blocks === true;

  /** An answer to one of his questions on the board, as his composer would send it; hands back its command's id. */
  const answer = (
    asked: BlockedRequest,
    result: ReturnType<typeof questionAnswer>
  ): string | null =>
    submitCommand(
      asked.request.instanceId,
      asked.machineId,
      "permission.answer",
      { requestId: asked.request.requestId, result }
    );

  let questions = $state<HTMLElement>();

  /** Answer Caw: on a desk the keys go to the first question on the board; on a phone his composer opens on them. */
  function answerCaw() {
    const first = questions?.querySelector<HTMLElement>("button");
    if (onBoard && first) {
      first.focus({ focusVisible: true } as FocusOptions);
      return;
    }
    onanswercaw();
  }
</script>

<div class="flex h-full min-h-0 flex-col gap-space-2">
  <SetupDraft
    {aim}
    asking={asks.length}
    {coming}
    {delegates}
    {name}
    {onaim}
    onanswer={answerCaw}
    {onsetup}
    {onstages}
    questions={(onBoard && asks.length > 0) || (also.length > 0 && pageHref)
      ? overDraft
      : undefined}
    {sending}
    {stages}
    waiting={asks.filter(blocks).length}
  />
  {#if problem}
    <RowFault reason={problem} />
  {/if}
</div>

<!-- Over the draft's stages: what else his page asks, with the way to it,
     then on a desk his questions. -->
{#snippet overDraft()}
  {#if also.length > 0 && pageHref}
    <p
      class="mark-line m-0 flex max-w-c-measure flex-wrap items-center gap-x-space-3 gap-y-space-1 type-body text-ink-muted"
      data-slot="setup-also"
    >
      <span>{setupWords.alsoOnPage(also)}</span>
      <a class={buttonVariants({ variant: "link", size: "sm" })} href={pageHref}
        >{setupWords.openPage}</a
      >
    </p>
  {/if}
  {#if onBoard && asks.length > 0}
    {@render boardAsks()}
  {/if}
{/snippet}

<!-- His questions on the board, above the draft's stages, each answered
     where it stands: one that holds him says what waits on it. -->
{#snippet boardAsks()}
  <section
    bind:this={questions}
    aria-label={setupWords.questions}
    class="flex w-full max-w-c-measure flex-col gap-space-3"
    data-slot="setup-asks"
    {@attach reflow()}
  >
    {#each asks as ask (ask.request.requestId)}
      <div data-flip>
        <SetupAskCard
          onanswer={(result) => answer(ask, result)}
          request={ask.request}
        />
      </div>
    {/each}
  </section>
{/snippet}
