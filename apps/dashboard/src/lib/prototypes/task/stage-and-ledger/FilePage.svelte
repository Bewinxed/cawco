<script lang="ts">
  /**
   * File, the strip's second page: the brief as the attempt reads it, how
   * it runs, what ready requires and which of it is missing now, its links,
   * and Start attempt. Every edit is a commit the hub makes, so a field
   * shows the hub's version once it answers, and a refusal stays beside the
   * field it refused. A task that is done or dropped offers no edits.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconChevronLeft,
    IconClose,
    IconPlay,
    IconTick,
  } from "#lib/icons.js";
  import Inline from "./Inline.svelte";
  import MoreMenu from "./MoreMenu.svelte";
  import type { SaveState, TaskRead } from "./records";

  let {
    task,
    loading = false,
    writing = $bindable(false),
    draft = $bindable(""),
    save = "idle",
    savedAs = null,
    refusal = null,
    onback,
    onsave,
    onstart,
  }: {
    task: TaskRead;
    /** The file not read yet: its skeleton stands at its size. */
    loading?: boolean;
    /** The acceptance criteria open for writing. */
    writing?: boolean;
    draft?: string;
    save?: SaveState;
    /** The commit the hub made of the last save. */
    savedAs?: string | null;
    /** The hub's refusal of the last save, in its words. */
    refusal?: string | null;
    onback?: () => void;
    onsave?: () => void;
    onstart?: () => void;
  } = $props();

  const uid = $props.id();
  const closed = $derived(task.kind === "done" || task.kind === "dropped");
  const requires = $derived([
    { text: words.requireTodo, met: task.kind === "todo" },
    {
      text: words.requireWaits,
      met: task.waits.every((wait) => wait.settled),
    },
    { text: words.requireNoAttempt, met: task.live === null },
    { text: words.requireNotHeld, met: true },
  ]);
  const ready = $derived(requires.every((one) => one.met));
  const facts = $derived([
    { key: words.type, value: task.type ?? words.typeDefault },
    { key: words.lands, value: words.landsProject },
    { key: words.runsOn, value: words.runsOnProject },
    { key: words.budget, value: words.budgetNone },
    ...(task.owns.length > 0
      ? [{ key: words.owns, value: task.owns.join(", ") }]
      : []),
    ...Object.entries(task.fields).map(([key, value]) => ({ key, value })),
  ]);
</script>

