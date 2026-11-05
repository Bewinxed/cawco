<script lang="ts">
  /**
   * The stage for a task in an active stage. With an attempt running: its
   * session's state now, what it is doing, and its plan ticking as it goes,
   * the steps it only offered set apart and out of the count. With none:
   * that nobody is on it, why, and the one act that starts an attempt.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Button } from "#lib/components/ui/button/index.js";
  import LiveDot from "#lib/components/ui/live-dot/live-dot.svelte";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { IconNotYet, IconPlay, IconTick } from "#lib/icons.js";
  import { clock, took, when } from "./format";
  import { LIVENESS } from "./marks";
  import type { LiveView, PlanStep } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let {
    live,
    stage,
    since,
    now,
    starting = false,
    onstart,
  }: {
    /** The running attempt; null when nobody is on the task. */
    live: LiveView | null;
    stage: string;
    since: number;
    now: number;
    starting?: boolean;
    onstart?: () => void;
  } = $props();

  const done = $derived(
    live ? live.plan.filter((step) => step.done).length : 0
  );
</script>

{#snippet steps(list: PlanStep[], offered: boolean)}
  <ol class="flex flex-col">
    {#each list as step (step.id)}
      <li
        class="mark-line grid min-h-c-row-h grid-cols-(--step-cols) items-start gap-x-space-3 py-space-2"
        style:--step-cols={"var(--c-row-lead) var(--c-task-col-todos-w) minmax(0, 1fr)"}
      >
        <span data-box class="flex justify-center pt-px">
          {#if step.done}
            <IconTick
              aria-label={words.checkPassed}
              class="size-icon-md text-status-done-glyph"
              role="img"
            />
          {:else}
            <IconNotYet
              aria-label={words.checkToCheck}
              class="size-icon-md text-ink-muted"
              role="img"
            />
          {/if}
        </span>
        <code class="pt-px font-mono text-size-code text-ink-muted"
          >{step.id}</code
        >
        <span
          class={[
            "type-body text-pretty",
            offered ? "text-ink-muted" : "text-ink-strong",
          ]}>{step.text}</span
        >
      </li>
    {/each}
  </ol>
{/snippet}

{#if live}
  <div class="flex flex-col gap-space-6">
    <div class="flex flex-col gap-space-2">
      <div
        class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-1"
      >
        <StatusMark mark={LIVENESS.working} />
        <span class="num type-meta text-ink-muted tabular-nums"
          >{clock(live.since)} · {took(live.since, now)}</span
        >
      </div>
      <p class="type-row text-balance text-ink-strong">{live.session}</p>
    </div>
    <section class="flex flex-col gap-space-2">
      <h2 class="type-meta text-ink-muted">{words.doingNow}</h2>
      <p
        class="mark-line flex items-start gap-space-2 type-body text-ink-strong"
      >
        <span class="mark-cell" data-box><LiveDot /></span>
        <span class="text-pretty">{live.doing}</span>
      </p>
    </section>
    <section class="flex flex-col gap-space-3">
      <div class="flex items-baseline justify-between gap-space-3">
        <h2 class="type-label text-ink-strong">{words.plan}</h2>
        <span class="num type-meta text-ink-muted tabular-nums"
          >{words.planCount(done, live.plan.length)}</span
        >
      </div>
      <Progress max={live.plan.length} value={done} />
      {@render steps(live.plan, false)}
    </section>
    {#if live.offered.length > 0}
      <section class="flex flex-col gap-space-2">
        <h2 class="type-meta text-ink-muted">{words.offered}</h2>
        {@render steps(live.offered, true)}
      </section>
    {/if}
  </div>
{:else}
  <!-- mark-line: the mark stands on a row of its own, the words under it -->
  <div class="flex max-w-c-measure flex-col items-start gap-space-4 py-space-8">
    <StatusMark mark={LIVENESS.idle} />
    <h2 class="type-title text-balance text-ink-strong">{words.nobodyOnIt}</h2>
    <p class="type-body text-pretty text-ink-muted">
      {words.nobodyWhy(stage, when(since, now))}
    </p>
    <Button
      data-box
      icon={IconPlay}
      label={words.startAttempt}
      onclick={onstart}
      pending={starting}
      pendingLabel={words.startingAttempt}
      variant="outline"
    />
  </div>
{/if}
