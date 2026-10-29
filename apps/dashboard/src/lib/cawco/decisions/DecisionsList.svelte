<script lang="ts">
  import type {
    DecisionLink,
    DecisionPageSummary,
  } from "@cawco/core/decisions";
  /**
   * The project's decision pages as one list (design-previews/decisions-list,
   * the owner's pick of 10-24: "A list, links as words on the cards"): a
   * search over one raised list grouped by standing (Needs you, Sent,
   * Decided), one row per page. A row is its mark (the ring of its cards
   * picked, the check once decided), its title, the one fact that differs
   * (its open cards while it waits on picks), its age, and under them the
   * pages it links to as words: "After: …" for the pages one of its
   * decisions comes after, "Unlocks: …" for the pages that come after one of
   * its own, each a link that opens that page. The whole row opens its page.
   *
   * Needs you shows the longest wait first; Sent and Decided the newest
   * first, six of each and the rest behind one reveal. The marks, titles,
   * facts and ages of every group stand on four shared edges (one grid, each
   * row its subgrid); in a narrow pane a row is its title with its age at
   * its end, then the fact, then the links. Needs you is a mark beside its
   * word, never a fill (DESIGN.md, Needs you). A page is decided by his
   * Send, so Decided holds every page he sent picks on, tasks or none. A
   * search reads each page's title, its cards' questions and its record's
   * answers (each chosen option, and the why behind it); a line it finds
   * stands under its row. Under it the row's one act, Make tasks on a sent
   * or decided page with no tasks, takes the age's place while a resting
   * pointer is on the row; on a phone it is the page's own.
   */
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconChevronDown,
    IconClose,
    IconSearch,
    IconSend,
    IconSuccess,
  } from "#lib/icons.js";
  import { formatAgeShort, formatTimestamp } from "#lib/utils/time.js";
  import { makeDecisionTasks } from "./decisions-api";
  import { isDecided } from "./words";

  let {
    projectId,
    pages,
    now,
    hrefOf,
    onopen,
  }: {
    projectId: string;
    /** The project's pages; null while they are first read. */
    pages: DecisionPageSummary[] | null;
    now: number;
    /** A page's address in this tab. */
    hrefOf: (name: string) => string;
    /** A row, a link or a found question pressed: its page, opened here. */
    onopen: (name: string) => void;
  } = $props();

  type Group = "open" | "sent" | "decided";

  /** How many rows Sent and Decided show before their reveal. */
  const SHOWN = 6;
  /** The list's four edges: mark, title, fact, age; in a narrow pane the fact goes under the title. */
  const COLS =
    "var(--c-row-lead) minmax(0, 1fr) minmax(0, max-content) max-content";
  const COLS_NARROW = "var(--c-row-lead) minmax(0, 1fr) max-content";

  let query = $state("");
  const q = $derived(query.trim().toLowerCase());
  let unfolded = $state<Record<Group, boolean>>({
    open: true,
    sent: false,
    decided: false,
  });

  const has = (text: string) => text.toLowerCase().includes(q);
  /** The questions and answers a search finds on a page, three at most. */
  const hitsOf = (page: DecisionPageSummary): string[] =>
    q
      ? [...new Set([...page.questions, ...page.answers])]
          .filter(has)
          .slice(0, 3)
      : [];
  const found = (page: DecisionPageSummary) =>
    !q || has(page.title) || hitsOf(page).length > 0;

  const groupOf = (page: DecisionPageSummary): Group => {
    if (page.state === "picking") {
      return "open";
    }
    return page.state === "sent" ? "sent" : "decided";
  };

  const groups = $derived.by(() => {
    const listed = (pages ?? []).filter(found);
    const of = (group: Group) =>
      listed.filter((page) => groupOf(page) === group);
    return [
      {
        key: "open" as const,
        title: words.needsYou,
        pages: of("open").toSorted((a, b) => a.updatedAt - b.updatedAt),
      },
      {
        key: "sent" as const,
        title: words.sent,
        pages: of("sent").toSorted((a, b) => b.updatedAt - a.updatedAt),
      },
      {
        key: "decided" as const,
        title: words.decidedPill,
        pages: of("decided").toSorted((a, b) => b.updatedAt - a.updatedAt),
      },
    ];
  });
  const shownGroups = $derived(
    groups.filter(
      (group) => group.pages.length > 0 || (group.key === "open" && !q)
    )
  );
  const anyFound = $derived(groups.some((group) => group.pages.length > 0));

  const working = (page: DecisionPageSummary) =>
    !!page.writer && cawco.activityOf(page.writer.instanceId) === "working";

  /** Make tasks pressed on a row: the page it is running on, and a refusal by page. */
  let making = $state<string | null>(null);
  let refused = $state<Record<string, string>>({});
  async function makeTasks(name: string) {
    making = name;
    const { [name]: _was, ...rest } = refused;
    refused = rest;
    try {
      await makeDecisionTasks(projectId, name);
    } catch (error) {
      refused = { ...refused, [name]: failureWords(error) };
    } finally {
      making = null;
    }
  }

  /** A press that opens a page in place; a modified press keeps the browser's own. */
  function opening(event: MouseEvent, name: string) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onopen(name);
  }

  /** The query's matches in a line, marked; the rest as written. */
  function marked(text: string): { hit: boolean; part: string }[] {
    if (!q) {
      return [{ part: text, hit: false }];
    }
    const parts: { hit: boolean; part: string }[] = [];
    const lower = text.toLowerCase();
    let from = 0;
    for (
      let at = lower.indexOf(q);
      at !== -1;
      at = lower.indexOf(q, at + q.length)
    ) {
      if (at > from) {
        parts.push({ part: text.slice(from, at), hit: false });
      }
      parts.push({ part: text.slice(at, at + q.length), hit: true });
      from = at + q.length;
    }
    if (from < text.length) {
      parts.push({ part: text.slice(from), hit: false });
    }
    return parts;
  }
