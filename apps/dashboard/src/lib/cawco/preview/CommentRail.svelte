<script lang="ts">
  import { type Pin, pinHeld } from "@cawco/core/comments/model";
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
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  import RegionBoundary from "#lib/cawco/RegionBoundary.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconAgent,
    IconClose,
    IconDocument,
    IconMoreLinear,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSortLinear,
    IconSuccess,
    IconUser,
  } from "#lib/icons.js";
  import { frameObserver, frameSize } from "#lib/platform/frame-observer.js";
  import {
    dur,
    easeOut,
    motionOk,
    reveal,
    revealOut,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { LINK_DROPPED, type ListHold } from "./artifact-doc";
  import {
    attachedTo,
    lastActivity,
    type RailList,
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
    held = 0,
    onsendheld,
    sendRefused = null,
    onsendrefusedclosed,
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
     * Beside the page: the whole-page comment's composer stands, unfolded
     * under the rail's bar where its + is, as Send all's note does.
     */
    pageOpen?: boolean;
    /** That composer put away (Escape, its + pressed again). */
    onpageclose?: () => void;
    /** That composer, as the pane draws it. */
    pageComposer?: Snippet;
    /** The comments whose words the person holds to send together (core `pinHeld`). */
    held?: number;
    /** Send all: everything held goes with `note`; the refusal's sentence when nothing went. */
    onsendheld?: (note: string) => string | null;
    /** Send all the hub refused (core `lostWrites`): its note and the hub's reason, said in the note it was sent from, open again with its words. */
    sendRefused?: { note: string; why: string } | null;
    /** The person put away a refused Send all's note (Cancel, Escape): the pane lets it go. */
    onsendrefusedclosed?: () => void;
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
    filter?: RailList;
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
  /** The floating stack's height over the rows, px (its bar, the lists and what opens under them): the rows' top padding. */
  let headHeight = $state(0);
  /**
   * The rows fit their box: nothing in them to scroll. In the sheet a
   * finger's pan there is then no one's (`touch-action: none`): left to the
   * browser, a list too short to scroll handed it on past the sheet, to the
   * transcript behind the panel. A list that runs past its box scrolls
   * under the finger and holds its scroll (`overscroll-contain`).
   */
  let rowsFit = $state(true);
  const rowsRun: Attachment<HTMLElement> = (node) => {
    const read = () => {
      rowsFit = node.scrollHeight <= node.clientHeight;
    };
    const sized = frameObserver(read);
    sized.observe(node);
    const rows = new MutationObserver(() => sized.request());
    rows.observe(node, { characterData: true, childList: true, subtree: true });
    read();
    return () => {
      sized.disconnect();
      rows.disconnect();
    };
  };
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
  /** What he holds to send together (core `pinHeld`): its own list while it holds any. */
  const heldPins = $derived(pins.filter(pinHeld));
  /** A comment waiting on him: an answer he hasn't read. */
  const waitsOnYou = (pin: Pin) => unread.has(pin.id) && !live.has(pin.id);
  /**
   * A list newest first puts what waits on him first (his job here is to
   * find and answer it); Top of page first is the page's order, which he
   * picked, kept whole.
   */
  const waitingFirst = (list: Pin[]) =>
    sort === "top"
      ? list
      : [...list.filter(waitsOnYou), ...list.filter((pin) => !waitsOnYou(pin))];
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
    const inFront: Record<Exclude<RailList, "check">, Pin[]> = {
      open: openPins,
      resolved: resolvedPins,
      held: heldPins,
    };
    return waitingFirst(
      sortedPins(inFront[filter === "check" ? "open" : filter], sort)
    );
  });
  const failed = $derived(typeof hold === "object" ? hold.failed : null);
  /** A list's count once the pins are read, and only above 0 (The Earned Count Rule). */
  const counted = (count: number) =>
    hold === "ready" && count > 0 ? count : null;
  /**
   * The lists, each a segment under the bar with its count (HIG, Segmented
   * controls: "a segmented control can … switch between closely related
   * views"): To check while what changed since he looked waits, Open,
   * Resolved, and Held while he holds any; one stands chosen.
   */
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
    ...(heldPins.length > 0
      ? [{ value: "held" as const, name: said.held, count: heldPins.length }]
      : []),
  ]);
  /** A segment's words: the list's name, and its count once read and above 0 (The Earned Count Rule). */
  const segment = (name: string, count: number) => {
    const n = counted(count);
    return n === null ? name : `${name} ${n}`;
  };
  // The list in front goes when it does (Held once all of it is sent, To
  // check once nothing waits): Open stands in its place.
  $effect(() => {
    if (hold === "ready" && !lists.some((one) => one.value === filter)) {
      untrack(() => {
        filter = "open";
      });
    }
  });
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

  /** Send all's note standing open under the bar, its words, and why the last Send all didn't go. */
  let noting = $state(false);
  let note = $state("");
  let noteRefused = $state<string | null>(null);
  // Nothing held, nothing to send: the note goes with the last of them.
  $effect(() => {
    if (held === 0) {
      noting = false;
    }
  });
  // A Send all the hub refused stands open again where it was pressed: its
  // note as written, and why it didn't go.
  $effect(() => {
    const refused = sendRefused;
    if (refused) {
      untrack(() => {
        ({ note, why: noteRefused } = refused);
        noting = true;
      });
    }
  });
  /** The person puts the note away: a refused Send all's with it. */
  function closeNote() {
    noting = false;
    noteRefused = null;
    if (sendRefused) {
      onsendrefusedclosed?.();
    }
  }
  /** Send all stands in the bar: Search, + and Sort fold into More. */
  const sending = $derived(held > 0 && onsendheld !== undefined);
  /** + opens the whole page's composer inside the rail (a desk's). */
  const besidePage = $derived(
    layout === "beside" && pageComposer !== undefined
  );
  /** +, or its row in More: the whole page's composer, opened or put away. */
  function wholePage() {
    if (besidePage && pageOpen) {
      onpageclose?.();
      return;
    }
    noting = false;
    onpage();
  }
  function sendHeldNow() {
    const refused = onsendheld?.(note) ?? null;
    noteRefused = refused;
    if (refused === null) {
      note = "";
      noting = false;
    }
  }

  /** What a row says on its line 3, if anything. */
  const backOf = (pin: Pin) => {
    // Held to send with the others: marked Unsent (the owner's pick, "When
    // does the agent hear a comment?", 2026-10-26).
    if (pinHeld(pin)) {
      return { kind: "held" as const };
    }
    // Unsent, or a write of it the hub refused: the pane says when (`notSentWhy`).
    const why = whyNotSent(pin);
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
  {@const chosen = pin.id === current}
  {@const firstWords =
    pin.thread[0]?.text.trim() || attached.map((one) => one.name).join(", ")}
  <li class="group/row relative" out:rowOut>
    <!-- The row is the comment and the press that opens its thread; Resolve
         stands over its end. Its headline (what the spot is called) leads
         at the body's size and weight 500, the comment's words under it in
         the row ink, the last word and age in meta: each part keeps its
         dress (The Row Dress Rule), its thread open too, where the row
         stands on the hover's ground with a hairline line inside its edge, so no level merges into a
         wash and the pin keeps its own ground. The hover is the item's
         (`group-hover/row`), so it stays while the pointer is on Resolve. -->
    <button
      data-slot="pin-row"
      aria-current={chosen || undefined}
      data-focused={pin.id === focused || undefined}
      data-moved={gone || undefined}
      class="flex items-start gap-space-3 w-full min-h-c-artifact-row-h px-space-2 py-space-2 border-none rounded-sm bg-transparent text-start transition-[background-color] duration-(--dur-control) ease-out not-active:not-aria-current:group-hover/row:bg-surface-hover active:not-aria-current:bg-surface-pressed aria-current:bg-surface-hover aria-current:not-focus-visible:outline-1 aria-current:not-focus-visible:-outline-offset-1 aria-current:not-focus-visible:outline-solid aria-current:not-focus-visible:outline-border-control focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
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
              "min-w-0 truncate type-body font-medium",
              gone ? "text-ink-subtle" : "text-ink-strong",
            ]}
            >{#each segments(gone ? said.elementGone : pinName(pin)) as part, at (at)}{#if part.hit}<mark
                  class="bg-selection text-inherit rounded-xs">{part.text}</mark
                >{:else}{part.text}{/if}{/each}</span
          >
          <span
            data-slot="age"
            class={[
              "ms-auto flex-none type-meta num transition-opacity duration-(--dur-control) ease-out not-coarse:group-hover/row:opacity-0 not-coarse:group-focus-within/row:opacity-0",
              "text-ink-muted",
            ]}>{formatAgeShort(Date.parse(lastActivity(pin)))}</span
          >
        </span>
        {#if firstWords}
          <span
            data-line="words"
            class={[
              "mt-space-row line-clamp-2 type-body text-pretty wrap-anywhere",
              "text-ink-row",
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
              <span class={["type-meta num", "text-ink-muted"]} data-slot="more"
                >+{attached.length - STRIP}</span
              >
            {/if}
          </span>
        {/if}
        {#if back?.kind === "notSent"}
          <span
            class={[
              "mt-space-1 type-meta line-clamp-2 text-pretty wrap-anywhere",
              "text-status-fail-ink",
            ]}
            data-line="back"
            data-not-sent="">{said.notSent(back.why)}</span
          >
        {:else if back?.kind === "held"}
          <span
            class={["mt-space-1 type-meta", "text-ink-muted"]}
            data-line="back"
            data-held="">{said.unsent}</span
          >
        {:else if back?.kind === "said"}
          {@const Speaker = back.by === "agent" ? IconAgent : IconUser}
          <span
            class={[
              "mt-space-1 flex min-w-0 items-center gap-space-1 type-meta mark-line",
              back.unread ? "text-ink-strong" : "text-ink-muted",
            ]}
            data-line="back"
            data-unread={back.unread || undefined}
            ><span class="sr-only"
              >{back.by === "agent" ? "Agent: " : "You: "}</span
            ><span
              aria-hidden="true"
              class={[
                "grid size-icon-sm flex-none place-items-center",
                back.by === "you" && "text-brand-ink",
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

<!-- The orders the rows come in, as radio items: Sort's menu, or More's
     group under its heading while Send all stands. -->
{#snippet orders(headed: boolean)}
  <DropdownMenu.RadioGroup
    onValueChange={(next) => {
      sort = next === "top" ? "top" : "newest";
    }}
    value={sort}
  >
    {#if headed}
      <DropdownMenu.GroupHeading>{said.order}</DropdownMenu.GroupHeading>
    {/if}
    <DropdownMenu.RadioItem value="newest"
      >{said.newestFirst}</DropdownMenu.RadioItem
    >
    <DropdownMenu.RadioItem value="top"
      >{said.topOfPageFirst}</DropdownMenu.RadioItem
    >
  </DropdownMenu.RadioGroup>
{/snippet}

<aside
  data-slot="comment-rail"
  aria-label={said.comments}
  data-layout={layout}
  class="relative flex flex-col min-h-0 w-c-comments-w max-w-full timeline-scope-transcript-head data-[layout=beside]:h-full data-[layout=beside]:pb-space-3 data-[layout=sheet]:flex-1 data-[layout=sheet]:w-full"
  style:--rail-head="{headHeight}px"
>
  <!-- The bar and what stands under it (the lists, a composer or note
       opened from the bar, a lost link) float over the rows as one stack,
       the rows running to the rail's top beneath it: they clear it at rest
       by their top padding (`--rail-head`, the stack's height as laid out)
       and blur and fade under it as they scroll (HeadFade; DESIGN.md, The
       Title Bars Follow Liquid Glass Rule). -->
  <HeadFade
    band="var(--rail-head)"
    tint={layout === "beside" ? "bg-material-panel" : "bg-surface-raised"}
  />
  <div
    class="absolute inset-x-0 top-0 z-2 flex flex-col"
    data-slot="rail-head"
    {@attach frameSize(
      (node: HTMLElement) => node.offsetHeight,
      (value) => {
        headHeight = value;
      }
    )}
  >
    <!-- One row: Close leading on the sheet, the centred title, the glass;
       searching, the field and its Cancel. The title names a part of the
       panel, so it stands a step under the panel's own (the head's Row, 16px):
       Label, 13px at 500, as HIG Typography sets macOS's Headline (13) for a
       pane's heading, at every width. -->
    <header
      data-slot="head"
      data-searching={searching || undefined}
      class="flex flex-none items-center gap-space-1 h-c-btn-h-lg px-space-2 hit-gap-x-space-1 coarse:gap-space-5 coarse:hit-gap-x-space-5"
    >
      {#if searching}
        <InputGroup.Root class="flex-1" look="bar">
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
          <BarItem
            data-slot="cancel-search"
            form="words"
            label={said.cancelSearch}
            onclick={closeSearch}
            tip={false}>{said.cancelSearch}</BarItem
          >
        </BarGlass>
      {:else}
        <!-- Leading: Close, on the phone's sheet (HIG, Sheets: a sheet's
           Cancel or Close leads its bar); a cell as wide as the trailing
           one, so the title stands in the bar's centre. While Send all
           stands, Search, + and Sort fold into More here: Send beside them
           left no room either side of a centred title (320px on a desk,
           368 on a phone), and the title gave way (HIG, Toolbars: "an
           overflow menu" for what doesn't fit). -->
        <div
          class="flex min-w-0 flex-1 basis-0 items-center gap-space-1 coarse:gap-space-5"
          data-slot="lead"
        >
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
          {#if sending}
            <!-- A leading group: its menu stands out past its trailing side,
               into the rail, never over the page. -->
            <BarGlass flare="end" form="group">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <BarItem
                      data-slot="more"
                      icon={IconMoreLinear}
                      label={said.more}
                      {props}
                      bind:ref={searchButton}
                    />
                  {/snippet}
                </DropdownMenu.Trigger>
                <BarMenu label={said.more}>
                  <DropdownMenu.Item onSelect={focusSearch}
                    ><IconSearch /><span>{said.searchComments}</span
                    ><DropdownMenu.Shortcut>/</DropdownMenu.Shortcut
                    ></DropdownMenu.Item
                  >
                  <DropdownMenu.Item onSelect={wholePage}
                    ><IconPlus /><span>{said.onWholePage}</span
                    ></DropdownMenu.Item
                  >
                  <DropdownMenu.Separator />
                  {@render orders(true)}
                </BarMenu>
              </DropdownMenu.Root>
            </BarGlass>
          {/if}
        </div>
        <!-- The title names the sheet or the rail (HIG, Sheets: the title in
           the bar's centre), in the bar's own title role. -->
        <h2
          class="m-0 flex-none truncate text-ink-strong type-label"
          data-slot="title"
        >
          {said.comments}
        </h2>
        <div
          class="flex min-w-max flex-1 basis-0 items-center justify-end gap-space-1 coarse:gap-space-5"
          data-slot="trail"
        >
          {#if !sending}
            <BarGlass form="group">
              <BarItem
                aria-keyshortcuts="/"
                icon={IconSearch}
                keys="/"
                label={said.searchComments}
                onclick={focusSearch}
                bind:ref={searchButton}
              />
              <!-- On a desk, a comment on the whole page: its composer
                 unfolds under the bar, inside the rail, as Send all's note
                 does: every field the bar opens takes the one place, at the
                 rail's width. -->
              <BarItem
                expanded={besidePage ? pageOpen : undefined}
                icon={IconPlus}
                label={said.onWholePage}
                onclick={wholePage}
                open={besidePage ? pageOpen : undefined}
              />
              <!-- The order the rows come in, a menu hung from its symbol
                 (HIG, Toolbars: a menu for related choices). -->
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <BarItem
                      data-slot="sort"
                      icon={IconSortLinear}
                      label={said.sort}
                      {props}
                    />
                  {/snippet}
                </DropdownMenu.Trigger>
                <BarMenu label={said.order}>
                  {@render orders(false)}
                </BarMenu>
              </DropdownMenu.Root>
            </BarGlass>
          {/if}
          {#if sending}
            <!-- Send all: the one prominent action, trailing (HIG, Toolbars:
             "Only specify one primary action, and put it on the trailing
             side"), its count what it sends; pressed, its note unfolds
             under the bar, whose own Send is then the one action and this
             one steps down to the outline. -->
            <Button
              aria-expanded={noting}
              aria-label={said.sendHeldLabel(held)}
              data-slot="send-held"
              onclick={() => {
                if (noting) {
                  closeNote();
                  return;
                }
                noting = true;
                noteRefused = null;
                if (noting && pageOpen) {
                  onpageclose?.();
                }
              }}
              shape="capsule"
              variant={noting ? "outline" : "default"}
              ><span>{said.send}</span><span class="num">{held}</span></Button
            >
          {/if}
        </div>
      {/if}
    </header>
    {#if !searching}
      <!-- The lists, every one in view with its count, as a segmented
         control under the bar, the rail's width (HIG, Segmented controls;
         the owner's pin 5: a dropdown hid the other lists until opened). -->
      <!-- Under a finger the segments stand clear of the bar's controls
         over them, so each keeps 44 tall to the midpoint (The 44 Touch
         Rule). -->
      <div
        class="flex flex-none *:min-w-0 *:flex-1 px-space-2 pb-space-2 coarse:pt-space-3"
        data-slot="lists"
      >
        <Tabs
          onValueChange={(next) => {
            filter = next as RailList;
          }}
          size="compact"
          value={filter}
          values={lists.map((one) => one.value)}
        >
          <TabsList aria-label={said.whichComments} fill>
            {#each lists as one (one.value)}
              <TabItem label={segment(one.name, one.count)} value={one.value} />
            {/each}
          </TabsList>
        </Tabs>
      </div>
    {/if}
    {#if layout === "beside" && pageOpen && pageComposer}
      <!-- The whole page's composer, under the bar where + was pressed;
         under a finger its field stands clear of the bar's controls, so
         each keeps 44 tall to the midpoint between them (The 44 Touch
         Rule), as the held note's does. -->
      <div
        class="flex flex-none flex-col px-space-3 pb-space-3 coarse:pt-space-2"
        data-slot="page-composer"
        transition:unfold
      >
        {@render pageComposer()}
      </div>
    {/if}
    {#if noting && held > 0 && onsendheld}
      <!-- Send all's note, under the bar where Send was pressed, as Delete
         asks under the card's bar: one note to the agent with everything
         held, then Send. ⌘↩ sends from the note. -->
      <div
        class="flex flex-none flex-col gap-space-2 px-space-3 pb-space-3 coarse:pt-space-2"
        data-slot="held-note"
        transition:unfold
      >
        <Textarea
          aria-label={said.heldNote}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              sendHeldNow();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeNote();
            }
          }}
          placeholder={said.heldNote}
          rows={2}
          bind:value={note}
        />
        {#if noteRefused}
          <p class="m-0 type-meta text-status-fail-ink" role="alert">
            {noteRefused}
          </p>
        {/if}
        <div class="flex justify-end gap-space-2">
          <Button onclick={closeNote} size="sm" variant="ghost"
            >{said.cancelSearch}</Button
          >
          <Button
            aria-keyshortcuts="Control+Enter Meta+Enter"
            data-slot="send-held-now"
            onclick={sendHeldNow}
            size="sm">{said.sendHeldCount(held)}</Button
          >
        </div>
      </div>
    {/if}
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
  </div>
  <!-- No scrollbar of its own: its edge fades say there is more, and its
       width never changes as the list outgrows the rail (a scrollbar
       there stood beside the page as a stray one, the owner's note on
       Beside the page). -->
  <div
    data-slot="rows"
    data-fits={(layout === "sheet" && rowsFit) || undefined}
    class="relative flex-auto min-h-0 overflow-y-auto overscroll-contain pt-(--rail-head) scroll-timeline-transcript-head no-scrollbar kit-edge-fade-block data-fits:touch-none"
    {@attach rowsRun}
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
