<script lang="ts">
  /**
   * The work: the live attempt and its session's state now, with Open
   * session; the agreed to-dos ticking, counted, and the ones the session
   * only offered apart and out of the count; why nothing runs when nothing
   * does; and every past attempt folded under one line, each with when it
   * ran, how it ended and what it handed in. Spend shows only where a budget
   * is set, and no task of the project sets one.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconClose,
    IconStopped,
    IconSuccess,
    IconTranscript,
  } from "#lib/icons.js";
  import type { AttemptRead, TaskRead } from "./fixtures/types";
  import { when } from "./when";

  let {
    task,
    now,
    onsession,
  }: {
    task: TaskRead;
    now: number;
    onsession: () => void;
  } = $props();

  const live = $derived(
    task.attempts[0]?.state === "running" ? task.attempts[0] : null
  );
  const past = $derived(live ? task.attempts.slice(1) : task.attempts);
  const agreed = $derived(task.todos.filter((todo) => !todo.offered));
  const offered = $derived(task.todos.filter((todo) => todo.offered));
  const ticked = $derived(agreed.filter((todo) => todo.done).length);
  let pastOpen = $state(false);
  let offeredOpen = $state(false);

  const endedWord = (attempt: AttemptRead): string => {
    switch (attempt.state) {
      case "done":
        return words.work.endedDone;
      case "cancelled":
        return words.work.endedStopped;
      case "failed":
        return words.work.endedFailed;
      case "running":
        return "";
    }
  };
</script>

<div class="flex flex-col gap-space-4" data-slot="the-work">
  {#if live}
    <div class="flex items-center gap-space-3">
      <span class="grid w-c-row-mark flex-none place-items-center" data-box
        ><LiveDot /></span
      >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate type-label text-ink-row"
          >{live.session.title}</span
        >
        <span class="type-meta text-ink-muted"
          >{words.session.state.working} · {words.work.started(
            when(live.startedAt, now)
          )}</span
        >
      </span>
      <Button
        hit="always"
        icon={IconTranscript}
        label={words.head.openSession}
        size="sm"
        variant="ghost"
        onclick={onsession}
      />
    </div>
  {:else if task.attempts.length === 0}
    <p class="m-0 type-body text-ink-muted">
      {words.work.noAttempt}
      {task.kind === "todo" ? "" : words.work.noAttemptWhy}
    </p>
  {/if}

  {#if agreed.length > 0}
    <div class="flex flex-col gap-space-2">
      <p class="m-0 type-meta text-ink-muted num">
        {words.work.todos(ticked, agreed.length)}
      </p>
      <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
        {#each agreed as todo (todo.id)}
          <li class="mark-line flex items-start gap-space-2">
            <span class="mark-cell"
              ><span
                class={[
                  "size-icon-md rounded-xs border",
                  todo.done
                    ? "border-transparent bg-action-solid"
                    : "border-border-control",
                ]}
                aria-hidden="true"
              ></span></span
            >
            <span class="type-body text-ink-strong wrap-anywhere"
              >{todo.text}</span
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if offered.length > 0}
    <Collapsible.Root bind:open={offeredOpen}>
      <Collapsible.Trigger look="fold"
        >{words.work.offered} ·
        <span class="num">{offered.length}</span></Collapsible.Trigger
      >
      <Collapsible.Content fade reveal>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0 pbs-space-2">
          {#each offered as todo (todo.id)}
            <li class="mark-line flex items-start gap-space-2">
              <span class="mark-cell"
                ><span
                  class="size-icon-md rounded-xs border border-dashed border-border-control"
                  aria-hidden="true"
                ></span></span
              >
              <span class="type-body text-ink-muted wrap-anywhere"
                >{todo.text}</span
              >
            </li>
          {/each}
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}

  {#if past.length > 0}
    <Collapsible.Root bind:open={pastOpen}>
      <Collapsible.Trigger look="fold"
        >{words.work.pastAttempts(past.length)}</Collapsible.Trigger
      >
      <Collapsible.Content fade reveal>
        <ol class="m-0 flex list-none flex-col gap-space-3 p-0 pbs-space-3">
          {#each past as attempt (attempt.id)}
            <li class="mark-line flex items-start gap-space-3">
              <span class="mark-cell">
                {#if attempt.state === "done"}
                  <IconSuccess
                    aria-label={endedWord(attempt)}
                    class="size-icon-md text-status-done-glyph"
                  />
                {:else if attempt.state === "failed"}
                  <IconClose
                    aria-label={endedWord(attempt)}
                    class="size-icon-md text-status-fail-glyph"
                  />
                {:else}
                  <IconStopped
                    aria-label={endedWord(attempt)}
                    class="size-icon-md text-ink-muted"
                  />
                {/if}
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-space-row" data-box>
                <span class="num type-meta text-ink-muted"
                  >{endedWord(attempt)} · {words.work.ran(
                    when(attempt.startedAt, now),
                    when(attempt.endedAt ?? now, now)
                  )}</span
                >
                <span class="type-body text-ink-strong text-pretty"
                  >{attempt.headline ?? attempt.endedHow}</span
                >
              </span>
            </li>
          {/each}
        </ol>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
</div>
