<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * Decisions: every decision page in three groups, Waits on you, Sent and
   * Decided, each named with its count even when it holds none. A row says
   * its title, how far its picks are (drawn as a meter, the figure beside
   * it), how long it has waited, what it comes after and what it unlocks,
   * and the tasks it made, or Make tasks for a decided one with none. On a
   * desk the groups stand as three columns; on a phone one group at a time
   * under a segmented control. A row opens the page at its first open
   * question.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import Progress from "#lib/components/ui/progress/progress.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import type { Read } from "./derive";
  import type { Decision, ProjectRecords } from "./records";

  type Group = Decision["group"];

  let {
    records,
    read,
    group: groupArg = "waits",
    opened,
    onopen,
    onaskcaw,
  }: {
    records: ProjectRecords;
    read: Read;
    /** On a phone, the group shown. */
    group?: Group;
    opened?: string | null;
    onopen: (id: string) => void;
    onaskcaw: (words: string) => void;
  } = $props();

  let group = $derived<Group>(groupArg);
  const GROUPS: Group[] = ["waits", "sent", "decided"];
  const inGroup = (one: Group) =>
    records.decisions.filter((decision) => decision.group === one);
  const live = $derived(read === "live");
</script>

{#snippet row(decision: Decision)}
  <li>
    <button
      aria-current={opened === decision.id ? "true" : undefined}
      class="press-tint flex w-full flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 text-start shadow-tile can-hover:not-aria-current:hover:bg-surface-hover aria-current:bg-selected-bg"
      onclick={() => onopen(decision.id)}
      type="button"
    >
      <span class="mark-line flex items-center gap-space-2">
        {#if decision.group === "waits" && live}
          <span
            aria-hidden="true"
            class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
            data-box
          ></span>
        {/if}
        <span class="type-label text-ink-row text-pretty">{decision.title}</span
        >
      </span>
      <span class="grid grid-cols-fluid-auto items-center gap-x-space-3">
        <Progress
          aria-label={words.picked(decision.picked, decision.total)}
          max={decision.total}
          value={decision.picked}
        />
        <span class="type-meta text-ink-muted num">
          {words.picked(decision.picked, decision.total)}{decision.unsent > 0
            ? ` · ${words.unsent(decision.unsent)}`
            : ""}
        </span>
      </span>
      <span class="flex flex-col gap-space-row type-meta text-ink-muted">
        <span class="num"
          >{decision.waited}{decision.settled
            ? ` · ${decision.settled}`
            : ""}</span
        >
        {#if decision.after}
          <span class="text-pretty"
            ><span class="text-ink-subtle">{words.after}</span>
            {decision.after}</span
          >
        {/if}
        {#if decision.unlocks}
          <span class="text-pretty"
            ><span class="text-ink-subtle">{words.unlocks}</span>
            {decision.unlocks}</span
          >
        {/if}
        {#if decision.tasks > 0}
          <span>{words.madeTasks(decision.tasks)}</span>
        {/if}
      </span>
    </button>
    {#if decision.group === "decided" && decision.tasks === 0}
      <Button class="mt-space-1" disabled={!live} size="sm" variant="ghost"
        >{words.makeTasks}</Button
      >
    {/if}
  </li>
{/snippet}

{#snippet column(one: Group)}
  {@const rows = inGroup(one)}
  <section
    aria-labelledby={`dec-${one}`}
    class="flex min-h-0 min-w-0 flex-col gap-space-2"
  >
    <h3
      class="mark-line flex h-c-btn-h-sm flex-none items-center gap-space-2 type-label text-ink-strong @max-phone/five:sr-only"
      id={`dec-${one}`}
    >
      {words.decisionGroups[one]}
      {#if rows.length > 0}<span class="type-meta text-ink-muted num"
          >{rows.length}</span
        >{/if}
    </h3>
    {#if read === "loading"}
      {#each [0, 1] as skeleton (skeleton)}
        <Skeleton height="view" radius="card" />
      {/each}
    {:else if rows.length > 0}
      <ul class="flex min-h-0 flex-col gap-space-2 overflow-y-auto pb-space-2">
        {#each rows as decision (decision.id)}
          {@render row(decision)}
        {/each}
      </ul>
    {:else}
      <p class="type-meta text-ink-muted">{words.noneYet}</p>
    {/if}
  </section>
{/snippet}

<section
  aria-label={words.places.decisions}
  class="flex min-h-0 flex-1 flex-col gap-space-4"
>
  {#if live && records.decisions.length === 0}
    <EmptyState
      icon={IconDecisions}
      line={words.noDecisionsLine}
      title={words.noDecisionsTitle}
    >
      {#snippet action()}
        <Button
          label={words.askCawDecide}
          onclick={() => onaskcaw(words.askCawDecide)}
          variant="outline"
        />
      {/snippet}
    </EmptyState>
  {/if}
  <!-- Phone: one group at a time. -->
  <div class="@phone/five:hidden">
    <Tabs.Root bind:value={group}>
      <Tabs.List class="w-full">
        {#each GROUPS as one (one)}
          {@const count = inGroup(one).length}
          <Tabs.Trigger value={one}>
            {words.decisionGroups[one]}
            {#if count > 0 && live}<span class="type-meta num">{count}</span
              >{/if}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </div>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto @phone/five:hidden">
    {@render column(group)}
  </div>
  <!-- Desk: three columns sharing one top edge. -->
  <div class="hidden min-h-0 flex-1 grid-cols-3 gap-space-5 @phone/five:grid">
    {#each GROUPS as one (one)}
      {@render column(one)}
    {/each}
  </div>
</section>
