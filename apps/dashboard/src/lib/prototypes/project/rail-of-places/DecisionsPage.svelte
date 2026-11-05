<script lang="ts">
  /**
   * Decisions: three groups, each named even when it holds none: Waits on
   * you, Sent, Decided. On a desk they stand as three columns, read left
   * to right as a set moves; under the desk line a segmented control
   * chooses one. A row says the set's title, how far along it is, how long
   * it has waited, what it comes after and unlocks, who settled it and the
   * tasks it made (Make tasks where it made none). A row opens the decision
   * page at its first open question.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconAgent } from "#lib/icons.js";
  import type { Decision, Project, Read } from "./model";
  import PageColumn from "./PageColumn.svelte";

  let {
    project,
    read,
    onopen,
    onaskcaw,
  }: {
    project: Project;
    read: Read;
    onopen: (id: string) => void;
    onaskcaw: () => void;
  } = $props();

  type Group = Decision["group"];
  const GROUPS: { key: Group; name: string }[] = [
    { key: "waits", name: w.waitsOnYou },
    { key: "sent", name: w.sent },
    { key: "decided", name: w.decided },
  ];

  let shown = $state<string>("waits");
  const reading = $derived(read.status === "loading");
  const stale = $derived(read.stale !== null);
  const of = (key: Group) =>
    project.decisions.filter((decision) => decision.group === key);
</script>

{#snippet group(key: Group, name: string)}
  {@const rows = of(key)}
  <section class="flex min-w-0 flex-col gap-space-2" aria-label={name}>
    <h2
      class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-3 type-label text-ink-strong max-desk:sr-only"
    >
      <span>{name}</span>
      {#if key === "waits" && rows.length > 0 && !stale && !reading}
        <span
          class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
          data-box
          aria-hidden="true"
        ></span>
      {/if}
      {#if rows.length > 0 && !reading}
        <span class="type-meta num text-ink-muted">{rows.length}</span>
      {/if}
    </h2>
    <div class="rounded-lg bg-surface-raised shadow-tile">
      {#if reading}
        <div class="flex flex-col gap-space-3 p-space-3">
          <Skeleton height="row" radius="tile" />
          <Skeleton height="row" radius="tile" />
        </div>
      {:else if rows.length === 0}
        <p class="px-space-5 py-space-4 type-body text-ink-muted">
          {w.noneYet}
        </p>
      {:else}
        <ul class="flex flex-col divide-y divide-border-hairline">
          {#each rows as decision (decision.id)}
            {@const unread =
              decision.unread ||
              read.unread.includes(`decision:${decision.id}`)}
            <li
              class="relative flex flex-col gap-space-1 px-space-4 py-space-3 data-stale:opacity-55"
              data-stale={stale || undefined}
            >
              <button
                type="button"
                class="press-tint focus-inset absolute inset-0 hover:bg-surface-hover"
                aria-label="{w.open} {decision.title}"
                onclick={() => onopen(decision.id)}
              ></button>
              <div
                class="pointer-events-none relative mark-line flex items-center gap-space-3"
              >
                <span class="min-w-0 flex-1 type-label text-ink-row"
                  >{decision.title}</span
                >
                <span class="flex-none type-meta num text-ink-muted"
                  >{decision.age}</span
                >
              </div>
              <span
                class="pointer-events-none relative type-meta num data-[waits]:text-status-attn-ink text-ink-muted"
                data-waits={key === "waits" || undefined}
              >
                {w.picked(
                  decision.picked[0],
                  decision.picked[1]
                )}{#if decision.settledBy}
                  · {w.settledBy(decision.settledBy)}{/if}
              </span>
              {#if decision.after || decision.unlocks}
                <span
                  class="pointer-events-none relative type-meta text-ink-muted"
                >
                  {[
                    decision.after ? w.after(decision.after) : "",
                    decision.unlocks ? w.unlocks(decision.unlocks) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              {/if}
              {#if unread}
                <span
                  class="pointer-events-none relative type-meta text-status-fail-ink"
                  >{w.pageCouldNotRead}</span
                >
              {/if}
              {#if key === "decided"}
                <div class="relative mt-space-1 flex items-center gap-space-2">
                  {#if decision.tasks && decision.tasks > 0}
                    <span class="type-meta text-ink-muted"
                      >{w.tasksMade(decision.tasks)}</span
                    >
                  {:else}
                    <Button variant="outline" size="xs" disabled={stale}
                      >{w.makeTasks}</Button
                    >
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
{/snippet}

<PageColumn {read}>
  {#if project.decisions.length === 0 && !reading}
    <div
      class="flex items-center gap-space-3 rounded-lg bg-surface-raised px-space-4 py-space-3 shadow-tile"
    >
      <p class="min-w-0 flex-1 type-body text-ink-muted">{w.noneYet}</p>
      <Button size="sm" icon={IconAgent} label={w.askCaw} onclick={onaskcaw} />
    </div>
  {/if}
  <div class="desk:hidden">
    <Tabs.Root bind:value={shown}>
      <Tabs.List>
        {#each GROUPS as one (one.key)}
          <Tabs.Trigger value={one.key}>
            {one.name}{#if of(one.key).length > 0 && !reading}<span
                class="num text-ink-muted">&nbsp;{of(one.key).length}</span
              >{/if}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </div>
  <div class="grid items-start gap-space-group desk:grid-cols-3">
    {#each GROUPS as one (one.key)}
      <div
        class="max-desk:hidden max-desk:data-shown:block"
        data-shown={shown === one.key || undefined}
      >
        {@render group(one.key, one.name)}
      </div>
    {/each}
  </div>
</PageColumn>
