<script lang="ts">
  /**
   * The places find found in a conversation (conversation-find.svelte.ts):
   * whose words to keep, each with its count, then every place a row,
   * oldest first, the one stepped to chosen. Made of Jump's parts: its
   * who-said chips, its row (FindRow), its ghost and pill (highlight).
   *
   * It is the composer's layer (FindLayer), at every width. Where it is a
   * phone's or a narrow panel's width (`compact`), its rows wrap as Jump's
   * phone rows do, and a place picked folds it so the place reads whole.
   *
   * Nothing found says so, with Jump's way to every session; a machine that
   * did not answer is named, with Retry, over the places in the turns
   * loaded; while the hub is asked and nothing loaded holds the words, the
   * list claims nothing (The Claim Of Nothing Rule).
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { unhandled } from "@cawco/core/unhandled";
  import { findInWords } from "@cawco/core/words/find-in";
  import { findSecretWords } from "@cawco/core/words/find-secrets";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconSearch } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { barGlass } from "../bar-glass.svelte";
  import { TURN_CLOCK } from "../turn/clock";
  import type {
    Place,
    PlacesView,
    WhoseFilter,
  } from "./conversation-find.svelte";
  import FindRow from "./FindRow.svelte";
  import { type Row, secretsIn } from "./find-rows";

  let {
    find,
  }: {
    find: PlacesView;
  } = $props();

  const agent = $derived(find.agent);
  const FILTERS = $derived<{ value: WhoseFilter; label: string }[]>([
    { value: "all", label: findInWords.all },
    { value: "me", label: findInWords.me },
    { value: "agent", label: agent },
    { value: "tools", label: findInWords.tools },
    { value: "delegates", label: findInWords.delegates },
  ]);

  const rowOf = (place: Place): Row => {
    const words = place.excerpt
      .map((run) => (run.secret ? findSecretWords.hidden : run.text))
      .filter(
        (text, i, all) =>
          !(text === findSecretWords.hidden && all[i - 1] === text)
      )
      .join("");
    return {
      at: place.at,
      // The time as the turn it points at shows it.
      clock: place.at === null ? undefined : TURN_CLOCK.format(place.at),
      breathes: place.live,
      glyph: place.glyph,
      key: place.key,
      meta: [],
      reason: { source: "", parts: place.excerpt },
      secrets: secretsIn(place.excerpt),
      spoken: [place.title, place.word, words].filter(Boolean).join(", "),
      state: { tone: place.live ? "live" : "quiet", word: place.word },
      title: place.title,
      titleParts: [{ matched: false, text: place.title }],
    };
  };
  const rows = $derived(find.places.map(rowOf));
  /** The secrets the person showed, by key; the rest are drawn as dots (Find's "Hide secrets"). */
  const shown = new SvelteSet<string>();

  /**
   * Why the hub's places are missing, and whether asking again can help:
   * a machine that did not answer or a refusal may answer next time; an
   * agent too old for the read answers only once it is updated.
   */
  const fault = $derived.by((): { retries: boolean; words: string } | null => {
    const { hub } = find;
    switch (hub.kind) {
      case "unreached":
        return { retries: true, words: findInWords.unreached(hub.machine) };
      case "outdated":
        return { retries: false, words: findInWords.outdated(hub.machine) };
      case "refused":
        return { retries: true, words: findInWords.refused(hub.detail) };
      case "answered":
      case "asking":
      case "idle":
        return null;
      default:
        return unhandled("hub read", hub);
    }
  });

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
    // After the frame the list is laid out in: opened again, its
    // height is set by then.
    const frame = requestAnimationFrame(() =>
      untrack(() => {
        const row = list?.querySelector<HTMLElement>(
          `[data-key="${CSS.escape(key)}"]`
        );
        if (row) {
          bringIntoView(row);
        }
      })
    );
    return () => cancelAnimationFrame(frame);
  });

  /** A press here keeps the find field's caret where it is (the composer's controls do the same). */
  function keepField(event: MouseEvent): void {
    if (
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.closest('[data-slot="find-line"]')
    ) {
      event.preventDefault();
    }
  }

  /**
   * The width under which the places are a phone's (a phone, Caw's panel):
   * rows wrap, and a pick folds the list. Jump's phone sheet's own line
   * (Finder) and ours.
   */
  const COMPACT_PX = 480;
  let compact = $state(false);

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
  data-compact={compact || undefined}
  class="group/places flex min-h-0 flex-auto flex-col"
  {@attach frameSize(
    (node: HTMLElement) => node.offsetWidth < COMPACT_PX,
    (value) => {
      compact = value;
    }
  )}
>
  {#if nothing}
    <div class="px-space-4 py-space-6 group-data-compact/places:py-space-4">
      <EmptyState
        icon={IconSearch}
        inline={!compact}
        line={fault?.words}
        title={findInWords.nothingTitle(find.words.trim())}
      >
        {#snippet action()}
          {#if fault?.retries}
            <Button onclick={() => find.retry()} size="sm" variant="outline"
              >{findInWords.retry}</Button
            >
          {:else}
            <Button
              onclick={() => {
                // Handed to Jump: this conversation's find closes, so one
                // find stands at a time.
                const words = find.words.trim();
                find.close();
                barGlass.jumpWith(words);
              }}
              size="sm"
              variant="outline">{findInWords.everywhere}</Button
            >
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <!-- A press on a filter or a place leaves the caret in the find field,
         so Enter steps on from where the press landed. -->
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
          onmousedown={keepField}
          type="button"
          >{one.label}{#if count > 0}<span
              class="num font-normal text-ink-subtle group-aria-pressed/chip:text-brand-ink"
              >{count}</span
            >{/if}</button
        >
      {/each}
    </div>
    {#if fault}
      <p
        class="m-0 flex flex-none flex-wrap items-baseline gap-x-space-2 px-space-4 pb-space-2 type-meta text-ink-muted"
        role="status"
      >
        <span>{fault.words}</span>
        {#if fault.retries}
          <button
            class="select-none border-none p-0 bg-transparent text-link-ink active:opacity-72"
            onclick={() => find.retry()}
            type="button">{findInWords.retry}</button
          >
        {/if}
      </p>
    {/if}
    {#if waiting}
      <div
        class="flex flex-col gap-space-2 px-space-3 py-space-2"
        aria-busy="true"
      >
        {#each [0, 1, 2] as n (n)}
          <Skeleton height="reason-row" />
        {/each}
      </div>
    {:else}
      <div
        class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain p-space-1 pt-0"
        aria-label={findInWords.places}
        onmousedown={keepField}
        role="listbox"
        bind:this={list}
        {@attach highlight({
          rows: "[data-find-row]",
          hovered: "[data-active]",
        })}
      >
        {#each rows as row (row.key)}
          <FindRow
            active={row.key === find.at}
            id={`place-${find.viewId}-${row.key}`}
            {now}
            onpick={() => find.pick(row.key, compact)}
            onsecret={(key) => shown.add(key)}
            phone={compact}
            {row}
            {shown}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>
