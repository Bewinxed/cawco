<script lang="ts">
  /**
   * A project's board while Caw sets it up (decision page
   * `onboarding-first-minutes`: `draft-where` "As the board it becomes",
   * `asks-where` "On the board on a desk, in his composer on a phone"): his
   * draft drawn as the board it becomes (SetupDraft), and on a desk his open
   * questions standing above its stages, each answered where it stands; on
   * a phone his composer holds them, and the draft bar's Answer Caw opens
   * it. A question is one control wherever it stands: the house ask card
   * (transcript/Prompt) his composer draws, on the board in a raised card of
   * its own, so it reads, answers and says whether work waits on it the same
   * on a desk as on a phone. The project's page and the onboarding bench both
   * draw this, the page from the setup page he writes (setup-draft.svelte.ts),
   * the bench from fixtures.
   */
  import type { PermissionResult } from "@cawco/core/harness";
  import { setupWords } from "@cawco/core/words/onboarding";
  import { tick } from "svelte";
  import {
    type BlockedRequest,
    submitCommand,
  } from "#lib/cawco/client.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import type { SetupDelegate, Stage } from "#lib/cawco/project/setup-stage.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import Prompt from "#lib/cawco/transcript/Prompt.svelte";
  import { IconColumns, IconNeedsYou } from "#lib/icons.js";
  import SetupDraft from "./SetupDraft.svelte";

  let {
    name,
    aim,
    stages,
    delegates,
    proposed,
    ondelegates,
    coming,
    asks,
    cards = [],
    pageHref = null,
    onBoard,
    sending,
    problem,
    stale = false,
    reading = false,
    onaskagain,
    onaim,
    onstages,
    onanswercaw,
    onsetup,
  }: {
    name: string;
    aim: string;
    stages: Stage[];
    delegates: SetupDelegate[];
    /** Every type he proposed, those removed included. */
    proposed?: SetupDelegate[];
    /** Keeps the types by id. */
    ondelegates?: (ids: string[]) => void;
    /** Stages he has still to write. */
    coming: number;
    /** His open questions on the setup, oldest first. */
    asks: BlockedRequest[];
    /** The ids of the setup page's cards beside the draft not picked yet (`area`, `account`, `routines`, `what-moves`, any other). */
    cards?: string[];
    /** The setup page in the project's Decisions at the first of those cards, where they are answered (a link naming no card lands on this board). */
    pageHref?: string | null;
    /** The board draws his questions (a desk); else his composer does. */
    onBoard: boolean;
    sending: boolean;
    /** Why the draft could not be read, kept or sent; null when it was. */
    problem: string | null;
    /** The draft is still being read: it stands as its skeleton. */
    reading?: boolean;
    /** The setup page is one the board can't draw (setup-draft.svelte.ts `stale`). */
    stale?: boolean;
    /** Asks Caw to set the project up again, where the page can't be drawn; none while he can't start. */
    onaskagain?: () => void;
    onaim: (next: string) => void;
    onstages: (next: Stage[]) => void;
    /** The draft bar's Answer Caw where the board holds no questions: his composer. */
    onanswercaw: () => void;
    onsetup: () => void;
  } = $props();

  /** What else the page asks, each card still open: in words where it has its own, the rest counted. */
  const also = $derived(
    cards.flatMap((id) => {
      const part = Object.hasOwn(setupWords.alsoAsks, id)
        ? setupWords.alsoAsks[id as keyof typeof setupWords.alsoAsks]
        : undefined;
      return part ? [part] : [];
    })
  );
  const alsoMore = $derived(
    cards.filter((id) => !Object.hasOwn(setupWords.alsoAsks, id)).length
  );
  const blocks = (one: BlockedRequest): boolean =>
    (one.request.input as { blocks?: unknown }).blocks === true;

  /** An answer to one of his questions on the board, as his composer would send it; hands back its command's id. */
  const answer = (
    asked: BlockedRequest,
    result: PermissionResult
  ): string | null =>
    submitCommand(
      asked.request.instanceId,
      asked.machineId,
      "permission.answer",
      { requestId: asked.request.requestId, result }
    );

  let questions = $state<HTMLElement>();

  /** The first question's options on the board, where its keys go. */
  const firstOptions = (): HTMLElement | null =>
    questions?.querySelector<HTMLElement>(
      '[data-slot="option-group"] [tabindex="0"]'
    ) ?? null;

  /** Answer Caw: on a desk the keys go to the first question on the board; on a phone his composer opens on them. */
  function answerCaw() {
    const first = firstOptions();
    if (onBoard && first) {
      first.focus({ focusVisible: true } as FocusOptions);
      return;
    }
    onanswercaw();
  }

  // A question answered from its card leaves the board: the keys it held go
  // on to the next one standing there, as the composer's next card takes
  // them, so a digit and Enter keep answering.
  let standing = 0;
  $effect(() => {
    const now = asks.length;
    const fewer = now < standing;
    standing = now;
    if (fewer && onBoard && now > 0) {
      tick().then(() => {
        const lost =
          document.activeElement === document.body ||
          document.activeElement === null;
        if (lost) {
          firstOptions()?.focus();
        }
      });
    }
  });
