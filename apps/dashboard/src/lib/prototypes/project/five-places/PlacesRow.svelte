<script lang="ts">
  import { unhandled } from "@cawco/core/unhandled";
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * The row of five (desk) or the bottom bar (phone): the project's five
   * kinds of thing, each with its live mark, and nothing else ever added to
   * it. A mark is a dot beside the word and a count, never a fill: Tasks
   * and Decisions count what waits on the person beside the attn dot,
   * Routines shows the failed glyph, Outputs counts what is new, Caw says
   * his status as glyph and word. Caw is a pane, not a page: choosing him
   * keeps the page and marks him chosen while his pane is open. The items
   * are the platform's links and buttons, in the selected nav row's recipe
   * (DESIGN.md, Selected).
   */
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconBox,
    IconChat,
    IconClose,
    IconDecisions,
    IconRepeat,
    IconTaskList,
  } from "#lib/icons.js";
  import { type Read, waitsOf } from "./derive";
  import type { Place, ProjectRecords } from "./records";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    records,
    read,
    unread = [],
    place,
    caw,
    form,
    onplace,
  }: {
    records: ProjectRecords;
    read: Read;
    /** Places whose read failed: no mark, their page says why. */
    unread?: Place[];
    place: Place;
    /** Caw's pane is open. */
    caw: boolean;
    form: "row" | "bar";
    onplace: (place: Place) => void;
  } = $props();

  const waits = $derived(waitsOf(records));
  const failedRoutine = $derived(
    records.routines.some((routine) => routine.last?.outcome === "failed")
  );
  const fresh = $derived(
    records.outputs.filter((output) => output.isNew).length
  );

  const ITEMS = [
    { place: "tasks", Glyph: IconTaskList },
    { place: "routines", Glyph: IconRepeat },
    { place: "decisions", Glyph: IconDecisions },
    { place: "outputs", Glyph: IconBox },
    { place: "caw", Glyph: IconChat },
  ] as const;

  /** What the mark says, read out after the place's name. */
  const markWords = (at: Place): string | undefined => {
    if (unread.includes(at)) {
      return words.markUnread;
    }
    if (read !== "live") {
      return;
    }
    switch (at) {
      case "tasks":
        return waits.tasks > 0 ? words.markNeeds(waits.tasks) : undefined;
      case "routines":
        return failedRoutine ? words.markFailed : undefined;
      case "decisions":
        return waits.decisions > 0
          ? words.markNeeds(waits.decisions)
          : undefined;
      case "outputs":
        return fresh > 0 ? words.markNew(fresh) : undefined;
      case "caw":
        return words.cawStatus[records.caw.status];
      default:
        return unhandled("place", at);
    }
  };

  const countOf = (at: Place) => {
    if (at === "tasks") {
      return waits.tasks;
    }
    return at === "decisions" ? waits.decisions : 0;
  };
  const quiet = (at: Place) => read === "stale" || unread.includes(at);
</script>

{#snippet mark(at: Place)}
  {#if read === "loading"}
    <Skeleton cell="pin" radius="pill" />
  {:else if quiet(at)}
    <!-- Suppressed: no count claims anything while the hub is not live. -->
  {:else if countOf(at) > 0}
    <span
      aria-hidden="true"
      class="mark-line inline-flex items-center gap-space-1 type-meta text-status-attn-ink"
      data-box
    >
      <span
        class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
        data-box
      ></span>
      <span class="num">{countOf(at)}</span>
    </span>
  {:else if at === "routines" && failedRoutine}
    <IconClose
      aria-hidden="true"
      class="size-icon-sm flex-none text-status-fail-glyph"
    />
  {:else if at === "outputs" && fresh > 0}
    <span aria-hidden="true" class="type-meta text-ink-strong num"
      >{form === "row" ? words.markNew(fresh) : fresh}</span
    >
  {:else if at === "caw" && form === "row"}
    <span aria-hidden="true" class="inline-flex" data-box>
      <StatusGlyph small status={records.caw.status} />
    </span>
  {/if}
{/snippet}

<nav
  aria-label={words.placesLabel}
  class={form === "row"
    ? "flex min-w-0 items-center gap-space-1 overflow-x-auto"
    : "grid grid-cols-5 border-t border-border-hairline bg-material-panel glass-backdrop"}
>
  {#each ITEMS as item (item.place)}
    {@const said = markWords(item.place)}
    {@const name = words.places[item.place]}
    {@const chosen =
      item.place === "caw"
        ? caw
        : item.place === place && (form === "row" || !caw)}
    <button
      aria-current={item.place !== "caw" && chosen ? "page" : undefined}
      aria-label={said ? `${name}, ${said}` : name}
      aria-pressed={item.place === "caw" ? caw : undefined}
      class={form === "row"
        ? "press-tint mark-line touch-hit inline-flex h-c-btn-h-sm flex-none items-center gap-space-2 rounded-md px-space-3 type-label text-ink-muted transition-control can-hover:not-data-chosen:hover:bg-surface-hover can-hover:not-data-chosen:hover:text-ink-strong data-chosen:bg-selected-bg data-chosen:text-selected-ink"
        : "press-tint flex min-h-c-touch-floor flex-col items-center justify-center gap-space-row px-space-1 pt-space-2 pb-space-3 type-meta text-ink-muted data-chosen:text-selected-ink"}
      data-chosen={chosen || undefined}
      onclick={() => onplace(item.place)}
      type="button"
    >
      {#if form === "row"}
        <item.Glyph
          aria-hidden="true"
          class="size-icon-md flex-none"
          data-box
        />
        <span>{name}</span>
        {@render mark(item.place)}
      {:else}
        <span class="relative inline-flex" data-box>
          <item.Glyph aria-hidden="true" class="size-icon-lg" />
          {#if item.place === "caw" && read === "live" && records.caw.status === "working"}
            <span
              aria-hidden="true"
              class="absolute -end-space-1 -top-space-row size-(--status-dot-size) rounded-pill bg-status-live-glyph ring-(length:--status-dot-cut) ring-surface-raised breathe loops"
            ></span>
          {:else if item.place !== "caw"}
            <span class="absolute -end-space-3 -top-space-1 inline-flex">
              {@render mark(item.place)}
            </span>
          {/if}
        </span>
        <span>{name}</span>
      {/if}
    </button>
  {/each}
</nav>
