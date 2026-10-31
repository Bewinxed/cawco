<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconChat, IconCloudCross, IconSearch } from "#lib/icons.js";
  import type { Standing, Thread } from "./model.js";
  import { byCost, clock } from "./model.js";
  import RowsLoading from "./RowsLoading.svelte";
  import ThreadRow from "./ThreadRow.svelte";
  import { SECTION, WORDS } from "./words.js";

  export type ListLoad = "ready" | "loading" | "unreachable" | "empty";
  export interface Strip {
    ahead: number;
    permissions: number;
    sessions: number;
    stopping: number;
  }

  /**
   * Who is asking: the figures for what waits (decisions and permission
   * asks as two figures), Open | All and search, then the asking sessions
   * in sections by what their delay costs, stopped longest first.
   */
  let {
    threads,
    filter = $bindable("open"),
    load = "ready",
    strip,
    decidedToday = 6,
    lastKnown = "2026-10-31T14:32:00Z",
    silent,
    current,
    narrow = false,
    resumed,
    onopen,
    onsearch,
  }: {
    threads: Thread[];
    filter?: string;
    load?: ListLoad;
    strip: Strip;
    decidedToday?: number;
    /** When the hub last answered, for the unreachable line. */
    lastKnown?: string;
    /** A machine that has not reported, and since when. */
    silent?: { machine: string; since: string };
    current?: string;
    narrow?: boolean;
    resumed?: string;
    onopen?: (id: string) => void;
    onsearch?: () => void;
  } = $props();

  const ORDER: Standing[] = ["stopped", "ahead", "quiet", "ended", "aside"];
  const shown = $derived(
    threads
      .filter((t) =>
        filter === "all"
          ? true
          : t.standing !== "quiet" && t.standing !== "ended"
      )
      .sort(byCost)
  );
  const sections = $derived(
    ORDER.map((standing) => ({
      standing,
      rows: shown.filter((t) => t.standing === standing),
    })).filter((s) => s.rows.length > 0)
  );
</script>

<div class="@container flex min-w-0 flex-col gap-space-5">
  <!-- What waits on him: decisions and permission asks, never one figure. -->
  <ul class="grid grid-cols-3 gap-x-space-4">
    {#if strip.stopping > 0}
      <li class="flex flex-col">
        <span class="type-title text-ink-stat tabular-nums"
          >{strip.stopping}</span
        >
        <span class="type-meta text-ink-muted"
          >{#if narrow}stop work{:else}stop work in <span class="tabular-nums"
              >{strip.sessions}</span
            > sessions{/if}</span
        >
      </li>
    {/if}
    {#if strip.ahead > 0}
      <li class="flex flex-col">
        <span class="type-title text-ink-stat tabular-nums">{strip.ahead}</span>
        <span class="type-meta text-ink-muted">went ahead</span>
      </li>
    {/if}
    {#if strip.permissions > 0}
      <li class="flex flex-col">
        <span class="type-title text-ink-stat tabular-nums"
          >{strip.permissions}</span
        >
        <span class="type-meta text-ink-muted"
          >{narrow
            ? "permission asks"
            : `permission asks, ${WORDS.permissionNote}`}</span
        >
      </li>
    {/if}
  </ul>

  {#if silent}
    <p class="type-meta text-pretty text-ink-muted">
      <span class="font-medium text-ink-strong">{silent.machine}</span> hasn't
      reported since {clock(silent.since)}: its sessions may be asking more.
    </p>
  {/if}

  <div
    class="flex min-w-0 flex-col gap-space-3 @kinds:flex-row @kinds:items-center"
  >
    <Tabs.Root bind:value={filter} class="shrink-0">
      <Tabs.List aria-label="Which threads">
        <Tabs.Trigger value="open">{WORDS.filterOpen}</Tabs.Trigger>
        <Tabs.Trigger value="all">{WORDS.filterAll}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <InputGroup.Root class="min-w-0 flex-1">
      <InputGroup.Addon>
        <IconSearch aria-hidden="true" />
      </InputGroup.Addon>
      <InputGroup.Input
        aria-label={WORDS.searchLabel}
        onfocus={onsearch}
        placeholder={WORDS.searchPlaceholder}
      />
    </InputGroup.Root>
  </div>

  {#if load === "unreachable"}
    <div
      class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-2 rounded-md bg-surface-recess px-space-3 py-space-2"
    >
      <IconCloudCross aria-hidden="true" class="size-icon-md text-ink-muted" />
      <p class="type-meta min-w-0 flex-1 text-pretty text-ink-strong">
        Can't reach the hub. This is what it last knew at {clock(lastKnown)}.
      </p>
      <Button data-box size="xs" variant="outline">{WORDS.tryAgain}</Button>
    </div>
  {/if}

  {#if load === "loading"}
    <RowsLoading />
  {:else if load === "empty"}
    <EmptyState
      icon={IconChat}
      line="{decidedToday} decided today. Every one is kept with its reason and the session that asked."
      title={WORDS.emptyTitle}
    >
      {#snippet action()}
        <Button onclick={onsearch} variant="outline">{WORDS.emptySearch}</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex min-w-0 flex-col gap-space-6">
      {#each sections as section (section.standing)}
        <section class="flex min-w-0 flex-col gap-space-1">
          <h3 class="type-caps px-space-3 pb-space-1 text-ink-muted">
            {SECTION[section.standing]}
          </h3>
          <ul class="flex min-w-0 flex-col">
            {#each section.rows as thread (thread.id)}
              <li class="min-w-0">
                <ThreadRow
                  current={current === thread.id}
                  {narrow}
                  onopen={() => onopen?.(thread.id)}
                  resumed={resumed === thread.id}
                  {thread}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</div>
