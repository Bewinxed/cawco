<!--
  A task's card in the options' anatomy (report part 2): the lead row is its
  id in mono and its one state mark; then its title whole; then its labels as
  plain text and its to-dos' ratio. A card whose session asks (C1, C2) gives
  the ask a line of its own, two at most; C2 adds Deny and Approve as
  untinted peers for a permission (DESIGN.md, The Peer Rule). A card whose
  file didn't read carries the item-sized failure as its last row (F).

  The card is an article whose title is the link, stretched over it, so its
  buttons are never inside an anchor.
-->
<script>
  import Mark from "./Mark.svelte";
  import { Button, IconClose, IconTick, TaskRing } from "./kit.js";

  let { item, ask = "C1" } = $props();
  const task = $derived(item.task);
  const todos = $derived({
    done: task.todos.filter((todo) => todo.done).length,
    total: task.todos.length,
  });
  const asks = $derived(item.mark?.kind === "asks");
</script>

<article
  data-task-card
  data-task={task.id}
  data-drawn={item.mark?.drawn || item.fault ? "" : undefined}
  class="relative flex flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pt-space-2 pb-space-3 text-ink-strong shadow-tile"
>
  <span class="flex min-h-c-badge-h items-center gap-space-2">
    <span
      data-slot="id"
      class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
      >{task.id}</span
    >
    {#if item.mark}<Mark class="ms-auto" mark={item.mark} />{/if}
  </span>
  <a
    data-record="title"
    data-of={task.id}
    class="type-label wrap-anywhere text-ink-row no-underline after:absolute after:inset-0 after:rounded-sm focus-inset"
    href="?task={task.id}">{task.title}</a
  >
  {#if asks}
    <p data-slot-text class="m-0 type-body text-ink-strong">
      {ask === "C2"
        ? "«what the session asks to run, in its words»"
        : "«the session's ask, in its words»"}
    </p>
  {/if}
  {#if todos.total > 0 || task.labels.length > 0}
    <span
      data-slot="foot"
      class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
    >
      {#if todos.total > 0}
        <span class="mark-line inline-flex items-center gap-space-1">
          <TaskRing done={todos.done} size="sm" total={todos.total} />
          <span data-slot="num" class="num">{todos.done}/{todos.total}</span>
        </span>
      {/if}
      {#if task.labels.length > 0}
        <span class="wrap-anywhere">{task.labels.join(" · ")}</span>
      {/if}
    </span>
  {/if}
  {#if asks && ask === "C2"}
    <div class="relative z-1 flex justify-between gap-space-8 pt-space-1">
      <Button
        class="border-border-button-outline text-ink-strong"
        size="sm"
        variant="secondary"
        ><IconClose aria-hidden="true" /><span>Deny</span></Button
      >
      <Button
        class="border-border-button-outline text-ink-strong"
        size="sm"
        variant="secondary"
        ><IconTick aria-hidden="true" /><span>Approve</span></Button
      >
    </div>
  {/if}
  {#if item.fault}
    <span
      data-fault
      class="relative z-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 pt-space-1 type-meta text-status-fail-ink"
    >
      <span class="mark-line inline-flex items-center gap-space-1"
        ><span aria-hidden="true">⊘</span><span>File didn't read</span></span
      >
      <Button size="xs" variant="outline">Retry</Button>
    </span>
  {/if}
</article>
