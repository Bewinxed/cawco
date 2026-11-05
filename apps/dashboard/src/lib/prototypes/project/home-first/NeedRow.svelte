<script lang="ts">
  /**
   * One thing that waits on the person, answered where it stands (TOM
   * task 2). The thing it belongs to leads; under it its kind, where it
   * came from and how long it has waited; then what exactly it asks, the
   * call or command set as code. Its answers stand in a column at the
   * row's trailing edge once the row has the room (under its words on a
   * phone): Approve and Deny (or Decline) as peers at that column's two
   * ends, drawn as the transcript's prompt draws them (DESIGN.md, The Peer
   * Rule), and under them Not now, the same place in every row, which
   * keeps the row answerable at the list's foot.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Need } from "./model";
  import StateMark from "./StateMark.svelte";

  let {
    need,
    stale = false,
    onanswer,
  }: {
    need: Need;
    /** The hub is not live: the row stays, its answers wait. */
    stale?: boolean;
    /** An answer pressed: the need and the answer's word. */
    onanswer?: (need: Need, answer: string) => void;
  } = $props();

  const kindWord = $derived(
    need.kind === "review"
      ? words.needs.kind.review(need.stage ?? "")
      : words.needs.kind[need.kind]
  );
  const answer = (word: string) => () => onanswer?.(need, word);
  const denyWord = $derived(
    need.kind === "action" ? words.needs.decline : words.needs.deny
  );
  const peers = $derived(need.kind === "action" || need.kind === "ask");
</script>

<!-- mark-line: the kind's glyph stands beside the title's line only; the lines under it start on the text column. -->
<li
  class="@container/need flex items-start gap-space-3 border-b border-b-border-hairline py-space-4 ps-space-3 pe-space-4 last:border-b-0"
  data-flip
  data-need={need.kind}
>
  <StateMark label={kindWord} line mark={`need-${need.kind}`} />
  <div
    class="flex min-w-0 flex-1 flex-col gap-space-3 @min-home-need-row/need:flex-row @min-home-need-row/need:items-start @min-home-need-row/need:gap-space-6"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-space-row">
      <p class="m-0 type-label text-ink-row text-pretty">{need.title}</p>
      <p
        class="mark-line m-0 flex min-w-0 flex-wrap items-center gap-x-space-2 type-meta text-ink-muted"
      >
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
        <span class="text-status-attn-ink">{kindWord}</span>
        {#if need.from}
          <span>· {words.needs.from(need.from)}</span>
        {/if}
        <span class="tabular-nums">· {need.waited}</span>
        {#if stale}
          <span>· {words.staleRow}</span>
        {/if}
        {#if need.later}
          <span>· {words.needs.later}</span>
        {/if}
      </p>
      <p class="m-0 mt-space-1 type-body text-ink-strong text-pretty">
        {need.asks}
      </p>
      {#if need.code}
        <code
          class="mt-space-1 block rounded-sm bg-code-bg px-space-3 py-space-2 font-mono type-code text-ink-strong wrap-anywhere"
          >{need.code}</code
        >
      {/if}
    </div>

    <div
      class="flex flex-none flex-col items-stretch gap-space-2 @min-home-need-row/need:w-c-need-answers-w"
    >
      {#if peers}
        <div class="flex justify-between gap-space-8">
          <Button
            answer="approve-strong"
            class="flex-none"
            disabled={stale}
            fit="prompt"
            hit="always"
            label={words.needs.approve}
            onclick={answer("approve")}
            size="sm"
            variant="secondary"
            width="shrink"
          />
          <Button
            answer="deny-strong"
            class="flex-none"
            disabled={stale}
            fit="prompt"
            hit="always"
            label={denyWord}
            onclick={answer("deny")}
            size="sm"
            variant="secondary"
            width="shrink"
          />
        </div>
      {:else}
        <div
          class="flex flex-wrap gap-space-2 @min-home-need-row/need:justify-end"
        >
          {#if need.kind === "picks"}
            <Button
              label={words.needs.openAt(need.question ?? 1)}
              onclick={answer("open")}
              size="sm"
              variant="outline"
            />
            <Button
              disabled={stale}
              label={words.needs.sendPicks(need.picked ?? 0)}
              onclick={answer("send")}
              size="sm"
              variant="outline"
            />
          {:else if need.kind === "failed"}
            <Button
              disabled={stale}
              label={words.needs.tryAgain}
              onclick={answer("retry")}
              size="sm"
              variant="outline"
            />
            <Button
              label={words.needs.openTask}
              onclick={answer("open")}
              size="sm"
              variant="outline"
            />
          {:else if need.kind === "browser"}
            <Button
              disabled={stale}
              label={words.needs.takeOver}
              onclick={answer("take")}
              size="sm"
              variant="outline"
            />
          {:else}
            <Button
              label={words.needs.openTask}
              onclick={answer("open")}
              size="sm"
              variant="outline"
            />
          {/if}
        </div>
      {/if}
      <div class="flex @min-home-need-row/need:justify-end">
        <Button
          class="-ms-space-2 @min-home-need-row/need:ms-0 @min-home-need-row/need:-me-space-2"
          disabled={stale}
          label={words.needs.notNow}
          onclick={answer("later")}
          size="xs"
          tone="quiet"
          variant="ghost"
        />
      </div>
    </div>
  </div>
</li>
