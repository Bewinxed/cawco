<script lang="ts">
  /**
   * The places find found in a conversation (conversation-find.svelte.ts):
   * whose words to keep, each with its count, then every place a row,
   * oldest first, the one stepped to chosen. Made of Jump's parts: its
   * who-said chips, its row (FindRow), its ghost and pill (highlight).
   *
   * On a desk it is the conversation's side panel's Find (SideSplit); narrow
   * it is the composer's layer (Composer), and a place picked folds it so
   * the place reads whole.
   *
   * Nothing found says so, with Jump's way to every session; a machine that
   * did not answer is named, with Retry, over the places in the turns
   * loaded; while the hub is asked and nothing loaded holds the words, the
   * list claims nothing (The Claim Of Nothing Rule).
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { findInWords } from "@cawco/core/words/find-in";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconSearch } from "#lib/icons.js";
  import type {
    ConversationFind,
    Place,
    WhoseFilter,
  } from "./conversation-find.svelte";
  import { jumpWith } from "./FinderCard.svelte";
  import FindRow from "./FindRow.svelte";
  import type { Row } from "./find-rows";

  let {
    find,
    narrow = false,
  }: {
    find: ConversationFind;
    /** The composer's layer: a pick folds it. */
    narrow?: boolean;
  } = $props();

  const agent = $derived(
    find.all.find((place) => place.whose === "agent")?.title ?? "Agent"
  );
  const FILTERS = $derived<{ value: WhoseFilter; label: string }[]>([
    { value: "all", label: findInWords.all },
    { value: "me", label: findInWords.me },
    { value: "agent", label: agent },
    { value: "tools", label: findInWords.tools },
    { value: "delegates", label: findInWords.delegates },
  ]);

  const rowOf = (place: Place): Row => {
    const words = place.excerpt.map((run) => run.text).join("");
    return {
      at: place.at,
      breathes: place.live,
      glyph: place.glyph,
      key: place.key,
      meta: [],
      reason: { source: "", parts: place.excerpt },
      secrets: [],
      spoken: `${place.title}, ${place.word}: ${words}`,
      state: { tone: place.live ? "live" : "quiet", word: place.word },
      title: place.title,
      titleParts: [{ matched: false, text: place.title }],
    };
  };
  const rows = $derived(find.places.map(rowOf));

  /** Known to hold nothing: nothing loaded holds the words, and the hub said none or cannot be heard. */
  const nothing = $derived(
    find.words.trim() !== "" && find.all.length === 0 && !find.asking
  );
  /** Asked and not answered, nothing loaded holding the words: the list waits at its size. */
  const waiting = $derived(find.all.length === 0 && find.asking);

  // Each step brings its row into view in the list.
  let list = $state<HTMLElement | null>(null);
  $effect(() => {
    const key = find.at;
    if (!(key && list)) {
      return;
    }
    untrack(() => {
      const row = list?.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(key)}"]`
      );
      if (row) {
        bringIntoView(row);
      }
    });
  });

  let now = $state(Date.now());
  $effect(() => {
    const clock = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(clock);
  });
</script>

<div
  data-slot="find-places"
  data-narrow={narrow || undefined}
  class="group/places flex min-h-0 flex-auto flex-col"
>
  {#if nothing}
    <div class="px-space-4 py-space-6 group-data-narrow/places:py-space-4">
      <EmptyState
        icon={IconSearch}
        inline={!narrow}
        line={find.hub.kind === "unreached"
          ? findInWords.unreached(find.hub.machine)
          : findInWords.nothingLine}
        title={findInWords.nothingTitle(find.words.trim())}
      >
        {#snippet action()}
          {#if find.hub.kind === "unreached"}
            <Button onclick={() => find.retry()} size="sm" variant="outline"
              >{findInWords.retry}</Button
            >
          {:else}
            <Button
              onclick={() => jumpWith(find.words.trim())}
              size="sm"
              variant="outline">{findInWords.everywhere}</Button
            >
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div
      class="flex flex-none flex-wrap items-center gap-space-1 px-space-3 pt-space-2 pb-space-2"
      role="toolbar"
      aria-label={findInWords.whose}
    >
      {#each FILTERS as one (one.value)}
        {@const count = find.counts[one.value]}
        <button
          class="group/chip select-none inline-flex items-center gap-space-2 h-c-pill-h px-space-3 border border-border-control rounded-pill bg-surface-raised type-label text-ink-muted transition-property-[background-color,color,border-color] motion-safe:transition-property-[background-color,color,border-color,scale] aria-pressed:border-transparent aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover motion-safe:active:scale-(--press-scale) disabled:opacity-50"
          aria-pressed={find.whose === one.value}
          disabled={count === 0 && one.value !== "all"}
          onclick={() => find.filter(one.value)}
          type="button"
          >{one.label}{#if count > 0}<span
              class="num font-normal text-ink-subtle group-aria-pressed/chip:text-brand-ink"
              >{count}</span
            >{/if}</button
        >
      {/each}
    </div>
    {#if find.hub.kind === "unreached" || find.hub.kind === "refused"}
      <p
        class="m-0 flex flex-none flex-wrap items-baseline gap-x-space-2 px-space-4 pb-space-2 type-meta text-ink-muted"
        role="status"
      >
        <span
          >{find.hub.kind === "unreached"
            ? findInWords.unreached(find.hub.machine)
            : findInWords.refused(find.hub.detail)}</span
        >
        <button
          class="select-none border-none p-0 bg-transparent text-link-ink active:opacity-72"
          onclick={() => find.retry()}
          type="button">{findInWords.retry}</button
        >
      </p>
    {/if}
    {#if waiting}
      <div class="flex flex-col gap-space-2 px-space-3 py-space-2" aria-busy="true">
        {#each [0, 1, 2] as n (n)}
          <Skeleton height="reason-row" />
        {/each}
      </div>
    {:else}
      <div
        class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain p-space-1 pt-0"
        aria-label={findInWords.places}
        role="listbox"
        bind:this={list}
        {@attach highlight({ rows: "[data-find-row]", hovered: "[data-active]" })}
      >
        {#each rows as row (row.key)}
          <FindRow
            active={row.key === find.at}
            id={`place-${find.viewId}-${row.key}`}
            {now}
            onpick={() => find.pick(row.key, narrow)}
            {row}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>
