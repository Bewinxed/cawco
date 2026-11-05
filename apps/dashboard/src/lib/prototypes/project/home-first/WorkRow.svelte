<script lang="ts">
  /**
   * One piece of running work (TOM task 4): an attempt on a task, Caw, or
   * a session spun off by hand. Its mark and state word lead, then the
   * task, then the facts that say where it is (its stage, the delegate
   * type or harness, the machine, its to-dos) and, when it is stuck,
   * failed or asking, why, in the same line. How long it has run sits at
   * the trailing edge in tabular figures, so the column holds still.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import cawFace from "#lib/assets/brand/cawco-icon.png";
  import type { Work } from "./model";
  import StateMark from "./StateMark.svelte";

  let { work, stale = false }: { work: Work; stale?: boolean } = $props();

  const stateWord = $derived(words.work.state[work.state]);
  const facts = $derived(
    [
      work.who === "session" ? words.work.spunOff : work.stage,
      work.type,
      work.machine,
      work.todos ? words.work.todos(work.todos[0], work.todos[1]) : undefined,
    ].filter(Boolean)
  );
  const inkOf = {
    working: "text-status-live-ink",
    stuck: "text-status-attn-ink",
    asks: "text-status-attn-ink",
    failed: "text-status-fail-ink",
    queued: "text-ink-muted",
  } as const;
</script>

<!-- mark-line: the mark stands beside the row's first line; its facts line starts under the title. -->
<li
  class="flex min-h-c-row-h-two items-start gap-space-3 border-b border-b-border-hairline py-space-3 ps-space-3 pe-space-3 last:border-b-0"
  data-flip
  data-work={work.state}
>
  {#if work.who === "caw"}
    <span
      class="grid h-lh w-c-row-lead flex-none place-items-center type-label"
      data-box
    >
      <img
        alt=""
        class="size-c-row-mark rounded-xs"
        height="18"
        src={cawFace}
        width="18"
      />
    </span>
  {:else}
    <StateMark label={stateWord} line mark={work.state} />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col gap-space-row">
    <p
      class="m-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
    >
      {work.who === "caw" ? words.work.caw : work.title}
    </p>
    <p class="m-0 type-meta text-ink-muted text-pretty">
      <span class={["font-medium", inkOf[work.state]]}>{stateWord}</span>
      {#each facts as fact (fact)}
        <span> · {fact}</span>
      {/each}
      {#if work.cause}
        <span class="text-ink-strong"> · {work.cause}</span>
      {/if}
    </p>
  </div>
  <span class="flex-none pt-space-row type-meta text-ink-muted tabular-nums">
    {#if stale}{words.staleRow} ·
    {/if}{work.ran}
  </span>
</li>
