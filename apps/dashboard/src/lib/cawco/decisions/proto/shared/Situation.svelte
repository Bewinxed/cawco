<script lang="ts">
  /**
   * What he is being asked and why: the situation in plain sentences, the
   * session that asked and what it was doing, the work waiting on the
   * request and the earlier pick it rests on.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import type { DecisionState } from "./decision.svelte";

  let {
    dec,
    heading = true,
  }: {
    dec: DecisionState;
    /** The request's title over it, where the bar doesn't carry it. */
    heading?: boolean;
  } = $props();

  const request = $derived(dec.request);
</script>

<div class="flex min-w-0 flex-col gap-space-3">
  {#if heading}
    <h2 class="type-title text-balance text-ink-strong">{request.title}</h2>
  {/if}
  <p class="type-body max-w-task-frame text-pretty text-ink-strong">
    {request.situation}
  </p>
  <dl class="m-0 flex flex-col gap-space-2">
    <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
      <dt class="type-meta text-ink-muted">From</dt>
      <dd class="m-0 flex min-w-0 items-center gap-space-2 mark-line">
        <span data-box>
          <SessionMark
            id="12583348"
            place={request.asker.machine}
            status="live"
          />
        </span>
        <span class="type-label min-w-0 text-ink-row">{request.asker.name}</span
        >
        <span class="type-meta text-ink-muted">{request.asker.doing}</span>
      </dd>
    </div>
    <div class="flex flex-wrap items-baseline gap-x-space-3 gap-y-space-1">
      <dt class="type-meta text-ink-muted">Waiting on this</dt>
      <dd class="m-0 type-body text-ink-strong">
        {request.waiting.join(" · ")}
      </dd>
    </div>
    <div class="flex flex-wrap items-baseline gap-x-space-3 gap-y-space-1">
      <dt class="type-meta text-ink-muted">Rests on</dt>
      <dd class="m-0 type-body text-ink-strong">{request.restsOn}</dd>
    </div>
  </dl>
  {#each dec.removed as id (id)}
    <p class="type-meta text-ink-muted">
      Taken off, built as you sent it: {dec.request.questions.find(
        (q) => q.id === id
      )?.question}
    </p>
  {/each}
</div>
