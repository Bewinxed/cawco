<script lang="ts">
  /**
   * The task's file as the next attempt reads it: the brief, the acceptance
   * criteria, the to-dos (the agreed ones counted, the offered ones apart),
   * how it runs, what ready requires with which part is missing now, its
   * labels and project fields, and Start attempt while it is ready. Edit
   * brief turns the brief into a field; Save brief is a commit the hub
   * makes, pending until it answers, its refusal beside the field. A task
   * already judged, done or dropped is read-only: no session reads it again.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import Textarea from "#lib/components/ui/textarea/textarea.svelte";
  import { IconNotYet, IconPen, IconTick } from "#lib/icons.js";
  import type { Acts, Pending, TaskView } from "./model";

  let {
    view,
    editing = false,
    loading = false,
    pending = null,
    stale = false,
    onedit,
    onact,
  }: {
    view: TaskView;
    editing?: boolean;
    loading?: boolean;
    pending?: Pending | null;
    stale?: boolean;
    onedit: (editing: boolean) => void;
    onact: Acts["onact"];
  } = $props();

  const file = $derived(view.file);
  const readOnly = $derived(
    view.kind === "done" || view.kind === "dropped" || view.kind === "you"
  );
  const ready = $derived([
    { ok: file.ready.inTodo, label: words.readyIn },
    { ok: file.ready.settled, label: words.readySettled },
    { ok: file.ready.free, label: words.readyFree },
  ]);
  const allReady = $derived(ready.every((r) => r.ok));
  const agreed = $derived(file.todos.filter((t) => !t.offered));
  const offered = $derived(file.todos.filter((t) => t.offered));
  /** The words in the brief's field while it is edited: the file's, until the reader types. */
  let draft = $derived(
    [file.description, "", ...file.acceptance.map((a) => `- ${a}`)].join("\n")
  );
</script>

