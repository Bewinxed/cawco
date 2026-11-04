<script lang="ts">
  /**
   * A project's board before it is set up (decision page
   * `onboarding-design`, cards `board-before`, option `scene`, and
   * `setup-form`, option `asks`): a calm scene as big as the board, in
   * place of the stand-in stages the board used to draw.
   *
   * - **Its middle** says one thing at a time, on the board's axis. While
   *   Caw has questions open on his setup, they are the middle: each his
   *   ask as the hub holds it (SetupAskCard), floating in as it comes and
   *   leaving as it is answered (The Nothing Jumps Rule). With none open,
   *   the claim: "Not set up yet", its line, and the board's one action
   *   (The Empty Starts Work Rule): the setup page once it is there; held,
   *   with why, while he drafts it; "Set it up with Caw" when no setup is
   *   under way. The claim never stands under the questions: the empty
   *   board already says nothing is set up.
   * - **Its live Caw** (`seat`, CawSeat at 80) stands over the middle while
   *   he is here; while he drafts in his panel (`lead.inPanel`) the seat
   *   shows the folder glyph instead (CawSeat `standIn`). With no seat (no
   *   machine for him), the folder glyph alone.
   *
   * On a phone his sheet stands over the board, and his questions are his
   * composer's there (one at a time, "1 of 3"); the scene keeps the claim.
   */
  import { setupWords } from "@cawco/core/words/onboarding";
  import type { Snippet } from "svelte";
  import type { BlockedRequest } from "#lib/cawco/client.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import type { questionAnswer } from "#lib/cawco/question.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconFolder } from "#lib/icons.js";
  import SetupAskCard from "./SetupAskCard.svelte";

  type Action =
    | { kind: "page"; open: () => void }
    | { kind: "drafting" }
    | { kind: "ask"; ask: () => void }
    | { kind: "none" };

  let {
    asks,
    onanswer,
    act,
    seat,
  }: {
    /** His questions open on the setup, oldest first; on a phone, none (his composer has them). */
    asks: BlockedRequest[];
    /** Answers one as his composer would; hands back its command's id, or null when it could not go. */
    onanswer: (
      ask: BlockedRequest,
      result: ReturnType<typeof questionAnswer>
    ) => string | null;
    /** The board's one action, as the setup stands. */
    act: Action;
    /** His live seat over the middle; none while his panel holds him. */
    seat?: Snippet;
  } = $props();
</script>

<!-- The claim's one action, as the setup stands. -->
{#snippet doing()}
  <div class="flex flex-col items-center gap-space-1">
    {#if act.kind === "page"}
      <Button
        label={setupWords.openPage}
        onclick={act.open}
        variant="outline"
      />
    {:else if act.kind === "drafting"}
      <span class="type-meta text-ink-muted">{setupWords.drafting}</span>
      <Button disabled label={setupWords.openPage} variant="outline" />
    {:else if act.kind === "ask"}
      <Button label={setupWords.askSetup} onclick={act.ask} variant="outline" />
    {/if}
  </div>
{/snippet}

<div
  data-slot="setup-scene"
  class="relative isolate flex h-full min-h-0 w-full flex-auto flex-col items-center"
>
  <div
    class="flex w-full flex-auto flex-col items-center justify-center gap-space-4 px-space-5 pt-space-6 pb-space-4"
  >
    {#if seat && asks.length > 0}
      <div class="grid justify-items-center">{@render seat()}</div>
    {/if}
    {#if asks.length > 0}
      <section
        aria-label={setupWords.questions}
        class="flex w-full max-w-c-measure flex-col gap-space-3"
        {@attach reflow()}
      >
        {#each asks as ask (ask.request.requestId)}
          <div data-flip>
            <SetupAskCard
              onanswer={(result) => onanswer(ask, result)}
              request={ask.request}
            />
          </div>
        {/each}
      </section>
    {:else}
      <div class="w-full max-w-c-measure">
        {#if seat}
          <EmptyState
            actionWidth="fill"
            axis
            line={setupWords.notSetUpLine}
            title={setupWords.notSetUp}
          >
            {#snippet mark()}
              <div class="mb-space-3 grid justify-items-center">
                {@render seat()}
              </div>
            {/snippet}
            {#snippet action()}
              {@render doing()}
            {/snippet}
          </EmptyState>
        {:else}
          <EmptyState
            actionWidth="fill"
            axis
            icon={IconFolder}
            line={setupWords.notSetUpLine}
            title={setupWords.notSetUp}
          >
            {#snippet action()}
              {@render doing()}
            {/snippet}
          </EmptyState>
        {/if}
      </div>
    {/if}
  </div>
</div>
