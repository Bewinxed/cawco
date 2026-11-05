<script lang="ts">
  import type { Pin } from "@cawco/core/comments";
  import { parse } from "@cawco/core/find-match";
  import { pinName } from "@cawco/core/pin-name";
  import { artifactWords as words } from "@cawco/core/words/artifacts";
  /**
   * The Comments rail (the artifact panel's surface brief, The Comments rail): beside the page on a
   * desk, the head's Comments its pressed toggle (its one way shut there),
   * the page narrowed to meet it; on a phone, or a pane under 640px, the
   * well's bottom sheet (PreviewPane, ThreadSheet's drawer: a grabber, half
   * its room and the whole room), shut by its Close, a drag down or
   * Comments, never by a press outside.
   *
   * Its bar is one row (The Title Bars Follow Liquid Glass Rule; HIG,
   * Toolbars, Item groupings), the same pattern as the panel's head above
   * it: leading, on the phone's sheet only, Close in its own glass (HIG,
   * Sheets: a single-view sheet's Cancel leads), then the title, the list
   * in front with its count (To check, Open or Resolved), a title menu
   * (HIG, Toolbars: "Next to the title, the toolbar can include a document
   * menu") choosing the list and the order, hung from the title as one
   * shape with it (BarMenu); trailing, one glass of bare symbols: Search and
   * a comment on the whole page. A row of tabs under the bar would be a
   * second row, and three tabs with their counts and the glass take more
   * than the rail's 320px. While To check holds comments and another list
   * is in front, the title wears the needs-you dot. Search (or `/`) turns
   * the bar into the search field and its Close (HIG, Search fields: in a
   * top toolbar search "appears as a toolbar button. When someone taps it,
   * it animates into a search field"): Find's engine, core find-match, over
   * each comment's number, words, place and state; Esc clears it, and Esc
   * on an empty field or its Close folds it back.
   * Then the rows, newest first
   * by last activity (or top of page first), each one press in up to four
   * lines (The Row Dress Rule): the same pill as on the page in its mark
   * cell; the place, its name in label at 500 in the row ink and its age at
   * the line's end in meta; the words in body, two lines at most; what it
   * carries as a strip of 20px thumbs, four at most, then "+N"; what came
   * back in meta, after its speaker's glyph (the agent's ghost in the line's
   * ink, the person's in the brand ink), in the strong ink while unread
   * (while the agent works on it, the pill's live dot says so and the line
   * keeps what was said last: The Row Dress Rule), "Not sent: why" in the
   * fail ink when its delivery reached no one or it stands only on the page,
   * and nothing for a comment sent and unanswered (its filled pill says so).
   * A comment goes to the session by itself once written; one not sent has
   * Try again under its row's end, on a desk and under a finger alike. On
   * hover or focus the age gives way to Resolve; none under a finger.
   *
   * Until the pane holds the doc nothing is counted or claimed empty (The
   * Claim Of Nothing Rule): the rows' plain surface inside
   * `--dur-wait-grace` (The Real Wait Rule), then skeleton rows, which the
   * first read replaces in one cross-fade; or the read's fault on its line
   * with Try again (RowFault). While a link of the comments' stands lost the
   * same fault line stands over the rows, which keep their last read.
   */
  import { commentWords as said } from "@cawco/core/words/comments";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import RegionBoundary from "#lib/cawco/RegionBoundary.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
    BarPopover,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconAgent,
    IconChevronDown,
    IconClose,
    IconDocument,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSuccess,
    IconUser,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import {
    dur,
    easeOut,
    motionOk,
    reveal,
    revealOut,
  } from "../motion/curves.svelte";
  import { LINK_DROPPED, type ListHold } from "./artifact-doc";
  import {
    attachedTo,
    lastActivity,
    type RailSort,
    STRIP,
    searched,
    sortedPins,
  } from "./comment-rows";
  import PinMark, { markState } from "./PinMark.svelte";

  let {
    pins,
    hold,
    down,
    open: current,
    focused,
    live,
    unread,
    retrying = new Set(),
    layout = "beside",
    onopen,
    onhover,
    onretry,
    onclose,
    onpage,
    pageOpen = false,
    onpageclose,
    pageComposer,
    onresolve,
    onretrypin,
    onshown,
    whyNotSent = () => null,
    checks,
    filter = $bindable("open"),
    sort = $bindable("newest"),
    scroll = $bindable(0),
  }: {
    pins: Pin[];
    /** Whether the pins are read yet (artifact-doc.ts `ListHold`). */
    hold: ListHold;
    /** What closed the comments' link to the hub, word for word, while it stands lost; null while they reach it. */
    down: string | null;
    /** The comment whose thread is open: its row is pressed. */
    open: string | null;
    /** The comment J and K stand on. */
    focused: string | null;
    /** Comments the agent is working on now. */
    live: ReadonlySet<string>;
    /** Comments with an answer the person hasn't read. */
    unread: ReadonlySet<string>;
    /** The comments whose Try again is on its way. */
    retrying?: ReadonlySet<string>;
    /** Beside the page, or the well's foot sheet. */
    layout?: "beside" | "sheet";
    /** Opens a comment's thread; `via` says whether a key or a press opened it. */
    onopen: (id: string, via: "key" | "pointer") => void;
    /** The pointer or the keyboard rests on a comment's row (its element chosen on the page), or leaves it (null). */
    onhover: (id: string | null) => void;
    onretry: () => void;
    onclose: () => void;
    /** A comment on the whole page: its composer opens. */
    onpage: () => void;
    /**
     * Beside the page: the whole-page comment's composer stands, hung from
     * the glass its + is in (BarPopover), never far from it over the page.
     */
    pageOpen?: boolean;
    /** That composer put away (Escape, a press outside it). */
    onpageclose?: () => void;
    /** That composer, as the pane draws it. */
    pageComposer?: Snippet;
    onresolve: (id: string, resolved: boolean) => void;
    /** A comment not sent, tried again: it goes to the session once more. */
    onretrypin: (id: string) => void;
    /** The rows as drawn, by pin id, in the tab in front and its order. */
    onshown?: (ids: string[]) => void;
    /** Why a comment hasn't reached the session, in words, when its delivery reached no one or it stands only on the page; null while it is on its way. */
    whyNotSent?: (pin: Pin) => string | null;
    /**
     * What to check since he looked (the owner's pick, B: the rail as the
     * inbox): a first tab, To check, its rows the comments whose elements
     * changed, in the check order (answered, then changed with no answer),
     * each with what changed under it (`changes`), then what changed under
     * no comment (`unasked`, none when nothing did) as the last row.
     */
    checks?: {
      count: number;
      pins: string[];
      changes: Snippet<[Pin]>;
      unasked: Snippet | null;
    };
    filter?: "check" | "open" | "resolved";
    sort?: RailSort;
    scroll?: number;
  } = $props();

  /** No Resolve on a row under a finger. */
  const coarse = new MediaQuery("(pointer: coarse)");

  let query = $state("");
  /** What the rows are searched for: the query once it has rested `--dur-control`. */
  let asked = $state("");
  $effect(() => {
    const now = query;
    const wait = setTimeout(
      () => {
        asked = now;
      },
      now ? dur("--dur-control") : 0
    );
    return () => clearTimeout(wait);
  });
  let searchField = $state<HTMLInputElement | null>(null);
  /** The bar is the search field: Search pressed, or `/`. */
  let searching = $state(false);
  let searchButton = $state<HTMLElement | null>(null);
  /** `/` from the pane, or Search: the bar becomes the field, and it takes the keyboard. */
  export function focusSearch() {
    searching = true;
  }
  // The field takes the keyboard as it stands in the bar.
  $effect(() => {
    if (searching && searchField) {
      searchField.focus();
    }
  });
  /** The field folds back into its symbol, which takes the keyboard back. */
  function closeSearch() {
    query = "";
    searching = false;
    requestAnimationFrame(() => searchButton?.focus());
  }

  const openPins = $derived(pins.filter((pin) => !pin.resolvedAt));
  const resolvedPins = $derived(pins.filter((pin) => !!pin.resolvedAt));
  /** A comment waiting on him: an answer he hasn't read. */
  const waitsOnYou = (pin: Pin) => unread.has(pin.id) && !live.has(pin.id);
  /** A list in its order, what waits on him first (his job here is to find and answer it). */
  const waitingFirst = (list: Pin[]) => [
    ...list.filter(waitsOnYou),
    ...list.filter((pin) => !waitsOnYou(pin)),
  ];
  /**
   * A search looks in every list, never the one in front alone, and its hits
   * stand under the name of the list each is in (Open, Resolved), so a hit
   * is never hidden behind a list he isn't on.
   */
  const searchedGroups = $derived(
    asked.trim()
      ? [
          {
            value: "open" as const,
            name: said.open,
            pins: searched(sortedPins(openPins, sort), asked),
          },
          {
            value: "resolved" as const,
            name: said.resolved,
            pins: searched(sortedPins(resolvedPins, sort), asked),
          },
        ].filter((group) => group.pins.length > 0)
      : null
  );
  const shown = $derived.by(() => {
    if (searchedGroups) {
      return searchedGroups.flatMap((group) => group.pins);
    }
    if (filter === "check" && checks) {
      return checks.pins.flatMap((id) => pins.filter((pin) => pin.id === id));
    }
    return waitingFirst(
      sortedPins(filter === "open" ? openPins : resolvedPins, sort)
    );
  });
  const failed = $derived(typeof hold === "object" ? hold.failed : null);
  /** A list's count once the pins are read, and only above 0 (The Earned Count Rule). */
  const counted = (count: number) =>
    hold === "ready" && count > 0 ? count : null;
  /** Each list the title menu chooses: its name and its count. */
  const lists = $derived([
    ...(checks
      ? [{ value: "check" as const, name: said.toCheck, count: checks.count }]
      : []),
    { value: "open" as const, name: said.open, count: openPins.length },
    {
      value: "resolved" as const,
      name: said.resolved,
      count: resolvedPins.length,
    },
  ]);
  const inFront = $derived(
    lists.find((one) => one.value === filter) ?? lists[0]
  );
  /** To check holds comments while another list is in front: the title's dot says so. */
  const waiting = $derived(
    checks && filter !== "check" && hold === "ready" && checks.count > 0
      ? checks.count
      : 0
  );
  /** The query's words, for the matching words a row marks. */
  const marked = $derived(parse(asked).tokens);

  /*
   * The focused comment's own filter shows, so J and K never land on a
   * hidden row: as the focus moves to a comment (a key, a press on its pill
   * or its chip, an address). One To check holds keeps To check; its row
   * leaving To check (looked at) leaves the tab where it is. A comment
   * resolved or reopened moves no tab: the focus moves instead (below).
   */
  let toldFor: string | null = null;
  /** The rail as it mounts (a phone's sheet standing back after a thread): its tab is what it was, To check included. */
  let mounting = true;
  $effect(() => {
    const pin = pins.find((one) => one.id === focused);
    const state = pin ? pin.id : null;
    const first = mounting;
    mounting = false;
    if (!pin || state === toldFor) {
      return;
    }
    toldFor = state;
    untrack(() => {
      if (first && filter === "check") {
        return;
      }
      if (!(filter === "check" && checks?.pins.includes(pin.id))) {
        filter = pin.resolvedAt ? "resolved" : "open";
      }
    });
  });

  /*
   * The rows as drawn, in the tab in front and its order, told to the pane
   * (`onshown`): a comment resolved or reopened there leaves the tab, and the
   * focus moves to the row after it in that order (PreviewPane `focusPast`),
   * never the tab. The tab they were drawn in is kept, so a row leaving
   * because its tab changed goes at once (`rowOut`).
   */
  let tabWas: typeof filter = untrack(() => filter);
  $effect(() => {
    const now = shown.map((pin) => pin.id);
    const front = filter;
    untrack(() => {
      tabWas = front;
      onshown?.(now);
    });
  });

  /**
   * A row leaving the tab in front of him folds shut as it fades, over
   * `--dur-exit` on `--ease-out`; with less motion it fades. One that goes
   * with its tab (another tab chosen) goes at once.
   */
  function rowOut(node: HTMLElement) {
    if (filter !== tabWas) {
      return { duration: 0 };
    }
    const height = node.offsetHeight;
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: motionOk.current
        ? (t: number) =>
            `opacity: ${t}; height: ${t * height}px; overflow: clip`
        : (t: number) => `opacity: ${t}`,
    };
  }

  /** The rows come back where they were read: the rail shut and open again keeps its scroll. */
  const keepScroll = (read: HTMLElement) => {
    if (read.parentElement) {
      read.parentElement.scrollTop = untrack(() => scroll);
    }
  };

  /**
   * A row's words, each word of the query marked in the selection ink: the
   * runs between the hits joined into one text each, so the row's name reads
   * as its words do, spaces and all.
   */
  const WORD_AT = /([\p{L}\p{N}]+)/u;
  const segments = (text: string) => {
    if (marked.length === 0) {
      return [{ text, hit: false }];
    }
    const runs: { text: string; hit: boolean }[] = [];
    for (const part of text.split(WORD_AT).filter(Boolean)) {
      const hit = marked.some((word) => part.toLowerCase().startsWith(word));
      const last = runs.at(-1);
      if (last && !last.hit && !hit) {
        last.text += part;
      } else {
        runs.push({ text: part, hit });
      }
    }
    return runs;
  };

  /** Where the query's first word starts in `text`, as a row marks it (a word starting with it); -1 for none. */
  const firstHit = (text: string): number => {
    let at = 0;
    for (const part of text.split(WORD_AT)) {
      if (marked.some((word) => part.toLowerCase().startsWith(word))) {
        return at;
      }
      at += part.length;
    }
    return -1;
  };
  /** How far into a line a match may stand before the line starts near it instead, characters. Our call: under a line of the rail. */
  const HIT_LEAD = 40;
  /** `text`, starting a few words before its first match when that stands further in than a clamped line shows. */
  const aroundHit = (text: string): string => {
    const at = firstHit(text);
    if (at <= HIT_LEAD) {
      return text;
    }
    const from = text.lastIndexOf(" ", at - HIT_LEAD / 2);
    return `…${text.slice(from > 0 ? from + 1 : at)}`;
  };
  /**
   * What a row's words line says: the comment's first words, or, while a
   * search finds the comment by words further in (in them past what two
   * lines show, or in a reply), the passage holding the first match, so
   * every row a search shows marks what it was found by.
   */
  const wordsOf = (pin: Pin, first: string): string => {
    if (marked.length === 0) {
      return first;
    }
    if (firstHit(first) >= 0) {
      return aroundHit(first);
    }
    const holding = pin.thread.find((entry) => firstHit(entry.text) >= 0);
    return holding ? aroundHit(holding.text) : first;
  };

  /** A pill's dot: the agent at work on it, else an answer unread, else none. */
  const dotOf = (pin: Pin): "live" | "unread" | null => {
    if (live.has(pin.id)) {
      return "live";
    }
    return unread.has(pin.id) ? "unread" : null;
  };

  /** A part's ink: its own dress, or `selected-ink` on the selection wash. */
  const ink = (washed: boolean, own: string) =>
    washed ? "text-selected-ink" : own;

  /** What a row says on its line 3, if anything. */
  const backOf = (pin: Pin) => {
    const why = markState(pin) === "unsent" ? whyNotSent(pin) : null;
    if (why) {
      return { kind: "notSent" as const, why };
    }
    const last = pin.thread.length > 1 ? pin.thread.at(-1) : undefined;
    if (!last) {
      return null;
    }
    const text =
      last.text.split("\n")[0]?.trim() ||
      (last.attachments ?? []).map((one) => one.name).join(", ");
    return {
      kind: "said" as const,
      by: last.by === "agent" ? ("agent" as const) : ("you" as const),
      text,
      unread: last.by === "agent" && unread.has(pin.id),
    };
  };