</script>

{#snippet hl(text: string)}
  {#each marked(text) as piece, index (index)}
    {#if piece.hit}<mark class="rounded-hair bg-selection text-inherit"
        >{piece.part}</mark
      >{:else}{piece.part}{/if}
  {/each}
{/snippet}

{#snippet links(label: string, to: DecisionLink[], kind: string)}
  <span class="inline" data-links={kind}>
    <span class="text-ink-muted">{label}</span>
    {#each to as link, index (link.name)}
      <a
        class="relative z-1 rounded-xs text-ink-strong underline decoration-border-control underline-offset-(--underline-offset) wrap-anywhere hover:decoration-ink-muted focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring"
        data-link-to={link.name}
        href={hrefOf(link.name)}
        onclick={(event) => opening(event, link.name)}>{link.title}</a
      >{index < to.length - 1 ? ", " : ""}
    {/each}
  </span>
{/snippet}

{#snippet sep()}
  <span aria-hidden="true" class="text-ink-subtle">·</span>
{/snippet}

{#snippet fact(page: DecisionPageSummary)}
  {@const open = page.cards - page.picked}
  {#if page.state === "picking"}
    {#if open > 0}
      <span class="whitespace-nowrap text-ink-strong" data-open={open}
        >{words.open(open)}</span
      >
    {:else}
      <span class="whitespace-nowrap text-ink-strong" data-open="0"
        >{words.notSent}</span
      >
    {/if}
    {#if page.notes > 0}
      <span class="whitespace-nowrap">{words.notes(page.notes)}</span>
    {/if}
  {:else if page.state === "sent"}
    <span class="whitespace-nowrap"
      >{words.pickedOf(page.picked, page.cards)}</span
    >
    {#if !page.writer || page.writer.ended}
      {@render sep()}
      <span class="whitespace-nowrap">{words.sessionEnded}</span>
    {:else if working(page)}
      {@render sep()}
      <span
        class="mark-line inline-flex items-center gap-space-1 whitespace-nowrap"
        ><LiveDot /><span>{words.workingOn}</span></span
      >
    {/if}
  {:else if page.state === "making"}
    <span
      class="mark-line inline-flex items-center gap-space-1 whitespace-nowrap"
      ><LiveDot /><span>{words.makingTasks}</span></span
    >
  {:else}
    <span class="whitespace-nowrap"
      >{page.tasks > 0
        ? words.decidedTasks(
            words.decided(page.decided, page.cards),
            page.tasks
          )
        : words.decided(page.decided, page.cards)}</span
    >
  {/if}
{/snippet}

{#snippet row(page: DecisionPageSummary)}
  {@const hits = hitsOf(page)}
  {@const act =
    (page.state === "sent" || page.state === "decided") &&
    page.picked > 0 &&
    page.tasks === 0 &&
    making !== page.name}
  <!-- mark-line: the row is a grid; its mark stands in the lead column, centred on the title's first line by its own cell -->
  <div
    data-slot="decision-row"
    class="group/row relative isolate col-span-full grid min-h-c-row-h grid-cols-subgrid items-center gap-y-space-1 px-space-2 py-space-2 before:absolute before:inset-y-px before:inset-x-0 before:-z-1 before:rounded-sm before:transition-[background-color] before:duration-(--dur-ghost) before:ease-in-out hover:not-active:before:bg-surface-hover active:before:bg-surface-pressed [&+&]:border-t [&+&]:border-border-hairline @max-decisions-520px/decisions:items-start"
    data-flip
    data-page={page.name}
    data-standing={page.state}
  >
    <span
      class="col-start-1 row-start-1 grid place-items-center @max-decisions-520px/decisions:h-lh @max-decisions-520px/decisions:type-label"
      data-slot="mark"
    >
      {#if isDecided(page) && page.state === "decided"}
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-glyph"
        />
      {:else}
        <span
          class="grid place-items-center group-data-[standing=picking]/row:text-ink-strong text-ink-muted"
        >
          <TaskRing
            done={page.state === "making" ? 0 : page.picked}
            indeterminate={page.state === "making"}
            total={page.cards}
          />
        </span>
      {/if}
    </span>
    <a
      class="col-start-2 row-start-1 min-w-0 type-label text-pretty wrap-anywhere text-ink-row no-underline after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:outline-(length:--focus-ring-width) focus-visible:after:outline-solid focus-visible:after:outline-focus-ring focus-visible:after:-outline-offset-2"
      data-slot="title"
      href={hrefOf(page.name)}
      onclick={(event) => opening(event, page.name)}>{@render hl(page.title)}</a
    >
    <span
      class="col-start-3 row-start-1 flex min-w-0 flex-wrap items-center gap-x-space-1 type-meta num text-ink-muted @max-decisions-520px/decisions:col-span-2 @max-decisions-520px/decisions:col-start-2 @max-decisions-520px/decisions:row-start-2"
      data-slot="fact"
    >
      {@render fact(page)}
    </span>
    <span
      class="col-start-4 row-start-1 grid items-center justify-items-end *:col-start-1 *:row-start-1 @max-decisions-520px/decisions:col-start-3"
      data-slot="end"
    >
      {#if page.updatedAt > 0}
        <span
          class="type-meta num whitespace-nowrap text-ink-muted transition-opacity duration-(--dur-control) ease-out data-act:can-hover:group-hover/row:opacity-0 data-act:group-focus-within/row:opacity-0"
          data-act={act || undefined}
          data-slot="age"
          title={words.lastChanged(formatTimestamp(new Date(page.updatedAt)))}
        >
          <span aria-hidden="true">{formatAgeShort(page.updatedAt, now)}</span>
          <span class="sr-only"
            >{words.lastChanged(
              formatTimestamp(new Date(page.updatedAt))
            )}</span
          >
        </span>
      {/if}
      {#if act || making === page.name}
        <span
          class="relative z-1 invisible opacity-0 transition-opacity duration-(--dur-control) ease-out can-hover:group-hover/row:visible can-hover:group-hover/row:opacity-100 group-focus-within/row:visible group-focus-within/row:opacity-100 data-making:visible data-making:opacity-100 @max-decisions-520px/decisions:hidden"
          data-making={making === page.name || undefined}
        >
          <Button
            data-row-act="make-tasks"
            label={words.makeTasks}
            onclick={() => makeTasks(page.name)}
            pending={making === page.name}
            pendingLabel={words.making}
            size="xs"
            variant="ghost"
          />
        </span>
      {/if}
    </span>
    {#if page.after.length > 0 || page.unlocks.length > 0}
      <p
        class="col-span-3 col-start-2 m-0 flex min-w-0 flex-wrap gap-x-space-3 gap-y-space-1 type-meta text-pretty"
        data-slot="links"
      >
        {#if page.after.length > 0}
          {@render links(words.after, page.after, "after")}
        {/if}
        {#if page.unlocks.length > 0}
          {@render links(words.unlocks, page.unlocks, "unlocks")}
        {/if}
      </p>
    {/if}
    {#if hits.length > 0}
      <ul
        class="col-span-3 col-start-2 m-0 grid list-none p-0"
        data-slot="hits"
      >
        {#each hits as hit (hit)}
          <li class="min-w-0">
            <a
              class="relative z-1 block py-space-1 type-meta text-pretty wrap-anywhere text-ink-strong no-underline hover:underline"
              data-hit
              href={hrefOf(page.name)}
              onclick={(event) => opening(event, page.name)}
              >{@render hl(hit)}</a
            >
          </li>
        {/each}
      </ul>
    {/if}
    {#if refused[page.name]}
      <p
        class="col-span-3 col-start-2 m-0 type-meta text-pretty wrap-anywhere text-error-11"
        role="alert"
      >
        {refused[page.name]}
      </p>
    {/if}
  </div>
{/snippet}

<div class="flex min-w-0 flex-col gap-space-3" data-slot="decisions-list">
  <div class="w-full max-w-c-measure-short" data-slot="search">
    <InputGroup.Root>
      <InputGroup.Addon><IconSearch /></InputGroup.Addon>
      <InputGroup.Input
        aria-label={words.search}
        disabled={pages === null}
        onkeydown={(event: KeyboardEvent) => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            event.stopPropagation();
            query = "";
          }
        }}
        placeholder={words.search}
        type="search"
        bind:value={query}
      />
      {#if query}
        <InputGroup.Addon align="inline-end">
          <InputGroup.Button
            aria-label={words.clearSearch}
            onclick={() => {
              query = "";
            }}
            size="icon-xs"
            title={words.clearSearch}
          >
            <IconClose />
          </InputGroup.Button>
        </InputGroup.Addon>
      {/if}
    </InputGroup.Root>
  </div>

  {#if pages === null}
    <!-- The list's frame at its size while the pages are read (The Claim Of Nothing Rule). -->
    <div
      aria-busy="true"
      class="grid gap-y-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
      data-slot="list-skeleton"
    >
      <Skeleton line="label" radius="text" width="name" />
      {#each [62, 48, 70, 40] as width (width)}
        <Skeleton
          class="w-(--w)"
          line="label"
          radius="text"
          style="--w: {width}%"
        />
      {/each}
    </div>
  {:else if q && !anyFound}
    <div
      class="flex flex-col items-start gap-space-2 py-space-6"
      data-slot="no-match"
    >
      <h3 class="m-0 type-title text-balance wrap-anywhere text-ink-strong">
        {words.noMatch(query.trim())}
      </h3>
      <Button
        class="mt-space-2"
        label={words.clearSearch}
        onclick={() => {
          query = "";
        }}
        variant="outline"
      />
    </div>
  {:else}
    <div
      class="grid grid-cols-(--list-cols) gap-x-space-3 rounded-lg bg-surface-raised p-space-1 shadow-tile @max-decisions-520px/decisions:grid-cols-(--list-cols-narrow)"
      data-slot="list"
      style:--list-cols={COLS}
      style:--list-cols-narrow={COLS_NARROW}
      {@attach reflow()}
    >
      {#each shownGroups as group (group.key)}
        {@const unfold = !!q || unfolded[group.key]}
        {@const head = unfold ? group.pages : group.pages.slice(0, SHOWN)}
        {@const rest = group.pages.length - head.length}
        <section
          aria-labelledby="dgroup-{group.key}"
          class="col-span-full grid grid-cols-subgrid [&+&]:border-t [&+&]:border-border-hairline"
          data-count={group.pages.length}
          data-group={group.key}
        >
          <div
            class="col-span-full grid min-h-c-pill-h grid-cols-subgrid items-center px-space-2 pt-space-3 pb-space-2"
          >
            <span class="grid place-items-center" data-slot="group-mark">
              {#if group.key === "open"}
                {#if group.pages.length > 0}
                  <!-- Needs you: the status dot in spark beside its word, never a fill. -->
                  <span
                    aria-hidden="true"
                    class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
                  ></span>
                {/if}
              {:else if group.key === "sent"}
                <IconSend
                  aria-hidden="true"
                  class="size-icon-md text-ink-muted"
                />
              {:else}
                <IconSuccess
                  aria-hidden="true"
                  class="size-icon-md text-status-done-glyph"
                />
              {/if}
            </span>
            <h3
              class="col-span-3 col-start-2 m-0 flex items-baseline gap-space-2 type-label text-ink-strong"
              id="dgroup-{group.key}"
            >
              <span>{group.title}</span>
              {#if group.pages.length > 0}
                <span class="type-meta num text-ink-muted" data-slot="count"
                  >{group.pages.length}</span
                >
              {/if}
            </h3>
          </div>
          {#if group.key === "open" && group.pages.length === 0}
            <p
              class="col-span-3 col-start-2 m-0 pb-space-3 type-meta text-ink-muted"
              data-slot="group-line"
            >
              {words.nothingWaits}
            </p>
          {/if}
          {#each head as page (page.name)}
            {@render row(page)}
          {/each}
          {#if rest > 0}
            <button
              aria-expanded="false"
              class="mark-line col-span-3 col-start-2 -ms-space-2 mt-space-1 mb-space-2 inline-flex h-c-btn-h-xs items-center gap-space-1 justify-self-start rounded-xs px-space-2 type-label text-ink-muted transition-[background-color,color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:text-ink-strong focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring"
              data-more={group.key}
              onclick={() => {
                unfolded = { ...unfolded, [group.key]: true };
              }}
              type="button"
            >
              <span>{words.more(rest, group.key)}</span>
              <IconChevronDown aria-hidden="true" class="size-icon-sm" />
            </button>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</div>
