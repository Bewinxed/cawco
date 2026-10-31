<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Decision } from "./model.js";
  import { WORDS } from "./words.js";

  /**
   * A decided question inside its ask: the question as he saw it, what was
   * chosen and by whom, his note, and Pick again. The record is this line;
   * the project's folder is written from it.
   */
  let {
    decision,
    number,
    onpickagain,
  }: {
    decision: Decision;
    number?: number;
    onpickagain?: () => void;
  } = $props();

  const chosen = $derived(
    decision.options
      .filter((o) => decision.chosen?.includes(o.id))
      .map((o) => o.label)
      .join(", ")
  );
  const by = $derived(
    decision.settled ? `Settled for you by ${decision.settled.name}` : "You"
  );
</script>

<div class="grid min-w-0 grid-cols-auto-fluid gap-x-space-3 gap-y-space-1">
  <span class="type-meta pt-px text-ink-muted tabular-nums">{number ?? ""}</span
  >
  <div class="flex min-w-0 flex-col gap-space-1">
    <p class="type-body text-pretty text-ink-muted">{decision.question}</p>
    <p class="type-label text-pretty text-ink-strong">{chosen}</p>
    <p
      class="type-meta flex flex-wrap items-center gap-x-space-3 text-ink-muted"
    >
      <span>{by}</span>
      {#if onpickagain}
        <Button
          aria-label="{WORDS.pickAgain} on {decision.question}"
          onclick={onpickagain}
          pad="none"
          size="xs"
          variant="link">{WORDS.pickAgain}</Button
        >
      {/if}
    </p>
    {#if decision.note}
      <blockquote
        class="type-meta border-border-control border-s-2 ps-space-2 text-pretty break-words text-ink-muted"
      >
        {decision.note}
      </blockquote>
    {/if}
  </div>
</div>
