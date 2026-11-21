<script lang="ts">
  /**
   * One routine in the list, read down fixed columns where the list has the
   * room (`@routine-row/list`): its state's mark in the lead column; the
   * routine (its name, then what it does or looks for); its last run (how it
   * ended and when, then the words it left, at full ink when new since the
   * last visit); its next run (a time on the person's clock over the rhythm
   * in words, or why it won't run); then the session that did the last run
   * and Open, at the trailing edge. Narrower, it reads as lines: the name
   * with its next run, the sentence, and the last run only when it is new or
   * was no plain success.
   */
  import type { Routine } from "./harbor";
  import { sessionHref } from "./harbor";
  import OpenButton from "./OpenButton.svelte";
  import RoutineMark from "./RoutineMark.svelte";
  import RunMark, { endedWhen } from "./RunMark.svelte";

  let {
    routine,
    open = false,
    onopen,
  }: {
    routine: Routine;
    /** It stands open beside the list. */
    open?: boolean;
    onopen: (id: string) => void;
  } = $props();

  const last = $derived(routine.runs[0]);
  /** A run's word is worth a line of its own in the narrow form. */
  const telling = $derived(
    last !== undefined && (last.fresh === true || last.how !== "delivered")
  );
  const nextAt = $derived("at" in routine.next ? routine.next : null);
</script>

{#snippet next(narrow: boolean)}
  {#if nextAt}
    <span
      class={[
        "flex flex-col gap-space-1 min-w-0",
        narrow ? "items-end text-end" : "",
      ]}
    >
      <span class="type-label num text-ink-strong whitespace-nowrap"
        >{nextAt.when ? `${nextAt.at} ${nextAt.when}` : nextAt.at}</span
      >
      {#if !narrow}
        <span
          class="type-meta text-ink-muted group-data-open/row:text-selected-ink"
          >{routine.rhythm}</span
        >
      {/if}
    </span>
  {:else if "held" in routine.next}
    <span
      class={[
        "type-meta text-ink-muted group-data-open/row:text-selected-ink min-w-0",
        narrow ? "text-end line-clamp-1" : "",
      ]}>{routine.next.held}</span
    >
  {/if}
{/snippet}

<li
  class="group/row relative flex items-start gap-space-3 py-space-2 ps-space-2 pe-space-1 rounded-sm data-open:bg-selected-bg"
  data-open={open || undefined}
  data-routine={routine.id}
>
  <span class="flex h-lh items-center type-label">
    <RoutineMark state={routine.state} words={routine.stateWords} />
  </span>

  <!-- The routine and its facts. Wide: three columns; narrow: lines. -->
  <div
    class="flex flex-auto min-w-0 flex-col gap-space-1 @routine-row/list:flex-row @routine-row/list:items-start @routine-row/list:gap-space-4"
  >
    <div class="flex min-w-0 flex-auto flex-col gap-space-1">
      <div class="flex min-w-0 items-baseline gap-space-3">
        <span class="flex-auto min-w-0 type-label text-ink-strong"
          >{routine.name}</span
        >
        <span class="flex-none max-w-1/2 @routine-row/list:hidden"
          >{@render next(true)}</span
        >
      </div>
      <span
        class="type-body text-ink-muted group-data-open/row:text-selected-ink"
        >{routine.sentence}</span
      >
    </div>

    {#if last}
      <div
        class={[
          "flex min-w-0 items-start gap-space-2 @routine-row/list:w-64 @routine-row/list:flex-none",
          telling ? "" : "@max-routine-row/list:hidden",
        ]}
      >
        <span class="flex h-lh items-center type-meta"
          ><RunMark how={last.how} /></span
        >
        <span class="flex min-w-0 flex-col gap-space-1">
          <span
            class="type-meta num text-ink-muted group-data-open/row:text-selected-ink whitespace-nowrap"
            >{endedWhen(last.how, last.when)}</span
          >
          <span
            class={[
              "type-body line-clamp-2 @routine-row/list:line-clamp-1 wrap-anywhere",
              last.fresh
                ? "text-ink-strong"
                : "text-ink-muted group-data-open/row:text-selected-ink",
            ]}>{last.words}</span
          >
        </span>
      </div>
    {:else}
      <span
        class="type-meta text-ink-muted group-data-open/row:text-selected-ink @max-routine-row/list:hidden @routine-row/list:w-64 @routine-row/list:flex-none"
        >No run yet</span
      >
    {/if}

    <div
      class="hidden @routine-row/list:flex @routine-row/list:w-44 @routine-row/list:flex-none"
    >
      {@render next(false)}
    </div>
  </div>

  <!-- The two ways out of the row, in fixed places: the last run's session
       (none where no session did it), then the routine beside the list. -->
  <div class="flex flex-none items-center gap-space-1 h-lh type-label">
    <span class="grid size-6 place-items-center">
      {#if last?.sessionId}
        <OpenButton
          href={sessionHref(last.sessionId)}
          kind="session"
          label="Open the session of its last run"
        />
      {/if}
    </span>
    <OpenButton
      kind="beside"
      label="Open {routine.name}"
      onopen={() => onopen(routine.id)}
      {open}
    />
  </div>
</li>