{#snippet sectionHead(text: string, id?: string)}
  <h3 class="type-label text-ink-strong" {id}>{text}</h3>
{/snippet}

<div class="flex flex-col gap-space-5" data-slot="file">
  <div class="flex items-center gap-space-2">
    <Button
      aria-label={words.backToLedger}
      icon={IconChevronLeft}
      onclick={onback}
      size="icon-sm"
      title={words.backToLedger}
      variant="ghost"
    />
    <h2 class="type-row text-ink-strong">{words.file}</h2>
  </div>

  {#if loading}
    <div aria-busy="true" class="flex flex-col gap-space-3">
      <Skeleton height="line" />
      <Skeleton height="block" />
      <Skeleton height="line" />
      <Skeleton height="view" />
    </div>
  {:else}
    {#if closed}
      <p class="type-meta text-pretty text-ink-muted">{words.closedFile}</p>
    {/if}

    <section class="flex flex-col gap-space-3">
      {@render sectionHead(words.description)}
      {#each task.description.split("\n\n") as paragraph, place (place)}
        <p class="type-body text-pretty text-ink-strong">
          <Inline text={paragraph} />
        </p>
      {/each}
    </section>

    <section
      aria-labelledby="{uid}-acceptance"
      class="flex flex-col gap-space-3"
    >
      {@render sectionHead(words.acceptance, `${uid}-acceptance`)}
      {#if task.acceptance.length > 0}
        <ul class="flex list-disc flex-col gap-space-2 ps-space-5">
          {#each task.acceptance as line, place (place)}
            <li class="type-body text-pretty text-ink-strong">
              <Inline text={line} />
            </li>
          {/each}
        </ul>
        {#if save === "saved" && savedAs}
          <p class="type-meta text-ink-muted" transition:appear>
            {words.savedAs(savedAs)}
          </p>
        {/if}
      {:else if writing}
        <div class="flex flex-col gap-space-2" transition:unfold>
          <Textarea
            aria-invalid={save === "refused" ? "true" : undefined}
            aria-labelledby="{uid}-acceptance"
            bind:value={draft}
            disabled={save === "saving"}
            rows={4}
          />
          {#if save === "refused" && refusal}
            <p
              class="type-meta text-pretty text-status-fail-ink"
              role="alert"
              transition:appear
            >
              {words.refusedField}: {refusal}
            </p>
          {/if}
          <div class="flex justify-end gap-space-2">
            <Button
              disabled={save === "saving"}
              label={words.cancel}
              onclick={() => {
                writing = false;
              }}
              size="sm"
              variant="ghost"
            />
            <Button
              label={words.saveAcceptance}
              onclick={onsave}
              pending={save === "saving"}
              pendingLabel={words.saving}
              size="sm"
              variant="outline"
            />
          </div>
        </div>
      {:else}
        <p class="type-body text-pretty text-ink-muted">
          {words.acceptanceNone}
        </p>
        {#if !closed}
          <div>
            <Button
              label={words.addAcceptance}
              onclick={() => {
                writing = true;
              }}
              size="sm"
              variant="outline"
            />
          </div>
        {/if}
      {/if}
    </section>

    <section class="flex flex-col gap-space-2">
      {@render sectionHead(words.todos)}
      {#if task.todos.length === 0}
        <p class="type-body text-ink-muted">{words.todosNone}</p>
      {:else}
        <ul class="flex flex-col">
          {#each task.todos as todo (todo.id)}
            <li
              class="grid min-h-c-row-h grid-cols-(--todo-cols) items-start gap-x-space-3 py-space-1"
              style:--todo-cols={"var(--c-task-col-todos-w) minmax(0, 1fr) auto"}
            >
              <code class="pt-space-1 font-mono text-size-code text-ink-muted"
                >{todo.id}</code
              >
              <span class="pt-px type-body text-pretty text-ink-strong"
                >{todo.text}</span
              >
              <MoreMenu>
                <DropdownMenu.Item>{words.promote}</DropdownMenu.Item>
              </MoreMenu>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if task.mergeChecks.length > 0}
      <section class="flex flex-col gap-space-2">
        {@render sectionHead(words.mergeChecks)}
        <ul class="flex flex-col gap-space-1">
          {#each task.mergeChecks as check (check)}
            <li>
              <code class="font-mono text-size-code text-ink-strong"
                >{check}</code
              >
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="flex flex-col gap-space-2">
      {@render sectionHead(words.howItRuns)}
      <dl
        class="grid grid-cols-(--fact-cols) gap-x-space-3 gap-y-space-2"
        style:--fact-cols={"var(--c-task-key-w) minmax(0, 1fr)"}
      >
        {#each facts as fact (fact.key)}
          <dt class="type-meta text-ink-muted">{fact.key}</dt>
          <dd class="type-body text-ink-strong">{fact.value}</dd>
        {/each}
        <dt class="type-meta text-ink-muted">{words.labels}</dt>
        <dd class="flex flex-wrap gap-space-1">
          {#each task.labels as label (label)}
            <Badge variant="secondary"><span>{label}</span></Badge>
          {/each}
        </dd>
      </dl>
    </section>

    {#if !closed}
      <section class="flex flex-col gap-space-2">
        {@render sectionHead(words.readyRequires)}
        <ul class="flex flex-col gap-space-1">
          {#each requires as one (one.text)}
            <li
              class="mark-line grid grid-cols-(--req-cols) items-center gap-x-space-3"
              style:--req-cols={"var(--c-row-lead) minmax(0, 1fr)"}
            >
              <span data-box class="flex justify-center">
                {#if one.met}
                  <IconTick
                    aria-label={words.checkPassed}
                    class="size-icon-md text-status-done-glyph"
                    role="img"
                  />
                {:else}
                  <IconClose
                    aria-label={words.checkNotShown}
                    class="size-icon-md text-status-fail-glyph"
                    role="img"
                  />
                {/if}
              </span>
              <span
                class={[
                  "type-body",
                  one.met ? "text-ink-muted" : "text-ink-strong",
                ]}>{one.text}</span
              >
            </li>
          {/each}
        </ul>
        {#if ready}
          <div class="flex flex-wrap items-center gap-space-3 pt-space-1">
            <span class="type-body text-ink-strong">{words.readyNow}</span>
            <Button
              icon={IconPlay}
              label={words.startAttempt}
              onclick={onstart}
              size="sm"
              variant="outline"
            />
          </div>
        {/if}
      </section>
    {/if}

    <section class="flex flex-col gap-space-2">
      {@render sectionHead(words.links)}
      <p class="type-body text-ink-muted">{words.linksNone}</p>
    </section>
  {/if}
</div>
