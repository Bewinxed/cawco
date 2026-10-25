<!--
  The task pane, K1 (report part 3; rulings 6, 7, 8 and wireframe change 3),
  on tsk-16 drawn as if it stood in Review (today it is Done; every word is
  its record's). No tabs: one scroll, its sections in a fixed order, each
  only when it has content. Changes is absent: the hub recorded no diff for
  tsk-16, and none is made up. History is only what the hub records (filed,
  the attempt's start and its hand-in); drawn in Review, it is not closed.

  - The bar has no ground and no title, ever: Close (Back on a phone)
    leading, the stage control in the centre, the session's symbol and More
    trailing.
  - The jump strip names every section with its count and sticks under the
    bar once the title block scrolls off; it is content, so with `jump="id"`
    it leads with the id in mono, as a card's lead row does, and the facts
    line under the title leaves the id out (`jump="bare"`: no id there).
  - TASK holds the description, then its acceptance under "Done when" as
    prose (no boxes); To-dos is its own section with the boxes and its n/m,
    the only thing the card's ring reads.
  - The verdict, Send back (untinted) and Approve (the view's one coral),
    stands docked at the pane's foot while something waits.
  - The scroll edge effect (preview.css, `po-edge`) parts the content from
    the bar, from the stuck strip and from the dock: absent at rest, in from
    the first scroll.

  The fork: `top` opens at the title; `review` opens scrolled to the Result,
  the strip stuck under the bar (frame.js, `openOnReview`).
-->
<script>
  import { byId, took } from "./data.js";
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
  import When from "./When.svelte";

  let { fork = "top", jump = "id", phone = false } = $props();
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
    { id: "todos", name: "To-dos", count: `${done}/${task.todos.length}` },
    { id: "result", name: "Result", waits: true },
    { id: "sessions", name: "Sessions", count: "1" },
    { id: "history", name: "History", count: String(history.length) },
  ];
</script>

<div
  data-pane
  data-fork={fork}
  data-jump-form={jump}
  class={[
    "po-edge-host relative flex h-full min-h-0 flex-col bg-surface-raised",
    !phone && "border-s border-border-hairline",
  ]}
  style="--po-edge-ground: var(--surface-raised)"
>
  <div
    data-pane-scroll
    data-edge-scroller
    class="po-edge-scroller min-h-0 flex-auto overflow-y-auto overscroll-y-contain px-space-5 pb-(--po-foot)"
  >
    <!-- The bar's room is the title block's own pad, not the scroller's: a stuck strip's offset then counts from the same edge in every engine. -->
    <div class="flex flex-col gap-space-2 pt-[calc(var(--c-top-bar-h)+var(--space-2))] pb-space-3">
      <h2 data-record="title" data-of={task.id} class="m-0 type-title text-balance wrap-anywhere text-ink-strong">{task.title}</h2>
      <p class="m-0 type-meta text-ink-muted">
        {#if jump === "bare"}<span class="font-(family-name:--font-mono) liga-none">{task.id}</span> ·{/if}
        {task.labels.join(" · ")} · filed <When at={task.createdAt} /> by {task.createdBy}
      </p>
    </div>
    <nav
      data-jump
      aria-label="Sections"
      class={chipsVariants({ class: "sticky top-c-top-bar-h z-3 items-center py-space-2" })}
    >
      {#if jump === "id"}
        <span data-jump-id class="pe-space-1 type-meta font-(family-name:--font-mono) liga-none text-ink-subtle">{task.id}</span>
      {/if}
      {#each jumps as one (one.id)}
        <a class={chipVariants({ variant: "option", class: "no-underline" })} href="#k-{one.id}">
          {#if one.waits}<IconNeedsYou aria-hidden="true" class="-me-space-1 size-icon-md text-ink-strong" />{/if}
          <span>{one.name}</span>
          {#if one.count}<span data-slot="num" class="num type-meta text-ink-subtle">{one.count}</span>{/if}
        </a>
      {/each}
    </nav>

    <div class="flex flex-col gap-space-6 pt-space-4">
      <section id="k-task" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>Task</h3>
        <div data-record="description" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.description} />
        </div>
        <h4 class="m-0 pt-space-2 type-label text-ink-strong">Done when</h4>
        <div data-record="acceptance" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.acceptance} />
        </div>
      </section>

      <section id="k-todos" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>
          <span>To-dos</span><span data-slot="num" data-todo-count class="num ms-auto type-meta text-ink-subtle">{done}/{task.todos.length}</span>
        </h3>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each task.todos as todo (todo.text)}
            <li class="flex items-start gap-space-2">
              <Checkbox aria-label={todo.text} checked={todo.done} data-todo-box />
              <span data-record="todo" data-of={task.id} class="type-body text-ink-strong">{todo.text}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section id="k-result" data-result class="flex flex-col gap-space-2">
        <h3 data-result-head class={sectionHeadVariants({ inset: "flush", class: "flex-wrap text-ink-strong" })}>
          <IconNeedsYou aria-hidden="true" class="size-icon-md" />
          <span>Result</span>
          <span class="type-meta text-ink-muted">· attempt 1 · handed in <When at={task.result.at} fmt="dayClock" /></span>
        </h3>
        <p data-record="headline" data-of={task.id} class="m-0 type-body text-ink-strong">{task.result.headline}</p>
        <div data-record="report" data-of={task.id} class="prose prose-sm dark:prose-invert max-w-none">
          <Markdown source={task.result.report} />
        </div>
      </section>

      <section id="k-sessions" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>Sessions</h3>
        <button
          class="flex min-h-c-row-h w-full flex-wrap items-center gap-x-space-2 gap-y-space-1 rounded-sm border-0 bg-transparent px-space-2 text-start type-meta text-ink-muted hover:bg-surface-hover press-tint"
          type="button"
        >
          <IconWindow aria-hidden="true" class="size-icon-md text-ink-muted" />
          <span class="type-label text-ink-strong">attempt 1</span>
          <span
            >· {attempt.state} · <When at={attempt.startedAt} fmt="dayClock" /> → <When at={attempt.endedAt} fmt="dayClock" /> · {took(
              attempt.startedAt,
              attempt.endedAt
            )}</span
          >
        </button>
      </section>

      <section id="k-history" class="flex flex-col gap-space-2">
        <h3 class={sectionHeadVariants({ inset: "flush" })}>History</h3>
        <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each history as row (row.what)}
            <li class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-3 type-meta">
              <When at={row.at} class="text-ink-subtle" fmt="dayClock" />
              <span class="text-ink-strong">{row.what}</span>
            </li>
          {/each}
        </ol>
      </section>
    </div>
  </div>

  <span aria-hidden="true" class="po-edge po-edge-top" data-edge="bar"></span>
  <span aria-hidden="true" class="po-edge po-edge-top" data-edge="strip"></span>
  <span aria-hidden="true" class="po-edge po-edge-foot" data-edge="foot"></span>

  <div data-pane-bar data-bar class="absolute inset-x-0 top-0 z-4 grid h-c-top-bar-h grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center ps-space-3 pe-[calc(var(--po-shell-room,0px)+var(--space-3))]">
    <span class="flex">
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
    </span>
    <BarGlass>
      {#snippet head()}
        <button
          data-bar-item
          data-stage-control
          aria-label="Stage: Review"
          class="gap-space-1 px-space-2 select-none touch-hit press-tint"
          type="button"
        >
          <IconNeedsYou aria-hidden="true" class="size-icon-md text-ink-strong" />
          <span class="type-label text-ink-strong">Review</span>
          <IconChevronDown aria-hidden="true" class="size-icon-sm text-ink-muted" />
        </button>
      {/snippet}
    </BarGlass>
    <span class="flex justify-end">
      <BarGlass>
        {#snippet head()}
          <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
            <IconMore data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/snippet}
        <button data-bar-item aria-label="Open the session" class="select-none touch-hit press-tint" type="button">
          <IconWindow data-slot="bar-symbol" aria-hidden="true" />
        </button>
      </BarGlass>
    </span>
  </div>

  <div data-dock class="absolute inset-x-space-3 bottom-space-4 z-4">
    <div data-verdict class={dockShellVariants({ class: "flex items-center justify-between gap-space-8 p-c-composer-inset" })}>
      <Button class="border-border-button-outline text-ink-strong" size="sm" variant="secondary">Send back</Button>
      <Button size="sm">Approve</Button>
    </div>
  </div>
</div>
