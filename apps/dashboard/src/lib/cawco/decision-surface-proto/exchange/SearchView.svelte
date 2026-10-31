<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconChevronLeft, IconHistory, IconSearch } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { clock, day } from "./model.js";
  import { RETINT } from "./motion.js";
  import RowsLoading from "./RowsLoading.svelte";
  import type { Found } from "./records.js";
  import { WORDS } from "./words.js";

  export type SearchLoad = "ready" | "searching" | "failed";

  /**
   * Search across every thread's asks, picks and reasons: the field, Open |
   * Decided and three filters, then results with the matched words marked.
   * A result opens its thread at that message.
   */
  let {
    query: queryArg = "",
    records,
    filter = $bindable("decided"),
    load = "ready",
    chosen,
    onback,
    onresult,
  }: {
    query?: string;
    records: Found[];
    filter?: string;
    load?: SearchLoad;
    /** The result whose thread is open beside the list. */
    chosen?: string;
    onback?: () => void;
    onresult?: (id: string) => void;
  } = $props();

  const SPACE = /\s+/u;
  const SPECIAL = /[.*+?^${}()|[\]\\]/gu;

  let query = $derived(queryArg);
  const words = $derived(
    query
      .toLowerCase()
      .split(SPACE)
      .filter((w) => w.length > 1)
  );
  const hits = $derived(
    words.length === 0
      ? records
      : records.filter((r) =>
          words.every((w) =>
            `${r.question} ${r.chosen} ${r.note ?? ""}`
              .toLowerCase()
              .includes(w)
          )
        )
  );

  /** The text split into runs, each marked when it is a searched word. */
  function runs(text: string): { text: string; hit: boolean }[] {
    if (words.length === 0) {
      return [{ text, hit: false }];
    }
    const escaped = words.map((w) => w.replace(SPECIAL, "\\$&"));
    const pattern = new RegExp(`(${escaped.join("|")})`, "giu");
    return text
      .split(pattern)
      .filter(Boolean)
      .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
  }
</script>

{#snippet marked(text: string)}
  {#each runs(text) as run, i (i)}{#if run.hit}<mark
        class="rounded-hair bg-selection text-inherit">{run.text}</mark
      >{:else}{run.text}{/if}{/each}
{/snippet}

<div class="@container flex min-w-0 flex-col gap-space-5">
  <div class="flex min-w-0 items-center gap-space-2">
    {#if onback}
      <Button
        aria-label={WORDS.backToThreads}
        icon={IconChevronLeft}
        onclick={onback}
        size="icon-sm"
        title={WORDS.backToThreads}
        variant="ghost"
      />
    {/if}
    <InputGroup.Root class="min-w-0 flex-1">
      <InputGroup.Addon>
        <IconSearch aria-hidden="true" />
      </InputGroup.Addon>
      <InputGroup.Input
        aria-label={WORDS.searchLabel}
        bind:value={query}
        placeholder={WORDS.searchPlaceholder}
      />
    </InputGroup.Root>
  </div>

  <div class="flex min-w-0 flex-wrap items-center gap-space-2">
    <Tabs.Root bind:value={filter}>
      <Tabs.List aria-label="Open or decided">
        <Tabs.Trigger value="open">{WORDS.filterOpen}</Tabs.Trigger>
        <Tabs.Trigger value="decided">{WORDS.filterDecided}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <NativeSelect aria-label="Project" measure="shrink">
      <NativeSelectOption value="all">Every project</NativeSelectOption>
      <NativeSelectOption value="cawco-dev">Cawco-Dev</NativeSelectOption>
      <NativeSelectOption value="anbar">Anbar</NativeSelectOption>
    </NativeSelect>
    <NativeSelect aria-label="Kind" measure="shrink">
      <NativeSelectOption value="all">Every kind</NativeSelectOption>
      <NativeSelectOption value="scope">Scope</NativeSelectOption>
      <NativeSelectOption value="behaviour">Behaviour</NativeSelectOption>
      <NativeSelectOption value="approach">Approach</NativeSelectOption>
      <NativeSelectOption value="rules">Rules</NativeSelectOption>
    </NativeSelect>
    <NativeSelect aria-label="Who settled" measure="shrink">
      <NativeSelectOption value="all">Anyone settled</NativeSelectOption>
      <NativeSelectOption value="you">You</NativeSelectOption>
      <NativeSelectOption value="advisor">An advisor</NativeSelectOption>
      <NativeSelectOption value="practice">Common practice</NativeSelectOption>
    </NativeSelect>
  </div>

  {#if load === "searching"}
    <RowsLoading />
  {:else if load === "failed"}
    <div class="flex flex-col items-start gap-space-3">
      <p class="type-body text-pretty text-ink-strong">
        {WORDS.searchFailed}: the hub answered (502). The records are safe in
        Cawco-Dev's folder.
      </p>
      <Button size="sm" variant="outline">{WORDS.tryAgain}</Button>
    </div>
  {:else if records.length === 0}
    <EmptyState
      icon={IconHistory}
      line={WORDS.nothingDecidedBody}
      title={WORDS.nothingDecided}
    >
      {#snippet action()}
        <Button onclick={onback} variant="outline">See who is asking</Button>
      {/snippet}
    </EmptyState>
  {:else if hits.length === 0}
    <EmptyState
      icon={IconSearch}
      line="Try the words of an option you chose, or clear the filters."
      title="Nothing matches '{query}'"
    >
      {#snippet action()}
        <Button
          onclick={() => {
            query = "";
          }}
          variant="outline">Clear the search</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    <section class="flex min-w-0 flex-col gap-space-1" aria-label="Results">
      <h3 class="type-caps px-space-3 pb-space-1 text-ink-muted">
        <span class="tabular-nums">{hits.length}</span> decided
      </h3>
      <ul class="flex min-w-0 flex-col">
        {#each hits as r (r.id)}
          <li class="min-w-0">
            <button
              class={cn(
                RETINT,
                "press-tint flex w-full min-w-0 flex-col gap-space-1 rounded-md px-space-3 py-space-3 text-start hover:bg-surface-hover",
                chosen === r.id && "bg-surface-fill hover:bg-surface-fill"
              )}
              aria-current={chosen === r.id ? "true" : undefined}
              onclick={() => {
                onresult?.(r.id);
              }}
              type="button"
            >
              <span class="type-meta text-ink-muted tabular-nums"
                >{day(r.at)}, {clock(r.at)} · {r.by}</span
              >
              <span class="type-body line-clamp-2 text-pretty text-ink-muted"
                >{@render marked(r.question)}</span
              >
              <span class="type-label text-pretty text-ink-row"
                >{@render marked(r.chosen)}</span
              >
              <span class="type-meta truncate text-ink-muted"
                >{r.session} · {r.project}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
