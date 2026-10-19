<script lang="ts">
  /**
   * One memory file, read as memory (report 1 §3 B and E, report 2 B′): the
   * card beside the Memory view on a desk (SideSurface, in the page's
   * Split), its own page with Back under 900px. The file's name is its
   * title; its head's second line is the row's own drawing again (its line
   * run and size meter, its 14-day sparkline), so the file is one object on
   * both sides of the open (The One Object Rule).
   *
   * - A fact file: Conflict first when there is one (both sides, each with
   *   its date and sources, and the way out: a note from the person), then
   *   Current, each line in strong ink with its `ruling` mark and its `Why:`
   *   indented under it, and a meta line of when it became true, the notes
   *   it rests on (a popover listing each, who and when) and the briefs that
   *   carried it (folding open to their titles); a line that does not read
   *   stands at its place in mono with the hub's reason and Open raw. Then
   *   Formerly, folded, each with its window.
   * - AGENTS.md: the person's own notes, each with its day, its ⋯ withdrawing
   *   it (asked in the page), and the field that adds one.
   * - A prose file (from before fact lines) reads as its markdown.
   *
   * Everything is the hub's (`GET …/memory/file`), read again as the page is.
   */
  import {
    type MemoryFactView,
    type MemoryFileView,
    type MemorySourceNote,
    routinesWords,
    memoryViewWords as words,
  } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import RowMenu, { type RowAction } from "#lib/cawco/config/RowMenu.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { since } from "#lib/cawco/rules.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconArchive,
    IconChevronDown,
    IconChevronLeft,
    IconError,
    IconHistory,
    IconLayers,
    IconNeedsYou,
    IconTrash,
    IconUnfold,
  } from "#lib/icons.js";
  import LineRun from "./LineRun.svelte";
  import type { MemoryChange, MemorySource } from "./memory-source.svelte";
  import UseSpark from "./UseSpark.svelte";

  let {
    source,
    path,
    onclose,
    onraw,
    page = false,
    backLabel = words.back,
    showHistory = false,
  }: {
    source: MemorySource;
    path: string;
    /** Close on a desk; Back on a phone. */
    onclose: () => void;
    /** Opens the file as the folder holds it, raw. */
    onraw: (path: string) => void;
    /** Under 900px: its own page, with Back, not a card beside the view. */
    page?: boolean;
    backLabel?: string;
    /** Opened from a row's History: the file's commits stand open. */
    showHistory?: boolean;
  } = $props();

  // --- its history: the folder's commits of it ------------------------------------------

  let historyOpen = $state(false);
  $effect.pre(() => {
    historyOpen = showHistory;
  });
  let changes = $state<MemoryChange[] | null>(null);
  let historyProblem = $state<string | null>(null);
  $effect(() => {
    const at = path;
    if (!historyOpen) {
      return;
    }
    const asOf = source.generation;
    source.history(at).then(
      (next) => {
        if (at === path && asOf === source.generation) {
          changes = next;
          historyProblem = null;
        }
      },
      (error: unknown) => {
        if (at === path) {
          historyProblem = failureWords(error);
        }
      }
    );
  });
  const historyItem = $derived<RowAction>({
    label: words.history,
    icon: IconHistory,
    onselect: () => {
      historyOpen = true;
    },
  });

  let view = $state<MemoryFileView | null>(null);
  let problem = $state<string | null>(null);

  // Read on open, and again each time the page is read (memory.changed).
  $effect(() => {
    const at = path;
    // Read again with the page: the newest read's answer is kept.
    const asOf = source.generation;
    source.file(at).then(
      (next) => {
        if (at === path && asOf === source.generation) {
          view = next;
          problem = null;
        }
      },
      (error: unknown) => {
        if (at === path) {
          problem = failureWords(error);
        }
      }
    );
  });

  const ago = (at: number | null): string =>
    at === null ? routinesWords.neverAt : since(at + source.skew);
  /** A note's day as this device's clock tells it (git blame's instant). */
  const LOCAL_DAY = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  });
  /** A fact's `since`/`until` day: a date, so read in UTC, never shifted by the zone. */
  const DAY = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  /** `2026-10-03` as "3 Oct". */
  const dayWords = (day: string): string => {
    const at = Date.parse(`${day}T00:00:00Z`);
    return Number.isNaN(at) ? day : DAY.format(at);
  };
  const MD = /\.md$/;
  /** The file's name: the hub's once read, its path's last part until then. */
  const title = $derived(
    view ? view.name : path.slice(path.lastIndexOf("/") + 1).replace(MD, "")
  );
  /** Its sections' headings' ids: one card per page, named by its path. */
  const headId = $derived(`memory-${path.replace(/[^\w-]/g, "-")}`);

  // --- the fact file's sections -------------------------------------------------------

  const facts = $derived(view?.kind === "facts" ? view : null);
  const conflicts = $derived.by(() => {
    const groups = new Map<number, MemoryFactView[]>();
    for (const fact of facts?.facts ?? []) {
      if (fact.section === "conflict" && fact.conflictGroup !== null) {
        groups.set(fact.conflictGroup, [
          ...(groups.get(fact.conflictGroup) ?? []),
          fact,
        ]);
      }
    }
    return [...groups.values()];
  });
  /** Current lines, and the lines that do not read, at their places. */
  const current = $derived(
    [
      ...(facts?.facts ?? [])
        .filter((fact) => fact.section === "current")
        .map((fact) => ({ line: fact.line, fact, bad: null })),
      ...(facts?.unreadable ?? []).map((bad) => ({
        line: bad.line,
        fact: null,
        bad,
      })),
    ].sort((a, b) => a.line - b.line)
  );
  const formerly = $derived(
    (facts?.facts ?? []).filter((fact) => fact.section === "formerly")
  );
  const lineTotal = $derived(
    (facts?.facts.length ?? 0) + (facts?.unreadable.length ?? 0)
  );
  const kilo = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  // --- what the person does here ------------------------------------------------------

  const asker = new Asker<AskHereRequest>();
  const fileMenu = $derived<RowAction[]>(
    facts
      ? [
          {
            label: words.fold,
            icon: IconUnfold,
            disabled: facts.prose || facts.proposals.length > 0,
            onselect: () =>
              // biome-ignore lint/complexity/noVoid: the question keeps its own state
              void asker.ask({
                at: "head",
                title: words.foldAsk(facts.name),
                body: words.foldAskLine,
                confirmLabel: words.fold,
                pendingLabel: words.folding,
                run: () => source.fold(facts.path),
              }),
          },
          {
            label: words.archiveUnused,
            icon: IconArchive,
            disabled: facts.prose || facts.proposals.length > 0,
            onselect: () =>
              // biome-ignore lint/complexity/noVoid: the question keeps its own state
              void asker.ask({
                at: "head",
                title: words.archiveAsk(facts.thresholds.archiveDays),
                body: words.archiveAskLine,
                confirmLabel: words.archiveUnused,
                pendingLabel: words.archiving,
                run: () => source.archive(facts.path),
              }),
          },
          historyItem,
          {
            label: words.openRaw,
            icon: IconLayers,
            onselect: () => onraw(path),
          },
        ]
      : [
          historyItem,
          {
            label: words.openRaw,
            icon: IconLayers,
            onselect: () => onraw(path),
          },
        ]
  );

  /** A note from the person: the field under one conflict's group (by its index), and the notes card's foot. */
  let noteText = $state("");
  let noting = $state(false);
  let noteRefused = $state<string | null>(null);
  let noteAt = $state<number | null>(null);
  async function addNote(event: SubmitEvent) {
    event.preventDefault();
    const text = noteText.trim();
    if (!text || noting) {
      return;
    }
    noting = true;
    noteRefused = null;
    try {
      await source.makeNote(text);
      noteText = "";
      noteAt = null;
    } catch (error) {
      noteRefused = failureWords(error);
    } finally {
      noting = false;
    }
  }
