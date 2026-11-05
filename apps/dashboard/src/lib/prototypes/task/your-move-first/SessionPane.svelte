<script lang="ts">
  /**
   * The session opened from the task: beside it from 900 up, in its place
   * with Back below. Its head is the session's name and its state's glyph
   * and word, Close (or Back) as a bare symbol; its body is the transcript,
   * here its last turn as the session wrote it. While the transcript is
   * read its skeleton stands at the turn's size; a session that stopped
   * answering says so with Try again, and the task beside stays as it was.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { mergeProps } from "bits-ui";
  import { reveal } from "#lib/cawco/motion/curves.svelte.js";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconArrowLeft, IconClose, IconPause } from "#lib/icons.js";
  import type { SessionRef } from "./fixtures/types";
  import { when } from "./when";

  let {
    session,
    said,
    at,
    now,
    load = "live",
    inPlace = false,
    onclose,
    onretry,
  }: {
    session: SessionRef;
    /** Its last turn, as the session wrote it. */
    said: string;
    at: number;
    now: number;
    load?: "loading" | "error" | "live";
    /** Opened in the task's place (below 900): Back, not Close. */
    inPlace?: boolean;
    onclose: () => void;
    onretry: () => void;
  } = $props();

  const closeLabel = $derived(
    inPlace ? words.head.back : words.head.closeSession
  );
  const STATE_WORD: Record<SessionRef["state"], string> = {
    working: words.session.state.working,
    asking: words.session.state.asking,
    idle: words.session.state.idle,
    ended: words.session.state.idle,
  };
  const stateWord = $derived(STATE_WORD[session.state]);
</script>

{#snippet close(back: boolean)}
  <BarGlass form="group">
    <Tip label={closeLabel}>
      {#snippet children(tip)}
        <button
          data-bar-item
          aria-label={closeLabel}
          class="select-none touch-hit press-tint"
          type="button"
          {...mergeProps(tip, { onclick: onclose })}
        >
          {#if back}
            <IconArrowLeft aria-hidden="true" data-slot="bar-symbol" />
          {:else}
            <IconClose aria-hidden="true" data-slot="bar-symbol" />
          {/if}
        </button>
      {/snippet}
    </Tip>
  </BarGlass>
{/snippet}

<section
  aria-label={session.title}
  class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-4"
  data-slot="session-pane"
>
  <header class="flex h-c-top-bar-h min-w-0 items-center gap-space-3">
    {#if inPlace}
      {@render close(true)}
    {/if}
    <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
      {#if session.state === "working"}
        <LiveDot />
      {:else}
        <IconPause
          aria-hidden="true"
          class="size-icon-md flex-none text-ink-muted"
        />
      {/if}
      <h2
        class="m-0 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-row text-ink-strong"
      >
        {session.title}
      </h2>
      <span class="flex-none type-meta text-ink-muted">{stateWord}</span>
    </div>
    {#if !inPlace}
      {@render close(false)}
    {/if}
  </header>

  <div
    class="flex min-h-0 flex-col gap-space-3 overflow-y-auto rounded-lg bg-surface-raised px-space-5 py-space-5 shadow-tile max-phone:px-space-4"
  >
    {#if load === "loading"}
      <div aria-busy="true" class="flex flex-col gap-space-2" role="status">
        <span class="sr-only">{words.session.loading}</span>
        <Skeleton line="meta" width="label" />
        <Skeleton height="view" />
        <Skeleton height="block" />
      </div>
    {:else if load === "error"}
      <div class="flex flex-col gap-space-3" role="alert">
        <p class="m-0 type-body text-ink-strong text-pretty">
          {words.session.stoppedAnswering(session.title)}
        </p>
        <div>
          <Button
            hit="always"
            label={words.session.tryAgain}
            size="sm"
            variant="outline"
            onclick={onretry}
          />
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-space-2" in:reveal>
        <time
          class="num type-meta text-ink-muted"
          datetime={new Date(at).toISOString()}>{when(at, now)}</time
        >
        <p
          class="m-0 max-w-c-measure whitespace-pre-wrap type-body text-ink-strong wrap-anywhere"
        >
          {said}
        </p>
      </div>
    {/if}
  </div>
</section>