</script>

<div class="flex h-full min-h-0 flex-col gap-space-2">
  <SetupDraft
    {aim}
    asking={asks.length}
    asksInView={onBoard && asks.length > 0}
    {coming}
    {delegates}
    {name}
    {onaim}
    onanswer={answerCaw}
    {ondelegates}
    {onsetup}
    {onstages}
    {proposed}
    {reading}
    questions={(onBoard && asks.length > 0) || (cards.length > 0 && pageHref)
      ? overDraft
      : undefined}
    {sending}
    cardsOpen={cards.length}
    {pageHref}
    {stages}
    waiting={asks.filter(blocks).length}
  />
  {#if problem}
    <RowFault reason={problem} />
  {:else if stale}
    <RowFault
      again={onaskagain}
      againIcon={IconColumns}
      againLabel={setupWords.askSetup}
      reason={setupWords.pageUnread}
    />
  {/if}
</div>

<!-- Over the draft's stages: what else his page asks (the bar's Open the
     setup page is the way to it), then on a desk his questions. -->
{#snippet overDraft()}
  {#if cards.length > 0 && pageHref}
    <!-- They wait on the person: the Needs-you mark before the words
         (JOURNEY.md, Needs you is a mark), hung in the gutter so the words
         start on the draft's one text edge (the bar's, the aim's: a field's
         text, `space-3` in), the mark centred on the first line however the
         words wrap. -->
    <!-- mark-line: the mark hangs on the first line's box, outside the run of words. -->
    <p
      class="relative m-0 max-w-c-measure ps-space-3 type-body text-ink-muted"
      data-slot="setup-also"
      style:--hang="calc(100% - var(--space-3) + var(--space-2))"
    >
      <span
        aria-hidden="true"
        class="absolute end-(--hang) top-0 grid h-lh place-items-center"
        ><IconNeedsYou class="size-icon-md text-status-attn-glyph" /></span
      >
      <span>{setupWords.alsoOnPage(also, alsoMore)}</span>
    </p>
  {/if}
  {#if onBoard && asks.length > 0}
    {@render boardAsks()}
  {/if}
{/snippet}

<!-- His questions on the board, above the draft's stages, each answered
     where it stands, in the card his composer draws: its line says whether
     work waits on it. -->
{#snippet boardAsks()}
  <section
    bind:this={questions}
    aria-label={setupWords.questions}
    class="flex w-full flex-col gap-space-3"
    data-slot="setup-asks"
    {@attach reflow()}
  >
    {#each asks as ask (ask.request.requestId)}
      <div
        class="rounded-lg bg-surface-raised shadow-overlay"
        data-flip
        data-slot="setup-ask"
      >
        <Prompt
          asker="Caw"
          onanswer={(result) => answer(ask, result)}
          request={ask.request}
          shown
        />
      </div>
    {/each}
  </section>
{/snippet}
