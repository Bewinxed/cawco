<script lang="ts">
  /**
   * One run's whole account: how it ended, when, what started it, how long
   * it took and whether it was the retry, then the whole result as the run
   * left it, its delegate's report included where the result carries it.
   * Where a session did the run, its session is one press away; where none
   * did, the run says who did it. A run still going says what it is doing.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import type { Run } from "./harbor";
  import { sessionHref } from "./harbor";
  import OpenButton from "./OpenButton.svelte";
  import RunMark, { RUN_WORDS } from "./RunMark.svelte";

  let { run }: { run: Run } = $props();

  const facts = $derived(
    [
      run.when,
      run.started,
      run.took,
      run.retry ? "The retry" : undefined,
    ].filter((one) => one !== undefined)
  );
</script>

<div class="flex items-start gap-space-3 min-w-0" data-run={run.id}>
  <span class="flex h-lh items-center type-label"
    ><RunMark how={run.how} /></span
  >
  <div class="flex min-w-0 flex-auto flex-col gap-space-3">
    <header class="flex min-w-0 flex-col gap-space-1">
      <span class="type-label text-ink-strong">{RUN_WORDS[run.how]}</span>
      <span class="type-meta num text-ink-muted">{facts.join(" · ")}</span>
    </header>
    <div
      class="rounded-sm border border-border-well bg-surface-well px-space-4 py-space-3 type-body text-ink-strong wrap-anywhere"
    >
      {#if run.result}
        <Markdown look="surface" source={run.result} />
      {:else}
        <p class="m-0">{run.words}</p>
      {/if}
    </div>
    {#if !run.sessionId && run.by}
      <span class="type-meta text-ink-muted">{run.by}</span>
    {/if}
  </div>
  <span class="flex h-lh items-center type-label">
    {#if run.sessionId}
      <OpenButton
        href={sessionHref(run.sessionId)}
        kind="session"
        label="Open the session that did this run"
      />
    {/if}
  </span>
</div>