{#snippet head(label: string)}
  <h3 class="m-0 type-label text-ink-muted">{label}</h3>
{/snippet}

{#if loading}
  <div class="grid gap-space-group" aria-busy="true">
    <Skeleton height="block" radius="card" />
    <Skeleton height="row" radius="card" />
    <Skeleton height="row" radius="card" />
  </div>
{:else}
  <div class="grid gap-space-group">
    {#if readOnly}
      <p class="m-0 type-meta text-pretty text-ink-muted">
        {words.readOnlyDone}
      </p>
    {/if}

    <section class="grid gap-space-2">
      <div class="flex items-center justify-between gap-space-3">
        {@render head(words.brief)}
        {#if !(readOnly || editing)}
          <Button
            size="sm"
            variant="ghost"
            disabled={stale}
            onclick={() => onedit(true)}
          >
            <IconPen data-icon="inline-start" aria-hidden="true" />
            <span>{words.editBrief}</span>
          </Button>
        {/if}
      </div>
      {#if editing}
        <label class="grid gap-space-1">
          <span class="sr-only">{words.brief}</span>
          <Textarea
            bind:value={draft}
            rows={8}
            aria-invalid={file.refused !== null}
          />
        </label>
        {#if file.refused}
          <p class="m-0 type-meta text-pretty text-error-11" role="alert">
            {file.refused}
          </p>
        {/if}
        <div class="flex flex-wrap justify-end gap-space-2">
          <Button
            size="sm"
            variant="ghost"
            label={words.cancel}
            disabled={pending === "saveBrief"}
            onclick={() => onedit(false)}
          />
          <Button
            size="sm"
            variant="outline"
            label={words.saveBrief}
            pending={pending === "saveBrief"}
            pendingLabel={words.saving}
            failed={file.refused !== null}
            disabled={stale}
            onclick={() => onact("saveBrief")}
          />
        </div>
      {:else if file.description}
        <Markdown source={file.description} />
      {/if}
    </section>

    {#if file.acceptance.length > 0 && !editing}
      <section class="grid gap-space-2">
        {@render head(words.acceptance)}
        <ul class="m-0 grid list-none gap-space-2 p-0">
          {#each file.acceptance as line, i (i)}
            <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
            <li class="grid grid-cols-(--lead-cols) gap-x-space-3">
              <span class="mark-cell type-body text-ink-muted">
                <IconNotYet class="size-icon-sm" aria-hidden="true" />
              </span>
              <span class="type-body text-pretty wrap-anywhere text-ink-strong"
                >{line}</span
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if file.todos.length > 0}
      <section class="grid gap-space-2">
        {@render head(words.todosHead)}
        <ul class="m-0 grid list-none gap-space-2 p-0">
          {#each [...agreed, ...offered] as todo (todo.id)}
            <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
            <li class="grid grid-cols-(--entry-cols) gap-x-space-3">
              <span
                class={[
                  "mark-cell type-body",
                  todo.done ? "text-status-done-glyph" : "text-ink-muted",
                ]}
              >
                {#if todo.done}
                  <IconTick class="size-icon-md" aria-hidden="true" />
                {:else}
                  <IconNotYet class="size-icon-sm" aria-hidden="true" />
                {/if}
              </span>
              <span class="type-body text-pretty wrap-anywhere text-ink-strong"
                >{todo.text}</span
              >
              <span class="type-meta text-end text-ink-muted"
                >{todo.offered ? words.offered : todo.id}</span
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="grid gap-space-2">
      {@render head(words.howItRuns)}
      <dl
        class="m-0 grid grid-cols-(--file-cols) gap-x-space-4 gap-y-space-1 type-body"
      >
        <dt class="text-ink-muted">{words.runsAs}</dt>
        <dd class="m-0 text-ink-strong">{file.type ?? words.hubDefault}</dd>
        <dt class="text-ink-muted">{words.lands}</dt>
        <dd class="m-0 text-ink-strong">
          {file.lands ?? words.projectDefault}
        </dd>
        <dt class="text-ink-muted">{words.runsOn}</dt>
        <dd class="m-0 text-ink-strong">
          {file.runsOn ?? words.projectMachines}
        </dd>
        {#each file.fields as field (field.name)}
          <dt class="text-ink-muted">{field.name}</dt>
          <dd class="m-0 text-ink-strong">{field.value}</dd>
        {/each}
        {#if file.labels.length > 0}
          <dt class="text-ink-muted">{words.labels}</dt>
          <dd class="m-0 flex flex-wrap gap-space-1">
            {#each file.labels as label (label)}
              <span
                class="rounded-xs bg-surface-recess px-space-2 type-meta text-ink-strong"
                >{label}</span
              >
            {/each}
          </dd>
        {/if}
      </dl>
    </section>

    {#if view.kind === "todo"}
      <section class="grid gap-space-2">
        {@render head(words.readyRequires)}
        <ul class="m-0 grid list-none gap-space-1 p-0">
          {#each ready as row (row.label)}
            <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
            <li class="grid grid-cols-(--lead-cols) gap-x-space-3">
              <span
                class={[
                  "mark-cell type-body",
                  row.ok ? "text-status-done-glyph" : "text-ink-muted",
                ]}
              >
                {#if row.ok}
                  <IconTick class="size-icon-md" aria-label={words.settled} />
                {:else}
                  <IconNotYet
                    class="size-icon-sm"
                    aria-label={words.notSettled}
                  />
                {/if}
              </span>
              <span
                class={[
                  "type-body",
                  row.ok ? "text-ink-strong" : "text-ink-muted",
                ]}>{row.label}</span
              >
            </li>
          {/each}
        </ul>
        {#if allReady}
          <Button
            class="justify-self-start"
            size="sm"
            variant="outline"
            label={words.startAttempt}
            pending={pending === "start"}
            pendingLabel={words.starting}
            disabled={stale}
            onclick={() => onact("start")}
          />
        {/if}
      </section>
    {/if}
  </div>
{/if}
