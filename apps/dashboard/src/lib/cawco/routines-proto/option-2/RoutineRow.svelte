<script lang="ts" module>
  /** The group a routine stands in, in Now and next. */
  export type Standing = "needs" | "running" | "next" | "wontRun";
</script>

<script lang="ts">
  /**
   * One routine in Now and next, each routine exactly once. It reads down
   * fixed columns: how its last run ended as a glyph, then its name and
   * what stands under it, the only text that wraps; its time on the
   * person's clock in a column of its own; Open at the trailing edge.
   * Needs you draws its row open: why, in one sentence, and its choices on
   * the row. A choice that reaches past the row (Say it is met, Turn off)
   * first says what it reaches, beside the button, and asks again.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";
  import { clockOf, NOW, nearTime, type Routine, type Run } from "./day";
  import RunGlyph from "./RunGlyph.svelte";

  let {
    routine,
    standing,
    last,
    now = NOW,
    current = false,
    onopen,
    onchoose,
  }: {
    routine: Routine;
    standing: Standing;
    /** Its newest run, when it has one. */
    last?: Run;
    now?: number;
    /** It is open beside the list. */
    current?: boolean;
    onopen: (id: string) => void;
    onchoose: (id: string, choice: string) => void;
  } = $props();

  /** A choice waiting on its second press, with what it reaches. */
  let asking = $state<string | null>(null);

  /** What a choice reaches, said before it is made; none for one that only touches this routine. */
  function reaches(choice: string): string | null {
    if (choice === "Say it is met") {
      return `Looking stops for good, and ${routine.looksFor?.holds.join(", ")} can start now.`;
    }
    if (choice === "Turn off") {
      return "It stops now and won't run again unless you turn it on.";
    }
    return null;
  }

  function choose(choice: string): void {
    if (asking !== choice && reaches(choice)) {
      asking = choice;
      return;
    }
    asking = null;
    onchoose(routine.id, choice);
  }

  const under = $derived.by(() => {
    if (standing === "running") {
      return `Running since ${clockOf(last?.at ?? now)} · ${routine.rhythm}`;
    }
    if (standing === "wontRun") {
      return routine.wontRun ?? "";
    }
    return routine.rhythm;
  });

  const time = $derived(
    (standing === "next" || standing === "needs") && routine.next !== null
      ? nearTime(routine.next, now)
      : null
  );
</script>

<li
  data-slot="routine-row"
  data-current={current || undefined}
  class="mark-line grid grid-cols-(--routine-cols) items-start gap-x-space-3 rounded-md px-space-2 py-space-2 data-current:bg-selected-bg"
  style:--routine-cols={"var(--spacing-icon-md) minmax(0, 1fr) auto auto"}
>
  <span class="mark-cell type-label">
    {#if standing === "running"}
      <LiveDot />
    {:else}
      <RunGlyph mark={last?.ending ?? "coming"} />
    {/if}
  </span>

  <div data-box class="flex min-w-0 flex-col gap-space-1">
    <p class="m-0 type-label font-medium text-ink-strong">{routine.name}</p>
    {#if standing === "needs" && routine.needs}
      <p class="m-0 type-body text-ink-row">{routine.needs.why}</p>
      <div class="mt-space-1 flex flex-wrap items-center gap-space-2">
        <Button
          onclick={() => choose(routine.needs?.prominent ?? "")}
          size="xs"
          variant="outline">{routine.needs.prominent}</Button
        >
        {#each routine.needs.choices as choice (choice)}
          <Button
            onclick={() => choose(choice)}
            size="xs"
            variant={asking === choice ? "outline" : "ghost"}
            >{asking === choice ? `${choice}, for good` : choice}</Button
          >
        {/each}
      </div>
      {#if asking}
        <p class="m-0 type-meta text-ink-muted">{reaches(asking)}</p>
      {/if}
    {:else}
      <p class="m-0 line-clamp-2 type-meta text-ink-muted">
        {under}{#if standing === "next"}<span class="text-ink-subtle">
            · {routine.does}</span
          >{/if}
      </p>
    {/if}
  </div>

  <span class="num type-label text-ink-strong">{time ?? ""}</span>

  <Tip label="Open routine">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Open {routine.name}"
        aria-pressed={current}
        onclick={() => onopen(routine.id)}
        press="scale"
        size="icon-xs"
        tone="quiet"
        variant="ghost"
      >
        <IconMaximize aria-hidden="true" />
      </Button>
    {/snippet}
  </Tip>
</li>
