<script lang="ts">
  /**
   * The Comments rail (DESIGN.md, The Comments rail): beside the page on a
   * desk, the head's Comments its pressed toggle, the page narrowed to meet
   * it; on a phone, or a pane under 640px, the well's foot sheet, at most 60%
   * of it. It closes only by its Close or by Comments, never by a press
   * outside or Esc.
   *
   * Its head (44px): Comments, then Sort, a comment on the whole page and
   * Close, each the `sm` ghost glyph. Under it the search field (Find's
   * engine, core find-match, over each comment's number, words, place and
   * state; `/` focuses it, Esc clears it), and Open and Resolved, the
   * segmented filter, each count only above 0. Then the rows, newest first
   * by last activity (or top of page first), each one press in up to four
   * lines (The Row Dress Rule): the same pill as on the page in its mark
   * cell; the place, its name in label at 500 in the row ink and its age at
   * the line's end in meta; the words in body, two lines at most; what it
   * carries as a strip of 20px thumbs, four at most, then "+N"; what came
   * back in meta, after its speaker's glyph (the agent's ghost in the line's
   * ink, the person's in the brand ink), in the strong ink while unread,
   * "Working on it…" while the agent works on it, "Not sent: why" in the
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
  import { commentWords as said, artifactWords as words } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import { parse } from "@cawco/core/find-match";
  import { pinName } from "@cawco/core/pin-name";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconAgent,
    IconClose,
    IconDocument,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSort,
    IconSuccess,
    IconUser,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { dur, reveal, revealOut } from "../motion/curves.svelte";
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
    onresolve,
    onretrypin,
    whyNotSent = () => null,
    filter = $bindable("open"),
    sort = $bindable("newest"),
    scroll = $bindable(0),
    width = "var(--c-comments-w)",
    thread,
    threadIn = "rail",
  }: {
    /** Its width beside the page, a CSS length. */
    width?: string;
    /**
     * The open comment's thread, held by the rail: in place of its list
     * (`rail`), or in place of the open comment's row, the list round it
     * (`row`).
     */
    thread?: Snippet;
    threadIn?: "rail" | "row";
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
    onresolve: (id: string, resolved: boolean) => void;
    /** A comment not sent, tried again: it goes to the session once more. */
    onretrypin: (id: string) => void;
    /** Why a comment hasn't reached the session, in words, when its delivery reached no one or it stands only on the page; null while it is on its way. */
    whyNotSent?: (pin: Pin) => string | null;
    filter?: "open" | "resolved";
    sort?: RailSort;
    scroll?: number;
  } = $props();

  /** A finger taps the page, a mouse clicks it: the empty line says which; no Resolve on a row under a finger. */
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
  /** `/` from the pane: the search field takes the keyboard. */
  export function focusSearch() {
    searchField?.focus();
  }

  const openPins = $derived(pins.filter((pin) => !pin.resolvedAt));
  const resolvedPins = $derived(pins.filter((pin) => !!pin.resolvedAt));
  const shown = $derived(
    searched(
      sortedPins(filter === "open" ? openPins : resolvedPins, sort),
      asked
    )
  );
  const failed = $derived(typeof hold === "object" ? hold.failed : null);
  /** A tab's label: its count once the pins are read, and only above 0 (The Earned Count Rule). */
  const tab = (name: string, count: number) =>
    hold === "ready" && count > 0 ? `${name} ${count}` : name;
  /** The query's words, for the matching words a row marks. */
  const marked = $derived(parse(asked).tokens);

  // The focused comment's own filter shows, so J and K never land on a hidden row.
  $effect(() => {
    const pin = pins.find((one) => one.id === focused);
    if (pin) {
      untrack(() => {
        filter = pin.resolvedAt ? "resolved" : "open";
      });
    }
  });

  /** The rows come back where they were read: the rail shut and open again keeps its scroll. */
  const keepScroll = (read: HTMLElement) => {
    if (read.parentElement) {
      read.parentElement.scrollTop = untrack(() => scroll);
    }
  };

  /** A row's words, each word of the query marked in the selection ink. */
  const WORD_AT = /([\p{L}\p{N}]+)/u;
  const segments = (text: string) =>
    marked.length === 0
      ? [{ text, hit: false }]
      : text
          .split(WORD_AT)
          .filter(Boolean)
          .map((part) => ({
            text: part,
            hit: marked.some((word) => part.toLowerCase().startsWith(word)),
          }));

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
    if (live.has(pin.id)) {
      return { kind: "live" as const };
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

{#snippet row(pin: Pin)}
  {@const attached = attachedTo(pin)}
  {@const back = backOf(pin)}
  {@const gone = !!pin.movedAt}
  {@const washed = pin.id === current}
  {@const firstWords =
    pin.thread[0]?.text.trim() || attached.map((one) => one.name).join(", ")}
  {#if thread && threadIn === "row" && washed}
    <!-- The open comment's row opens into its thread, the list round it:
         its head and its reply stand, its entries scroll between them. -->
    <li
      data-slot="row-thread"
      class="flex flex-auto min-h-0 flex-col gap-space-2 px-space-2 py-space-3 border-y border-border-hairline"
    >
      {@render thread()}
    </li>
  {:else}
    <li class="group/row relative flex-none">
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
        <span class="mark-cell">
          <PinMark
            dot={dotOf(pin)}
            {gone}
            number={pin.number}
            state={markState(pin)}
          />
          {#if dotOf(pin) === "unread"}<span class="sr-only"
              >{said.pinNewAnswer(pin.number)}</span
            >{/if}
        </span>
        <span class="flex flex-1 min-w-0 flex-col">
          <span
            class="flex min-w-0 items-baseline gap-space-2"
            data-line="place"
          >
            <span
              data-slot="title"
              class={[
                "min-w-0 truncate type-label font-medium",
                ink(washed, gone ? "text-ink-subtle" : "text-ink-row"),
              ]}>{gone ? said.elementGone : pinName(pin)}</span
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
              >{#each segments(firstWords) as part, at (at)}{#if part.hit}<mark
                    class="bg-selection text-inherit rounded-xs"
                    >{part.text}</mark
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
                    ><IconDocument
                      aria-hidden="true"
                      class="size-icon-sm"
                    /><span class="sr-only">{one.name}</span></span
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
          {:else if back?.kind === "live"}
            <span
              class={[
                "mt-space-1 flex min-w-0 items-center gap-space-1 type-meta mark-line",
                ink(washed, "text-ink-muted"),
              ]}
              data-line="back"
              ><span class="sr-only">Agent: </span><span
                aria-hidden="true"
                class="grid size-icon-sm flex-none place-items-center"
                data-box
                data-speaker="agent"><IconAgent class="size-icon-sm" /></span
              ><span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{said.working}</span
              ></span
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
              ><span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{back.text}</span
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
  {/if}
{/snippet}

<aside
  data-slot="comment-rail"
  aria-label={said.comments}
  data-layout={layout}
  data-holds={thread ? threadIn : undefined}
  class="group/rail flex flex-col min-h-0 w-(--rail-w) max-w-full bg-surface-raised data-[layout=beside]:h-full data-[layout=sheet]:w-full data-[layout=sheet]:max-h-full data-[layout=sheet]:border-t data-[layout=sheet]:border-border-hairline data-[layout=sheet]:rounded-ss-lg data-[layout=sheet]:rounded-se-lg data-[layout=sheet]:shadow-drawer"
  style:--rail-w={width}
>
  {#if thread && threadIn === "rail"}
    <!-- The rail holds the open comment's thread in place of its list: its
         head and its reply stand, its entries scroll. Its Close gives the
         list back. -->
    <div
      data-slot="rail-thread"
      class="flex flex-auto min-h-0 flex-col gap-space-2 p-space-3"
    >
      {@render thread()}
    </div>
  {:else}
    <header
      data-slot="head"
      class="flex flex-none items-center gap-space-1 h-c-sheet-inspector-head-h ps-space-4 pe-space-2"
    >
      <h2
        data-slot="title"
        class="flex-1 min-w-0 m-0 truncate text-ink-strong type-label"
      >
        {said.comments}
      </h2>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={said.sort}
          size="icon-sm"
          title={said.sort}
          variant="ghost"
        >
          <IconSort />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
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
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Button
        aria-label={said.onWholePage}
        icon={IconPlus}
        onclick={onpage}
        size="icon-sm"
        title={said.onWholePage}
        variant="ghost"
      />
      <Button
        aria-label={said.closeComments}
        icon={IconClose}
        onclick={onclose}
        size="icon-sm"
        title={said.closeComments}
        variant="ghost"
      />
    </header>
    <div class="flex flex-none flex-col gap-space-2 px-space-3 pb-space-2">
      <InputGroup.Root>
        <InputGroup.Addon><IconSearch /></InputGroup.Addon>
        <InputGroup.Input
          aria-keyshortcuts="/"
          aria-label={said.searchComments}
          data-slot="search"
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              query = "";
            }
          }}
          placeholder={said.searchComments}
          type="search"
          bind:ref={searchField}
          bind:value={query}
        />
      </InputGroup.Root>
      <Tabs
        onValueChange={(next) => {
          filter = next as "open" | "resolved";
        }}
        size="compact"
        value={filter}
        values={["open", "resolved"]}
      >
        <TabsList aria-label="Which comments">
          <TabItem label={tab(said.open, openPins.length)} value="open" />
          <TabItem
            label={tab(said.resolved, resolvedPins.length)}
            value="resolved"
          />
        </TabsList>
      </Tabs>
    </div>
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
      class="relative flex-auto min-h-0 overflow-y-auto overscroll-contain border-t border-border-hairline kit-edge-fade-block group-data-[holds=row]/rail:flex group-data-[holds=row]/rail:flex-col"
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
          <!-- Each stands for a row as a row is dressed (The Row Dress Rule): its
             place and age, its words, what came back; at that row's height. -->
          {#each [0, 1, 2] as skeleton (skeleton)}
            <span
              class="flex items-start gap-space-3 min-h-c-artifact-row-h px-space-2 py-space-2"
              data-slot="skeleton-row"
            >
              <span class="mark-cell">
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
                <Skeleton
                  class="mt-space-1"
                  line="meta"
                  radius="text"
                  width="name"
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
          class="px-space-2 py-space-2 group-data-[holds=row]/rail:flex group-data-[holds=row]/rail:flex-auto group-data-[holds=row]/rail:min-h-0 group-data-[holds=row]/rail:flex-col"
          in:reveal
          {@attach keepScroll}
        >
          {#if shown.length > 0}
            <ol
              class="flex flex-col gap-space-row m-0 p-0 list-none group-data-[holds=row]/rail:flex-auto group-data-[holds=row]/rail:min-h-0"
            >
              {#each shown as pin (pin.id)}
                {@render row(pin)}
              {/each}
            </ol>
          {:else if asked.trim()}
            <p
              data-slot="pin-list-empty"
              class="m-0 px-space-2 py-space-3 text-ink-strong type-label"
            >
              {said.noMatch(asked.trim())}
            </p>
          {:else if filter === "open"}
            <p
              data-slot="pin-list-empty"
              class="flex flex-col gap-space-1 m-0 px-space-2 py-space-3 text-ink-muted text-size-meta"
            >
              <span class="text-ink-strong type-label">{said.noneOpen}</span>
              {coarse.current ? said.noneOpenTap : said.noneOpenClick}
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
  {/if}
</aside>
