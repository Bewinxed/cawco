<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import DecisionBody from "./DecisionBody.svelte";
  import DecisionRecord from "./DecisionRecord.svelte";
  import type { Decision, Message } from "./model.js";
  import { since } from "./model.js";
  import { pickedOf, WORDS } from "./words.js";

  type Ask = Extract<Message, { kind: "ask" }>;

  /**
   * An ask, as a message with its options inside it. Read in one order: what
   * its delay costs, the group line (a group is one message, its questions
   * in the agent's order, a dependent one dim until the one before it is
   * picked), each open question, then the decided ones as the record, and
   * what waits on it, disclosed.
   */
  let {
    message,
    picks = {},
    stoppedSince,
    goesTo,
    onpick,
    onkind,
    onpicture,
    onpickagain,
  }: {
    message: Ask;
    picks?: Record<string, string[]>;
    /** When work stopped behind it, for the cost line. */
    stoppedSince: string;
    goesTo?: (d: Decision) => string;
    onpick?: (decision: string, next: string[]) => void;
    onkind?: () => void;
    onpicture?: () => void;
    onpickagain?: (decision: string) => void;
  } = $props();

  const isDecided = (d: Decision) => Boolean(d.chosen?.length || d.settled);
  const open = $derived(message.decisions.filter((d) => !isDecided(d)));
  const decided = $derived(message.decisions.filter(isDecided));
  const picked = $derived(open.filter((d) => picks[d.id]?.length).length);
  const numberOf = (d: Decision) => message.decisions.indexOf(d) + 1;
  const group = $derived(message.decisions.length > 1);
</script>

<article
  class="@container flex min-w-0 flex-col gap-space-6 rounded-lg bg-surface-raised p-space-4 shadow-tile @phone:p-space-6"
  aria-label={message.topic ?? message.decisions[0]?.question}
>
  <header class="flex min-w-0 flex-col gap-space-1">
    <p class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
      {#if message.blocking}
        <Badge variant="attn"><span>{WORDS.stopsWork}</span></Badge>
      {:else}
        <span class="type-label text-ink-strong">{WORDS.wentAhead}</span>
      {/if}
      <span class="type-meta text-ink-muted">
        <span class="tabular-nums">{since(stoppedSince)}</span>
        {#if message.waits.length}· <span class="tabular-nums"
            >{message.waits.length}</span
          > held{/if}
      </span>
    </p>
    {#if group}
      <p class="type-meta text-pretty text-ink-muted">
        <span class="tabular-nums">{message.decisions.length}</span> asked
        together about
        <span class="font-medium text-ink-strong">{message.topic}</span>
        {#if open.length}
          · <span class="tabular-nums">{pickedOf(picked, open.length)}</span>
          {#if decided.length}
            · <span class="tabular-nums">{decided.length}</span> decided
          {/if}
        {/if}
      </p>
    {/if}
  </header>

  {#if open.length}
    <div class="flex min-w-0 flex-col gap-space-8">
      {#each open as d (d.id)}
        {@const before = message.decisions.find((x) => x.id === d.after)}
        {@const waiting = Boolean(
          before && !isDecided(before) && !picks[before.id]?.length
        )}
        <DecisionBody
          after={before && waiting ? numberOf(before) : undefined}
          decision={d}
          goesTo={goesTo?.(d)}
          number={group ? numberOf(d) : undefined}
          {onkind}
          {onpicture}
          onpick={(next) => onpick?.(d.id, next)}
          picked={picks[d.id] ?? []}
          {waiting}
        />
      {/each}
    </div>
  {/if}

  {#if decided.length}
    <section class="flex min-w-0 flex-col gap-space-4" aria-label="Decided">
      <h3 class="type-caps text-ink-muted">Decided</h3>
      <div class="flex min-w-0 flex-col gap-space-5">
        {#each decided as d (d.id)}
          <DecisionRecord
            decision={d}
            number={group ? numberOf(d) : undefined}
            onpickagain={d.settled ? undefined : () => onpickagain?.(d.id)}
          />
        {/each}
      </div>
    </section>
  {/if}

  {#if message.waits.length}
    <details class="group/waits min-w-0">
      <summary
        class="type-label mark-line flex w-fit list-none items-center gap-space-1 rounded-xs text-ink-muted hover:text-ink-strong [&::-webkit-details-marker]:hidden"
      >
        <span>{WORDS.whatWaits}</span>
        <span class="tabular-nums">({message.waits.length})</span>
        <IconChevronDown
          aria-hidden="true"
          class="size-icon-sm group-open/waits:rotate-180 motion-safe:transition-transform motion-safe:duration-(--dur-control) motion-safe:ease-out"
        />
      </summary>
      <ul class="mt-space-3 flex flex-col gap-space-2 ps-space-1">
        {#each message.waits as wait (wait)}
          <li class="type-body text-pretty text-ink-strong">{wait}</li>
        {/each}
      </ul>
    </details>
  {/if}
</article>
