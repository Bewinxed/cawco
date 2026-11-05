<script lang="ts">
  /**
   * Brief & how it runs, folded at the foot of the page: the brief as an
   * attempt reads it (title, description, acceptance criteria, to-dos), how
   * it runs (delegate type, labels, the project's facts, who filed it), what
   * ready requires and what is missing now, Start attempt while it is ready,
   * and its links. It unfolds where it stands. A done or dropped task's
   * brief reads only.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronDown, IconPlay } from "#lib/icons.js";
  import type { TaskRead } from "./fixtures/types";

  let {
    task,
    open = $bindable(false),
  }: {
    task: TaskRead;
    open?: boolean;
  } = $props();

  const uid = $props.id();
  const closed = $derived(task.kind === "done" || task.kind === "dropped");
  const missing = $derived(task.waits.filter((wait) => !wait.settled));
  const facts = $derived(Object.entries(task.fields));
</script>

{#snippet fact(name: string, value: string)}
  <div class="flex gap-space-3">
    <dt class="w-c-ledger-time flex-none type-meta text-ink-muted">{name}</dt>
    <dd class="m-0 min-w-0 flex-1 type-body text-ink-strong wrap-anywhere">
      {value}
    </dd>
  </div>
{/snippet}

<section
  aria-labelledby={`${uid}-brief`}
  class="flex min-w-0 flex-col rounded-lg bg-surface-raised px-space-5 py-space-4 shadow-tile max-phone:px-space-4"
  data-slot="group"
>
  <Collapsible.Root bind:open>
    <h2 class="m-0" id={`${uid}-brief`}>
      <Collapsible.Trigger look="fold"
        ><span>{words.brief.heading}</span><IconChevronDown
          aria-hidden="true"
          class={[
            "size-icon-md transition-transform duration-(--dur-control) ease-out",
            open && "rotate-180",
          ]}
        /></Collapsible.Trigger
      >
    </h2>
    <Collapsible.Content fade reveal>
      <div class="flex flex-col gap-space-5 pbs-space-4" data-slot="brief">
        {#if closed}
          <p class="m-0 type-meta text-ink-muted">{words.brief.readOnly}</p>
        {/if}
        <div class="flex flex-col gap-space-2">
          <h3 class="m-0 type-meta text-ink-muted">{words.brief.title}</h3>
          <p class="m-0 type-body text-ink-strong text-pretty">{task.title}</p>
        </div>
        {#if task.description}
          <div class="flex flex-col gap-space-2">
            <h3 class="m-0 type-meta text-ink-muted">
              {words.brief.description}
            </h3>
            <p
              class="m-0 max-w-c-measure whitespace-pre-wrap type-body text-ink-strong wrap-anywhere"
            >
              {task.description}
            </p>
          </div>
        {/if}
        <div class="flex flex-col gap-space-2">
          <h3 class="m-0 type-meta text-ink-muted">{words.brief.acceptance}</h3>
          {#if task.criteria.length === 0}
            <p class="m-0 type-body text-ink-muted">
              {words.brief.noAcceptance}
            </p>
          {:else}
            <ul class="m-0 flex list-disc flex-col gap-space-1 ps-space-5">
              {#each task.criteria as criterion (criterion.text)}
                <li class="type-body text-ink-strong text-pretty">
                  {criterion.text}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if task.todos.length > 0}
          <div class="flex flex-col gap-space-2">
            <h3 class="m-0 type-meta text-ink-muted">{words.brief.todos}</h3>
            <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
              {#each task.todos as todo (todo.id)}
                <li class="flex gap-space-3">
                  <span
                    class="num w-c-ledger-time flex-none type-meta text-ink-muted"
                    >{todo.id}</span
                  >
                  <span class="type-body text-ink-strong wrap-anywhere"
                    >{todo.text}</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">
            {words.brief.howItRuns}
          </h3>
          <dl class="m-0 flex flex-col gap-space-2">
            {@render fact(
              words.brief.type,
              task.type ?? words.brief.typeDefault
            )}
            {@render fact(words.brief.lands, words.brief.landsDefault)}
            {#if task.labels.length > 0}
              {@render fact(words.brief.labels, task.labels.join(", "))}
            {/if}
            {#each facts as [name, value] (name)}
              {@render fact(name, value)}
            {/each}
            {@render fact(words.brief.filedBy, task.filedBy)}
          </dl>
        </div>

        {#if task.kind === "todo"}
          <div class="flex flex-col gap-space-2">
            <h3 class="m-0 type-label text-ink-strong">
              {words.brief.readyRequires}
            </h3>
            {#if missing.length === 0}
              <p class="m-0 type-body text-ink-muted">{words.brief.readyMet}</p>
            {:else}
              <ul class="m-0 flex list-disc flex-col gap-space-1 ps-space-5">
                {#each missing as wait (wait.href)}
                  <li class="type-body text-ink-strong text-pretty">
                    {wait.label} · {wait.state}
                  </li>
                {/each}
              </ul>
            {/if}
            {#if task.ready}
              <div class="flex justify-end">
                <Button
                  hit="always"
                  icon={IconPlay}
                  label={words.brief.startAttempt}
                  size="sm"
                  variant="outline"
                />
              </div>
            {/if}
          </div>
        {/if}

        <div class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">{words.brief.links}</h3>
          <p class="m-0 type-body text-ink-muted">{words.brief.noLinks}</p>
        </div>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</section>