</script>

<!-- One comment that throws as it is drawn fails as one line in its place;
     the comments round it stand (RegionBoundary). -->
{#snippet boundedRow(pin: Pin)}
  <RegionBoundary as="li" face="line" part="comment">
    {@render row(pin)}
  </RegionBoundary>
{/snippet}

{#snippet row(pin: Pin)}
  {@const attached = attachedTo(pin)}
  {@const back = backOf(pin)}
  {@const gone = !!pin.movedAt}
  {@const washed = pin.id === current}
  {@const firstWords =
    pin.thread[0]?.text.trim() || attached.map((one) => one.name).join(", ")}
  <li class="group/row relative" out:rowOut>
    <!-- The row is the comment and the press that opens its thread; Resolve
         stands over its end. On the selection wash (its thread open) every
         word is `selected-ink` (DESIGN.md, Colors: Selected); off it, each
         part wears its dress (The Row Dress Rule). -->
    <button
      data-slot="pin-row"
      aria-current={washed || undefined}
      data-focused={pin.id === focused || undefined}
      data-moved={gone || undefined}
      class="flex items-start gap-space-3 w-full min-h-c-artifact-row-h px-space-2 py-space-2 border-none rounded-sm bg-transparent text-start transition-[background-color] duration-(--dur-control) ease-out not-active:not-aria-current:hover:bg-surface-hover active:not-aria-current:bg-surface-pressed aria-current:bg-selected-bg focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
      data-pin-row={pin.number}
      onblur={() => onhover(null)}
      onclick={(event) =>
        onopen(pin.id, event.detail === 0 ? "key" : "pointer")}
      onfocus={() => onhover(pin.id)}
      onpointerenter={() => onhover(pin.id)}
      onpointerleave={() => onhover(null)}
      type="button"
    >
      <!-- The pill's cell holds a three-figure pill, so every row's words start at one x. -->
      <span
        class="mark-cell w-c-pin-cell-w flex-none justify-start justify-items-start"
      >
        <PinMark
          dot={dotOf(pin)}
          {gone}
          number={pin.number}
          state={markState(pin)}
        />
        <!-- A new answer is said in words on the row's last line. -->
        {#if dotOf(pin) === "live"}<span class="sr-only">{said.working}</span
          >{/if}
      </span>
      <span class="flex flex-1 min-w-0 flex-col">
        <span class="flex min-w-0 items-baseline gap-space-2" data-line="place">
          <span
            data-slot="title"
            class={[
              "min-w-0 truncate type-label font-medium",
              ink(washed, gone ? "text-ink-subtle" : "text-ink-row"),
            ]}
            >{#each segments(gone ? said.elementGone : pinName(pin)) as part, at (at)}{#if part.hit}<mark
                  class="bg-selection text-inherit rounded-xs">{part.text}</mark
                >{:else}{part.text}{/if}{/each}</span
          >
          <span
            data-slot="age"
            class={[
              "ms-auto flex-none type-meta num transition-opacity duration-(--dur-control) ease-out not-coarse:group-hover/row:opacity-0 not-coarse:group-focus-within/row:opacity-0",
              ink(washed, "text-ink-muted"),
            ]}>{formatAgeShort(Date.parse(lastActivity(pin)))}</span
          >
        </span>
        {#if firstWords}
          <span
            data-line="words"
            class={[
              "mt-space-row line-clamp-2 type-body text-pretty wrap-anywhere",
              ink(washed, "text-ink-strong"),
            ]}
            >{#each segments(wordsOf(pin, firstWords)) as part, at (at)}{#if part.hit}<mark
                  class="bg-selection text-inherit rounded-xs">{part.text}</mark
                >{:else}{part.text}{/if}{/each}</span
          >
        {/if}
        {#if attached.length > 0}
          <!-- mark-line: a strip of thumbs and one count, no words beside a mark -->
          <span
            class="mt-space-1 flex items-center gap-space-1"
            data-attach-strip
          >
            {#each attached.slice(0, STRIP) as one (one.ref)}
              {#if one.kind === "image"}
                <img
                  alt={one.name}
                  class="size-icon-lg flex-none rounded-xs border border-border-hairline object-cover"
                  data-thumb
                  src={one.ref}
                />
              {:else}
                <span
                  class="grid size-icon-lg flex-none place-items-center rounded-xs border border-border-hairline bg-surface-recess text-ink-muted"
                  data-thumb
                  title={one.name}
                  ><IconDocument aria-hidden="true" class="size-icon-sm" /><span
                    class="sr-only">{one.name}</span
                  ></span
                >
              {/if}
            {/each}
            {#if attached.length > STRIP}
              <span
                class={["type-meta num", ink(washed, "text-ink-muted")]}
                data-slot="more">+{attached.length - STRIP}</span
              >
            {/if}
          </span>
        {/if}
        {#if back?.kind === "notSent"}
          <span
            class={[
              "mt-space-1 type-meta line-clamp-2 text-pretty wrap-anywhere",
              ink(washed, "text-status-fail-ink"),
            ]}
            data-line="back"
            data-not-sent="">{said.notSent(back.why)}</span
          >
        {:else if back?.kind === "said"}
          {@const Speaker = back.by === "agent" ? IconAgent : IconUser}
          <span
            class={[
              "mt-space-1 flex min-w-0 items-center gap-space-1 type-meta mark-line",
              ink(washed, back.unread ? "text-ink-strong" : "text-ink-muted"),
            ]}
            data-line="back"
            data-unread={back.unread || undefined}
            ><span class="sr-only"
              >{back.by === "agent" ? "Agent: " : "You: "}</span
            ><span
              aria-hidden="true"
              class={[
                "grid size-icon-sm flex-none place-items-center",
                back.by === "you" && !washed && "text-brand-ink",
              ]}
              data-box
              data-speaker={back.by}><Speaker class="size-icon-sm" /></span
            ><span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{#if back.unread}<span
                  class="text-status-attn-ink font-medium"
                  data-slot="new-answer">{`${said.newAnswer} · `}</span
                >{/if}{#each segments(marked.length > 0 ? aroundHit(back.text) : back.text) as part, at (at)}{#if part.hit}<mark
                    class="bg-selection text-inherit rounded-xs"
                    >{part.text}</mark
                  >{:else}{part.text}{/if}{/each}</span
            ></span
          >
        {/if}
      </span>
    </button>
    {#if back?.kind === "notSent"}
      <!-- Try again, one press, on a desk and under a finger alike. -->
      <div class="flex justify-end px-space-2 pb-space-1">
        <Button
          aria-label={said.retryComment(pin.number)}
          data-slot="pin-retry"
          onclick={() => onretrypin(pin.id)}
          pending={retrying.has(pin.id)}
          size="sm"
          variant="secondary"
        >
          <PendingContent icon={IconRefresh} pending={retrying.has(pin.id)} />
          <span>{said.tryAgain}</span>
        </Button>
      </div>
    {/if}
    {#if filter === "check" && checks}
      {@render checks.changes(pin)}
    {/if}
    {#if !coarse.current}
      <span
        class="absolute end-space-1 top-space-1 opacity-0 transition-opacity duration-(--dur-control) ease-out group-hover/row:opacity-100 group-focus-within/row:opacity-100"
      >
        <Button
          aria-label={pin.resolvedAt ? said.reopen : said.resolve}
          icon={IconSuccess}
          onclick={() => onresolve(pin.id, !pin.resolvedAt)}
          size="icon-sm"
          title={pin.resolvedAt ? said.reopen : said.resolve}
          variant="ghost"
        />
      </span>
    {/if}
  </li>
{/snippet}

<aside
  data-slot="comment-rail"
  aria-label={said.comments}
  data-layout={layout}
  class="flex flex-col min-h-0 w-c-comments-w max-w-full bg-surface-raised data-[layout=beside]:h-full data-[layout=sheet]:flex-1 data-[layout=sheet]:w-full"
>
  <!-- One row: Close leading on the sheet, the title menu, the glass;
       searching, the field and its Close. -->
  <header
    data-slot="head"
    data-searching={searching || undefined}
    class="flex flex-none items-center gap-space-1 h-c-btn-h-lg px-space-2 hit-gap-x-space-1 coarse:gap-space-5 coarse:hit-gap-x-space-5"
  >
    {#if searching}
      <InputGroup.Root class="flex-1">
        <InputGroup.Addon><IconSearch /></InputGroup.Addon>
        <InputGroup.Input
          aria-keyshortcuts="/"
          aria-label={said.searchComments}
          data-slot="search"
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (query) {
                query = "";
              } else {
                closeSearch();
              }
            }
          }}
          placeholder={said.searchComments}
          type="search"
          bind:ref={searchField}
          bind:value={query}
        />
        {#if query}
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button
              aria-label={said.clearSearch}
              onclick={() => {
                query = "";
                searchField?.focus();
              }}
              size="icon-xs"
              title={said.clearSearch}><IconClose /></InputGroup.Button
            >
          </InputGroup.Addon>
        {/if}
      </InputGroup.Root>
      <!-- Cancel puts the search away (HIG, Search fields: a Cancel button
           beside the field), in words, so it never reads as the field's own
           Clear (×), which only empties it. -->
      <BarGlass form="group">
        <button
          class="select-none touch-hit press-tint px-space-3 text-ink-strong type-label"
          data-bar-item
          data-slot="cancel-search"
          onclick={closeSearch}
          type="button"
        >
          {said.cancelSearch}
        </button>
      </BarGlass>
    {:else}
      {#if layout === "sheet"}
        <BarGlass form="group">
          <BarItem
            data-slot="close"
            icon={IconClose}
            label={said.closeComments}
            onclick={onclose}
          />
        </BarGlass>
      {/if}
      <div class="flex min-w-0 flex-1">
        <BarGlass flare="end" form="title">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  aria-label={`${said.whichComments}: ${inFront?.name ?? ""}${waiting ? `, ${said.toCheckWaiting(waiting)}` : ""}`}
                  class="select-none touch-hit press-tint mark-line min-w-0 gap-space-2 ps-space-2 pe-space-1"
                  data-bar-item
                  data-box
                  data-slot="list"
                  type="button"
                >
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong type-row"
                    data-slot="title">{inFront?.name}</span
                  >
                  {#if inFront && counted(inFront.count) !== null}
                    <span
                      class="flex-none text-ink-muted type-row num"
                      data-slot="count">{counted(inFront.count)}</span
                    >
                  {/if}
                  {#if waiting}
                    <!-- To check holds comments while another list is in front:
                         said in words beside the title, the needs-you dot
                         leading them (DESIGN.md, Status dot), never the dot
                         alone. -->
                    <span
                      aria-hidden="true"
                      class="flex flex-none items-center gap-space-1 text-ink-strong type-label mark-line"
                      data-box
                      data-slot="waiting"
                      ><span
                        class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
                        data-box
                      ></span><span class="num"
                        >{said.toCheckWaiting(waiting)}</span
                      ></span
                    >
                  {/if}
                  <IconChevronDown
                    aria-hidden="true"
                    class="size-icon-sm flex-none text-ink-muted"
                  />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <BarMenu label={said.whichComments}>
              <DropdownMenu.RadioGroup
                onValueChange={(next) => {
                  filter = next as "check" | "open" | "resolved";
                }}
                value={filter}
              >
                {#each lists as one (one.value)}
                  <DropdownMenu.RadioItem value={one.value}
                    ><span class="min-w-0 flex-1">{one.name}</span
                    >{#if counted(one.count) !== null}<span
                        class="text-ink-muted num">{counted(one.count)}</span
                      >{/if}</DropdownMenu.RadioItem
                  >
                {/each}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <DropdownMenu.GroupHeading
                  >{said.order}</DropdownMenu.GroupHeading
                >
                <DropdownMenu.RadioGroup
                  onValueChange={(next) => {
                    sort = next === "top" ? "top" : "newest";
                  }}
                  value={sort}
                >
                  <DropdownMenu.RadioItem value="newest"
                    >{said.newestFirst}</DropdownMenu.RadioItem
                  >
                  <DropdownMenu.RadioItem value="top"
                    >{said.topOfPageFirst}</DropdownMenu.RadioItem
                  >
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Group>
            </BarMenu>
          </DropdownMenu.Root>
        </BarGlass>
      </div>
      <BarGlass form="group">
        <BarItem
          aria-keyshortcuts="/"
          icon={IconSearch}
          keys="/"
          label={said.searchComments}
          onclick={focusSearch}
          bind:ref={searchButton}
        />
        {#if layout === "beside" && pageComposer}
          <!-- A comment on the whole page: its composer hangs from this glass,
               connected to its +, as every card a bar opens does. -->
          <Popover.Root
            onOpenChange={(next) => {
              if (next) {
                onpage();
              } else {
                onpageclose?.();
              }
            }}
            open={pageOpen}
          >
            <Popover.Trigger>
              {#snippet child({ props })}
                <BarItem icon={IconPlus} label={said.onWholePage} {props} />
              {/snippet}
            </Popover.Trigger>
            <BarPopover label={said.onWholePage}>
              <div class="w-c-pin-card-w max-w-full p-space-2">
                {@render pageComposer()}
              </div>
            </BarPopover>
          </Popover.Root>
        {:else}
          <BarItem icon={IconPlus} label={said.onWholePage} onclick={onpage} />
        {/if}
      </BarGlass>
    {/if}
  </header>
  {#if down !== null && failed === null}
    <!-- A link stands lost: said above the rows, which stand as last read, with what closed it under Show details. -->
    <RowFault
      data-pin-list-down
      again={onretry}
      class="shrink-0 py-space-1 px-space-3"
      details={down}
      end="var(--space-2)"
      indent="var(--space-2)"
      reason={LINK_DROPPED}
    />
  {/if}
  <div
    data-slot="rows"
    class="relative flex-auto min-h-0 overflow-y-auto overscroll-contain kit-edge-fade-block"
    onscroll={(event) => {
      scroll = event.currentTarget.scrollTop;
    }}
    style:--fault-indent="var(--space-2)"
    style:--fault-end="var(--space-2)"
  >
    {#if hold === "quiet"}
      <!-- Inside the wait's grace: its plain surface (The Real Wait Rule). -->
    {:else if hold === "reading"}
      <div
        data-slot="pin-list-reading"
        aria-label={words.readingComments}
        class="px-space-2 py-space-2"
        role="status"
        out:revealOut
      >
        <!-- Each stands for the row most comments are (The Row Dress Rule): its
             place and age, its words, nothing back yet; at that row's height,
             so the list holds still as it lands. -->
        {#each [0, 1, 2] as skeleton (skeleton)}
          <span
            class="flex items-start gap-space-3 min-h-c-artifact-row-h px-space-2 py-space-2"
            data-slot="skeleton-row"
          >
            <span
              class="mark-cell w-c-pin-cell-w flex-none justify-start justify-items-start"
            >
              <Skeleton cell="pin" radius="pill" />
            </span>
            <span class="flex flex-1 min-w-0 flex-col">
              <span class="flex min-w-0 items-start gap-space-2">
                <Skeleton class="w-3/5" line="label" radius="text" />
                <Skeleton
                  class="ms-auto"
                  line="meta"
                  radius="text"
                  width="age"
                />
              </span>
              <Skeleton
                class="mt-space-row w-17/20"
                line="body"
                radius="text"
              />
            </span>
          </span>
        {/each}
      </div>
    {:else if failed !== null}
      <RowFault
        data-pin-list-failed
        again={onretry}
        class="py-space-2 px-space-2"
        reason={words.commentsNotRead(failed)}
      />
    {:else}
      <div
        data-slot="pin-list-read"
        class="px-space-2 py-space-2"
        in:reveal
        {@attach keepScroll}
      >
        {#if searchedGroups}
          {#if searchedGroups.length > 0}
            {#each searchedGroups as group (group.value)}
              <!-- The list each hit is in, named over its hits. -->
              <h3
                class="m-0 px-space-2 pt-space-2 pb-space-1 text-ink-muted type-meta first:pt-0"
                data-slot="hits-in"
              >
                {group.name} <span class="num">{group.pins.length}</span>
              </h3>
              <ol class="flex flex-col gap-space-row m-0 p-0 list-none">
                {#each group.pins as pin (pin.id)}
                  {@render boundedRow(pin)}
                {/each}
              </ol>
            {/each}
          {:else}
            <p
              data-slot="pin-list-empty"
              class="m-0 px-space-2 py-space-3 text-ink-strong type-label"
            >
              {said.noMatch(asked.trim())}
            </p>
          {/if}
        {:else if filter === "check" && checks}
          {#if checks.count > 0}
            <ol
              class="flex flex-col gap-space-row m-0 p-0 list-none"
              data-slot="to-check"
            >
              {#each shown as pin (pin.id)}
                {@render boundedRow(pin)}
              {/each}
              {#if checks.unasked}
                <li data-slot="unasked">{@render checks.unasked()}</li>
              {/if}
            </ol>
          {:else}
            <p
              data-slot="pin-list-empty"
              class="flex flex-col gap-space-1 m-0 px-space-2 py-space-3 text-ink-muted text-size-meta"
            >
              <span class="text-ink-strong type-label">{said.noneToCheck}</span>
              {said.noneToCheckHint}
            </p>
          {/if}
        {:else if shown.length > 0}
          <ol class="flex flex-col gap-space-row m-0 p-0 list-none">
            {#each shown as pin (pin.id)}
              {@render boundedRow(pin)}
            {/each}
          </ol>
        {:else if filter === "open"}
          <p
            data-slot="pin-list-empty"
            class="m-0 px-space-2 py-space-3 text-ink-strong type-label"
          >
            {said.noneOpen}
          </p>
        {:else}
          <p
            data-slot="pin-list-empty"
            class="m-0 px-space-2 py-space-3 text-ink-strong type-label"
          >
            {said.noneResolved}
          </p>
        {/if}
      </div>
    {/if}
  </div>
</aside>
