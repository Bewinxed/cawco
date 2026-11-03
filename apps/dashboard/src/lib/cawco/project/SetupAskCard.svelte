<script lang="ts">
  /**
   * DESIGN BENCH (decision page `onboarding-design`, cards `the-wait` and
   * `setup-form`, option `asks`): one question Caw asks while he drafts a
   * project's setup, as it floats on the project's page. It is the `ask`
   * tool's `question` (core asks.ts): its stance line says whether his work
   * waits on it ("Blocks work · … is paused until you answer", with the
   * Needs-you mark) or goes on with his assumption ("Work goes on · …").
   * The option chips are the kit's; the one he recommends wears the badge.
   * Answered, the chip is the record of the pick; an answer that changes
   * what he drafted says what he is redoing, with the live dot.
   */
  import { askStanceLine } from "@cawco/core/asks";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import type { SetupAsk } from "./pr-team.fixtures";

  let {
    ask,
    count,
  }: {
    ask: SetupAsk;
    /** Where it stands among the open ones, on a phone ("1 of 3"). */
    count?: { at: number; of: number };
  } = $props();

  const answered = $derived(ask.answered !== undefined);
</script>

<article
  data-slot="setup-ask"
  class="flex w-full flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 shadow-overlay"
  data-blocks={ask.blocks || undefined}
>
  <div
    class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
  >
    <h3 class="m-0 min-w-0 flex-auto type-label text-ink-strong">
      {ask.question}
    </h3>
    {#if count}
      <span class="type-meta num text-ink-muted">{count.at} of {count.of}</span>
    {/if}
  </div>
  {#if ask.redoing}
    <span
      class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
      ><LiveDot /><span>{ask.redoing}</span></span
    >
  {:else if !answered}
    <span
      class={[
        "mark-line flex items-center gap-space-2 type-meta",
        ask.blocks ? "text-status-attn-ink" : "text-ink-muted",
      ]}
    >
      {#if ask.blocks}
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
      {/if}
      <span>{askStanceLine(ask)}</span>
    </span>
  {/if}
  <fieldset class={chipsVariants({ class: "m-0 min-w-0 border-0 p-0" })}>
    <legend class="sr-only">{ask.question}</legend>
    {#each ask.options as option (option.label)}
      <button
        class={chipVariants()}
        aria-pressed={ask.answered === option.label}
        type="button"
      >
        <span>{option.label}</span>
        {#if option.recommended && !answered}
          <Badge data-box><span>Recommended</span></Badge>
        {/if}
      </button>
    {/each}
  </fieldset>
</article>
