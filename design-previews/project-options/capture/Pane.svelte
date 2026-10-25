<!--
  The task pane, K1 (report part 3), on tsk-16 drawn as if it stood in
  Review (today it is Done; every word is its record's). No tabs: one
  scroll, its sections in a fixed order, each only when it has content, with
  a jump strip under the title naming each and its count. Changes is absent:
  the hub recorded no diff for tsk-16, and none is made up. History is only
  what the hub records (filed, the attempt's start and end); drawn in
  Review, it is not closed yet, so its close stands out of it.

  The bar has no ground: Close (Back on a phone) leading, the stage as the
  centre control, the session's symbol and More trailing. The fork:

  - `top`: it opens at the title.
  - `review`: it opens scrolled to Result: the title condensed into the
    bar's centre (the stage control moves to the trailing group), the jump
    strip sticky, the ask in view.

  The Result's foot holds Send back (untinted) and Approve (the pane's one
  coral), pinned while the Result is in view; on a phone it docks at the
  screen's foot.
-->
<script>
  import { byId, day, dayClock, took } from "./data.js";
  import {
    BarGlass,
    Button,
    Checkbox,
    chipsVariants,
    chipVariants,
    dockShellVariants,
    IconChevronDown,
    IconChevronLeft,
    IconClose,
    IconMore,
    IconNeedsYou,
    IconWindow,
    Markdown,
    sectionHeadVariants,
  } from "./kit.js";

  let { fork = "top", phone = false } = $props();
  const task = byId("tsk-16");
  const attempt = task.attempts[0];
  const done = task.todos.filter((todo) => todo.done).length;
  const history = [
    { at: task.createdAt, what: `filed by ${task.createdBy}` },
    { at: attempt.startedAt, what: "attempt 1 started" },
    { at: attempt.endedAt, what: "attempt 1 handed in" },
  ];
  const jumps = [
    { id: "task", name: "Task" },
    { id: "done-when", name: "Done when", count: `${done}/${task.todos.length}` },
    { id: "result", name: "Result", waits: true },
    { id: "sessions", name: "Sessions", count: "1" },
    { id: "history", name: "History", count: String(history.length) },
  ];
  const review = $derived(fork === "review");
</script>

{#snippet stage()}
  <button
    data-bar-item
    aria-label="Stage: Review"
    class="gap-space-1 px-space-2 select-none touch-hit press-tint"
    type="button"
  >
    <IconNeedsYou aria-hidden="true" class="size-icon-md text-ink-strong" />
    <span class="type-label text-ink-strong">Review</span>
    <IconChevronDown aria-hidden="true" class="size-icon-sm text-ink-muted" />
  </button>
{/snippet}

{#snippet answer()}
  <Button class="border-border-button-outline text-ink-strong" size="sm" variant="secondary">Send back</Button>
  <Button size="sm">Approve</Button>
{/snippet}

<div
  data-pane
  data-fork={fork}
  data-scrolled={review ? "" : undefined}
  class={[
    "group/pane relative flex h-full min-h-0 flex-col bg-surface-raised",
    !phone && "border-s border-border-hairline",
  ]}
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 z-2 h-c-top-bar-h bg-linear-to-b from-surface-raised to-transparent opacity-0 backdrop-blur-(--material-blur) mask-b-from-50% group-data-scrolled/pane:opacity-100"
  ></div>
  <div data-pane-bar class="absolute inset-x-0 top-0 z-3 flex h-c-top-bar-h items-center gap-space-2 px-space-3">
    <BarGlass>
      {#snippet head()}
        <button
          data-bar-item
          aria-label={phone ? "Back to Board" : "Close"}
          class="select-none touch-hit press-tint"
          type="button"
        >
          {#if phone}
            <IconChevronLeft data-slot="bar-symbol" aria-hidden="true" />
          {:else}
            <IconClose data-slot="bar-symbol" aria-hidden="true" />
          {/if}
        </button>
      {/snippet}
    </BarGlass>
    <span class="flex min-w-0 flex-auto justify-center">
      {#if review}
        <span data-condensed class="min-w-0 text-center type-label text-ink-strong">{task.title}</span>
      {:else}
        <BarGlass>{#snippet head()}{@render stage()}{/snippet}</BarGlass>
      {/if}
    </span>
    <BarGlass>
      {#snippet head()}
        <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
          <IconMore data-slot="bar-symbol" aria-hidden="true" />
        </button>
      {/snippet}
      {#if review}{@render stage()}{/if}
      <button data-bar-item aria-label="Open the session" class="select-none touch-hit press-tint" type="button">
        <IconWindow data-slot="bar-symbol" aria-hidden="true" />
      </button>
    </BarGlass>
  </div>

  <div
    data-pane-scroll
    class={[
      "min-h-0 flex-auto overflow-y-auto overscroll-y-contain px-space-5 pt-c-top-bar-h",
      phone ? "pb-(--po-foot)" : "pb-space-5",
    ]}
  >
    <div class="flex flex-col gap-space-2 pt-space-2 pb-space-3">
      <h2 data-record="title" data-of={task.id} class="m-0 type-title wrap-anywhere text-ink-strong">{task.title}</h2>
      <p class="m-0 type-meta text-ink-muted">
        <span class="font-(family-name:--font-mono) liga-none">{task.id}</span>
        · {task.labels.join(" · ")} · filed {day(task.createdAt)} by {task.createdBy}
      </p>
    </div>
    <nav
      data-jump
      aria-label="Sections"
      class={chipsVariants({ class: "sticky top-c-top-bar-h z-1 bg-surface-raised py-space-2" })}
    >
      {#each jumps as jump (jump.id)}
        <a class={chipVariants({ variant: "option", class: "no-underline" })} href="#k-{jump.id}">
          {#if jump.waits}<IconNeedsYou aria-hidden="true" class="-me-space-1 size-icon-md text-ink-strong" />{/if}
          <span>{jump.name}</span>
          {#if jump.count}<span data-slot="num" class="num type-meta text-ink-subtle">{jump.count}</span>{/if}
        </a>
      {/each}
    </nav>

    <div class="flex flex-col gap-space-6 pt-space-4">
      <section id="k-task" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>Task</h3>
        <div data-record="description" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.description} />
        </div>
      </section>

      <section id="k-done-when" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>
          <span>Done when</span><span data-slot="num" class="num ms-auto type-meta text-ink-subtle">{done}/{task.todos.length}</span>
        </h3>
        <div data-record="acceptance" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.acceptance} />
        </div>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each task.todos as todo (todo.text)}
            <li class="flex items-start gap-space-2">
              <Checkbox aria-label={todo.text} checked={todo.done} />
              <span data-record="todo" data-of={task.id} class="type-body text-ink-strong">{todo.text}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section id="k-result" data-result class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush", class: "flex-wrap text-ink-strong" })}>
          <IconNeedsYou aria-hidden="true" class="size-icon-md" />
          <span>Result</span>
          <span class="type-meta text-ink-muted">· attempt 1 · handed in {dayClock(task.result.at)}</span>
        </h3>
        <p data-record="headline" data-of={task.id} class="m-0 type-body text-ink-strong">{task.result.headline}</p>
        <div data-record="report" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.result.report} />
        </div>
        {#if !phone}
          <div data-verdict class="sticky bottom-0 z-1 flex justify-between gap-space-8 bg-surface-raised py-space-3">
            {@render answer()}
          </div>
        {/if}
      </section>

      <section id="k-sessions" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>Sessions</h3>
        <button
          class="flex min-h-c-row-h w-full flex-wrap items-center gap-x-space-2 gap-y-space-1 rounded-sm border-0 bg-transparent px-space-2 text-start type-meta text-ink-muted hover:bg-surface-hover press-tint"
          type="button"
        >
          <IconWindow aria-hidden="true" class="size-icon-md text-ink-muted" />
          <span class="type-label text-ink-strong">attempt 1</span>
          <span>· {attempt.state} · {dayClock(attempt.startedAt)} → {dayClock(attempt.endedAt)} · {took(attempt.startedAt, attempt.endedAt)}</span>
        </button>
      </section>

      <section id="k-history" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>History</h3>
        <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each history as row (row.what)}
            <li class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-3 type-meta">
              <span data-slot="num" class="num text-ink-subtle">{dayClock(row.at)}</span>
              <span class="text-ink-strong">{row.what}</span>
            </li>
          {/each}
        </ol>
      </section>
    </div>
  </div>

  {#if phone}
    <div class="absolute inset-x-space-3 bottom-space-4 z-3">
      <div class={dockShellVariants({ class: "flex items-center justify-between gap-space-8 p-c-composer-inset" })}>
        {@render answer()}
      </div>
    </div>
  {/if}
</div>
