<script lang="ts">
  /**
   * Decisions (TOM task 6), reached from Home's Decisions open. Every choice
   * set in three groups, side by side on a desk and one at a time under a
   * segmented switch on a phone: what waits on the person, what was sent,
   * what is decided. A row says its progress as a meter and in words, how
   * long it has waited, what it comes after and what it unlocks; a decided
   * one who settled it and the tasks it made, or Make tasks. A row opens
   * the decision page at its first open question. The search finds what
   * was chosen and why.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import Group from "./Group.svelte";
  import type { Decision } from "./model";
  import PicksMeter from "./PicksMeter.svelte";
  import ProjectFrame from "./ProjectFrame.svelte";

  let {
    project,
    decisions,
    read = "live",
    staleAt,
    phoneGroup = "waits",
  }: {
    project: string;
    decisions: Decision[];
    read?: "live" | "loading" | "stale";
    staleAt?: string;
    /** On a phone, the group on screen. */
    phoneGroup?: Decision["group"];
  } = $props();

  const GROUPS = ["waits", "sent", "decided"] as const;
  const at = $derived(read === "stale" ? staleAt : undefined);
  const inGroup = (group: Decision["group"]) =>
    decisions.filter((d) => d.group === group);
</script>

{#snippet group(key: Decision["group"])}
  <Group count={inGroup(key).length} staleAt={at} title={words.decisions[key]}>
    {#if read === "loading"}
      <div class="flex flex-col gap-space-3 p-space-3">
        <Skeleton height="row" radius="tile" />
        <Skeleton height="row" radius="tile" />
      </div>
    {:else if inGroup(key).length === 0}
      <p class="m-0 px-space-4 py-space-3 type-body text-ink-muted">
        {key === "waits" ? words.decisions.none : words.decisions.noneYet}
      </p>
    {:else}
      <ul class="m-0 list-none p-0">
        {#each inGroup(key) as decision (decision.id)}
          <li
            class="flex flex-col gap-space-2 border-b border-b-border-hairline px-space-4 py-space-3 last:border-b-0"
          >
            <p class="m-0 flex items-baseline gap-space-2">
              <span class="min-w-0 flex-1 type-label text-ink-row text-pretty"
                >{decision.title}</span
              >
              <span class="flex-none type-meta text-ink-muted tabular-nums"
                >{decision.age}</span
              >
            </p>
            <PicksMeter picked={decision.picked} total={decision.total} />
            {#if decision.after || decision.unlocks}
              <p class="m-0 type-meta text-ink-muted text-pretty">
                {#if decision.after}{words.decisions.after(
                    decision.after
                  )}{/if}{#if decision.after && decision.unlocks}
                  ·
                {/if}{#if decision.unlocks}{words.decisions.unlocks(
                    decision.unlocks
                  )}{/if}
              </p>
            {/if}
            {#if decision.settled}
              <p class="m-0 type-meta text-ink-strong text-pretty">
                {words.decisions.settledBy(decision.settled)}
              </p>
            {/if}
            <div class="flex flex-wrap items-center gap-space-2">
              {#if decision.group === "waits"}
                <Button
                  label={words.decisions.openAt(decision.question ?? 1)}
                  size="sm"
                  variant="outline"
                />
              {:else if decision.group === "decided" && decision.made === 0}
                <Button
                  label={words.decisions.makeTasks}
                  size="sm"
                  variant="outline"
                />
              {:else if decision.made}
                <span class="type-meta text-ink-muted"
                  >{words.decisions.madeTasks(decision.made)}</span
                >
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Group>
{/snippet}

<ProjectFrame
  more={[words.more.configure]}
  {project}
  title={words.places.decisions}
>
  <div class="flex min-w-0 flex-col gap-space-4">
    <div class="w-full @min-desk/shell:w-c-pop-w">
      <Input
        aria-label={words.bar.findChosen}
        placeholder={words.bar.findChosen}
        type="search"
      />
    </div>
    <div class="@min-desk/shell:hidden">
      <ToggleGroup.Root type="single" value={phoneGroup}>
        {#each GROUPS as key (key)}
          <ToggleGroup.Item value={key}>
            <span>{words.decisions[key]}</span>
            {#if inGroup(key).length > 0}
              <span class="type-meta tabular-nums">{inGroup(key).length}</span>
            {/if}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>
    <div class="@min-desk/shell:hidden">
      {@render group(phoneGroup)}
    </div>
    <div
      class="hidden grid-cols-3 items-start gap-space-5 @min-desk/shell:grid"
    >
      {#each GROUPS as key (key)}
        {@render group(key)}
      {/each}
    </div>
  </div>
</ProjectFrame>