</script>

{#snippet field()}
  <form data-slot="add-note" class="add-note" onsubmit={addNote}>
    <Input
      aria-label={words.addLabel}
      class="note-field"
      disabled={noting}
      enterkeyhint="send"
      placeholder={words.addPlaceholder}
      bind:value={noteText}
    />
    {#if noteRefused}
      <p class="refused mark-line" role="alert">
        <IconError aria-hidden="true" /><span>{noteRefused}</span>
      </p>
    {/if}
  </form>
{/snippet}

{#snippet sources(fact: MemoryFactView)}
  {#if fact.from.length > 0}
    <Popover.Root>
      <Popover.Trigger class="sources touch-hit pointer-hit" data-slot="sources"
        >{words.fromNotes(fact.from.length)}</Popover.Trigger
      >
      <Popover.Content
        align="start"
        style="inline-size: min(var(--c-memory-sources-w), calc(100vi - var(--space-6)))"
      >
        <ul class="source-list">
          {#each fact.from as note (note.id)}
            {@render sourceRow(note)}
          {/each}
        </ul>
      </Popover.Content>
    </Popover.Root>
  {/if}
{/snippet}

{#snippet sourceRow(note: MemorySourceNote)}
  <li class="source">
    {#if note.where === "prose"}
      <span class="source-text">{note.text}</span>
    {:else if note.where === "gone"}
      <span class="source-text subtle">{note.id}</span>
    {:else}
      <span class="source-text">{note.text}</span>
      <span class="source-meta">{note.author} · {ago(note.at)}</span>
    {/if}
  </li>
{/snippet}

{#snippet factMeta(fact: MemoryFactView)}
  <!-- The meta line stays one line: it cuts at the sources chip, never at the uses' chevron (the control). -->
  <span data-slot="fact-meta" class="fact-meta">
    <span class="meta-words">
      {#if fact.ruling}
        <span>{dayWords(fact.ruling)}</span>
      {:else}
        <span>{words.since(dayWords(fact.since))}</span>
      {/if}
      {#if fact.until}
        <span>· {words.until(dayWords(fact.until))}</span>
      {/if}
      {#if fact.from.length > 0}
        <span aria-hidden="true">·</span>
        {@render sources(fact)}
      {/if}
    </span>
    {#if fact.section !== "formerly"}
      <span class="uses">
        {#if fact.uses.length === 0}
          <span class="subtle">{words.notUsed}</span>
        {:else}
          <span class="num"
            >{words.used(fact.uses.length, ago(fact.uses[0]?.at ?? null))}</span
          >
          <Collapsible.Trigger
            aria-label={words.briefsCarried}
            class="uses-chevron touch-hit pointer-hit"
          >
            <IconChevronDown aria-hidden="true" />
          </Collapsible.Trigger>
        {/if}
      </span>
    {/if}
  </span>
{/snippet}

{#snippet factRow(fact: MemoryFactView)}
  <li data-slot="fact" class="fact" data-line={fact.line}>
    <Collapsible.Root>
      <p data-slot="fact-text" class="fact-text">
        <span>{fact.text}</span>
        {#if fact.ruling}
          <Badge data-slot="ruling"><span>{words.ruling}</span></Badge>
        {/if}
      </p>
      {#if fact.why}
        <p data-slot="why" class="why">{words.why(fact.why)}</p>
      {/if}
      {@render factMeta(fact)}
      {#if fact.uses.length > 0}
        <Collapsible.Content fade reveal>
          <ul class="briefs">
            {#each fact.uses as use (`${use.taskId}@${use.at}`)}
              <li class="brief">
                <span class="brief-title">{use.title}</span>
                <span class="num subtle">{ago(use.at)}</span>
              </li>
            {/each}
          </ul>
        </Collapsible.Content>
      {/if}
    </Collapsible.Root>
  </li>
{/snippet}

{#snippet body()}
  <div class="file-body" data-memory-file={path}>
    {#if problem && !view}
      <p class="refused mark-line" role="alert">
        <IconError aria-hidden="true" /><span
          >{words.fileUnavailable(title, problem)}</span
        >
      </p>
    {:else if view === null}
      <div aria-hidden="true" class="skeleton-lines" in:crossIn out:crossOut>
        <Skeleton class="skeleton-line" />
        <Skeleton class="skeleton-line" />
        <Skeleton class="skeleton-line" />
      </div>
    {:else if view.kind === "notes"}
      <p data-slot="file-head" class="head-line">
        <span>{words.notes(view.notes.length)}</span>
        <span>· {words.loadedByEvery}</span>
        <span>· {words.changed(ago(view.changedAt))}</span>
      </p>
      <ul class="lines">
        {#each view.notes as note, index (index)}
          <li class="fact yours">
            <div class="yours-row">
              <p class="fact-text"><span>{note.text}</span></p>
              <RowMenu
                actions={[
                  {
                    label: words.withdraw,
                    icon: IconTrash,
                    destructive: true,
                    onselect: () =>
                      // biome-ignore lint/complexity/noVoid: the question keeps its own state
                      void asker.ask({
                        at: `yours:${index}`,
                        title: words.withdrawYoursAsk,
                        body: words.withdrawYoursAskLine,
                        confirmLabel: words.withdraw,
                        pendingLabel: words.withdrawing,
                        destructive: true,
                        run: () => source.withdrawYours(note.text),
                      }),
                  },
                ]}
                label={note.text}
              />
            </div>
            <span class="fact-meta"
              ><span class="meta-words"
                ><span
                  >{note.at === null
                    ? routinesWords.neverAt
                    : LOCAL_DAY.format(note.at)}</span
                >
                <span>· {words.you}</span></span
              ></span
            >
            <AskHere {asker} at="yours:{index}" />
          </li>
        {/each}
      </ul>
      {@render field()}
    {:else if view.prose}
      <Markdown source={view.content} />
    {:else}
      <div data-slot="file-head" class="head-line mark-line">
        <span data-box
          ><LineRun
            chars={view.chars}
            limit={view.thresholds.fileChars}
            marks={view.marks}
          /></span
        >
        <span class="num">{words.lines(lineTotal)}</span>
        <span class="num">· {kilo(view.chars)}</span>
        <span aria-hidden="true">·</span>
        <span data-box
          ><UseSpark
            last={view.usedAt === null ? null : ago(view.usedAt)}
            uses={view.uses14}
          /></span
        >
      </div>
      <AskHere {asker} at="head" />

      {#if conflicts.length > 0}
        <section
          data-slot="conflict"
          class="section"
          aria-labelledby="{headId}-conflict"
        >
          <h3 id="{headId}-conflict" class="section-title mark-line">
            <IconNeedsYou aria-hidden="true" class="attn-glyph" />
            <span>{words.conflict}</span>
            <span class="num subtle">{conflicts.length}</span>
          </h3>
          {#each conflicts as group, index (index)}
            <ul class="lines conflict">
              {#each group as fact (fact.line)}
                {@render factRow(fact)}
              {/each}
              <li class="conflict-way">
                <p class="conflict-line">{words.conflictLine}</p>
                {#if noteAt === index}
                  {@render field()}
                {:else}
                  <Button
                    onclick={() => {
                      noteAt = index;
                    }}
                    size="sm"
                    variant="outline">{words.makeNote}</Button
                  >
                {/if}
              </li>
            </ul>
          {/each}
        </section>
      {/if}

      <section
        data-slot="current"
        class="section"
        aria-labelledby="{headId}-current"
      >
        <h3 id="{headId}-current" class="section-title">
          <span>{words.current}</span>
          <span class="num subtle"
            >{current.filter((each) => each.fact).length}</span
          >
        </h3>
        <ul class="lines">
          {#each current as entry (entry.line)}
            {#if entry.fact}
              {@render factRow(entry.fact)}
            {:else if entry.bad}
              <li data-slot="unreadable" class="unreadable">
                <code class="raw">{entry.bad.text}</code>
                <span class="bad-why mark-line"
                  ><IconError aria-hidden="true" /><span
                    >{words.lineNotRead(entry.bad.why)}</span
                  ></span
                >
                <Button onclick={() => onraw(path)} size="xs" variant="outline"
                  >{words.openRaw}</Button
                >
              </li>
            {/if}
          {/each}
        </ul>
      </section>

      {#if formerly.length > 0}
        <Collapsible.Root>
          <section
            data-slot="formerly"
            class="section"
            aria-labelledby="{headId}-formerly"
          >
            <Collapsible.Trigger
              id="{headId}-formerly"
              class="section-title folder mark-line"
            >
              <IconChevronDown aria-hidden="true" class="fold-chevron" />
              <span>{words.formerly}</span>
              <span class="num subtle">{formerly.length}</span>
            </Collapsible.Trigger>
            <Collapsible.Content fade reveal>
              <ul class="lines formerly">
                {#each formerly as fact (fact.line)}
                  {@render factRow(fact)}
                {/each}
              </ul>
            </Collapsible.Content>
          </section>
        </Collapsible.Root>
      {/if}
    {/if}
    {#if historyOpen && view}
      <section
        data-slot="history"
        class="section"
        aria-labelledby="{headId}-history"
      >
        <h3 id="{headId}-history" class="section-title mark-line">
          <IconHistory aria-hidden="true" class="history-glyph" />
          <span>{words.history}</span>
        </h3>
        {#if historyProblem}
          <p class="refused mark-line" role="alert">
            <IconError aria-hidden="true" /><span>{historyProblem}</span>
          </p>
        {:else if changes === null}
          <Skeleton class="skeleton-line" />
        {:else if changes.length === 0}
          <p class="history-none">{words.noHistory}</p>
        {:else}
          <ul class="lines">
            {#each changes as change (change.sha)}
              <li class="change">
                <span class="change-message">{change.message}</span>
                <span class="change-meta"
                  >{change.author} · {ago(Date.parse(change.date))}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
{/snippet}

{#if page}
  <section aria-label={title} class="file-page">
    <header data-slot="page-head" class="page-head">
      <Button onclick={onclose} size="sm" variant="ghost">
        <IconChevronLeft />
        <span>{backLabel}</span>
      </Button>
      <span data-slot="page-title" class="page-title">{title}</span>
      <RowMenu actions={fileMenu} label={title} />
    </header>
    {@render body()}
  </section>
{:else}
  <SideSurface class="memory-file" label={title} {onclose} {title}>
    {#snippet actions()}
      <RowMenu actions={fileMenu} label={title} />
    {/snippet}
    {@render body()}
  </SideSurface>
{/if}

<style>
  .file-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }
  .page-head {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3) var(--space-2) var(--space-3);
  }
  .page-title {
    min-inline-size: 0;
    margin-inline-start: auto;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-body {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-5);
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-5);
  }
  .file-page .file-body {
    border-block-start: 1px solid var(--border-hairline);
  }
  .head-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .subtle {
    color: var(--ink-subtle);
  }

  /* Sections part by space; each headed in the label role with its count. */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .section-title,
  .section :global(.section-title) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-label);
    color: var(--ink-strong);
    text-align: start;
  }
  .section :global(.folder) {
    cursor: pointer;
  }
  .section :global(.fold-chevron) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    rotate: -90deg;
    transition: rotate var(--dur-control) var(--ease-out);
  }
  .section :global(.folder[data-state="open"] .fold-chevron) {
    rotate: 0deg;
  }
  .section-title :global(.attn-glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--status-attn-glyph);
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A fact: its words in strong ink, its Why indented to them, then its meta line. */
  .fact {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .fact-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .why {
    margin: 0;
    padding-inline-start: var(--space-4);
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .fact-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* What may run long gives way first; the uses and their chevron never do. */
  /* The skeleton lines stand at a line's height until the file is read. */
  .skeleton-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .file-body :global(.skeleton-line) {
    inline-size: min(100%, var(--c-block-memory));
    block-size: var(--space-4);
  }
  .meta-words {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    /* Cut along the line only, so a chip's touch area reaches past it. */
    overflow-x: clip;
    white-space: nowrap;
  }
  .meta-words > :global(*) {
    flex: none;
  }
  .meta-words > :global(.sources) {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow-x: clip;
    text-overflow: ellipsis;
  }
  .uses {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
    white-space: nowrap;
  }
  .fact-meta :global(.sources) {
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-decoration: underline dotted;
    text-underline-offset: var(--c-underline-offset);
    cursor: pointer;
  }
  .fact-meta :global(.uses-chevron) {
    display: inline-grid;
    place-items: center;
    inline-size: var(--c-btn-h-xs);
    block-size: var(--c-btn-h-xs);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .fact-meta :global(.uses-chevron svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    transition: rotate var(--dur-control) var(--ease-out);
  }
  .fact-meta :global(.uses-chevron[data-state="open"] svg) {
    rotate: 180deg;
  }
  .briefs {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-1) 0 0;
    padding: 0 0 0 var(--space-4);
    list-style: none;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .brief {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .brief-title {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A conflict: both sides in the attention pair, and the way out. */
  .conflict {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--status-attn-bg);
  }
  .conflict :global(.fact-text),
  .conflict :global(.fact-meta),
  .conflict :global(.sources) {
    color: var(--status-attn-ink);
  }
  .conflict-way {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .conflict-line {
    margin: 0;
    font: var(--type-meta);
    color: var(--status-attn-ink);
    text-wrap: pretty;
  }
  .formerly :global(.fact-text) {
    color: var(--ink-muted);
  }

  /* A line that does not read: at its place, in mono, with the hub's reason. */
  .unreadable {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .raw {
    max-inline-size: 100%;
    font: var(--type-code);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .bad-why {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
  }
  .bad-why :global(svg),
  .refused :global(svg) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .source-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .source {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .source-text {
    font: var(--type-meta);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .source-meta {
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  .section-title :global(.history-glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-muted);
  }
  .change {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .change-message {
    font: var(--type-meta);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .change-meta,
  .history-none {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .yours-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
  }
  .add-note {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    inline-size: 100%;
  }
  .add-note :global(.note-field) {
    block-size: var(--c-composer-field);
  }
  .refused {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
