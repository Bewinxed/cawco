<script lang="ts">
  /**
   * A project's memory, the strip's Memory tab (report 1 §1, report 2): the
   * pipeline the hub runs, drawn from its own data, so how memory works is
   * read off it (The Show Don't Tell Rule). Three blocks of the page
   * (blocks/BlockPage) in the person's arrangement, in the order the data
   * flows: Inbox (the notes agents leave), Knowledge (what the curator and
   * Jev sorted them into, and AGENTS.md), In briefs (what the
   * briefs carried back out). Side by side on a desk, stacked on a phone;
   * each block's rows scroll inside it past --c-block-body-max.
   *
   * - **Inbox**: each note, who wrote it and when, and what Jev made of it
   *   (waiting for the curator, or its sort's card under it); its head
   *   carries Curate inbox and "Jev off" while Jev is. The body's first line
   *   is the curator: when it last ran, or that it runs now (the page reads
   *   every few seconds), or a failed run's alert with Run again. A note's ⋯
   *   withdraws it, asked in the page.
   * - **Knowledge**: AGENTS.md first (its `## Notes`, which every
   *   brief carries), then each fact file as its line run (one mark per
   *   line in its section's hue), its size against the fold's threshold,
   *   its 14-day use sparkline and when it changed; files with a conflict or
   *   a line that does not read first. The archive is one folded row at the
   *   foot, and the block ends in the field that adds to AGENTS.md. A
   *   file's ⋯ folds it or archives its unused lines; the block's own ⋯
   *   archives every file's or reshapes them, each asked in the page.
   * - **In briefs**: the task briefs that carried lines, newest first, each
   *   with its lines and a meter of their characters, scaled to the
   *   busiest brief listed so the bars compare briefs.
   *
   * Nothing here writes curated memory: every act ends in a proposal the
   * person answers, landed on the row it concerns (The Stay In Context
   * Rule): a sort under its note, a fold or archive over its file, a
   * reshape at the top of Knowledge. A question asked in the page stands in
   * its own row under the one it concerns, so nothing of the row covers it. A row becomes its result when the hub says
   * so, never before. The page is the hub's (memory-source.svelte.ts): a
   * fixture's on the states file.
   */
  import {
    MAKE_A_NOTE,
    type MemoryFileRow,
    type MemoryNoteRow,
    type MemoryProposalRow,
    type MemoryThresholds,
    routinesWords,
    memoryViewWords as words,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import type { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
  import BlockPage, {
    type BlockItem,
  } from "#lib/cawco/blocks/BlockPage.svelte";
  import RowMenu, { type RowAction } from "#lib/cawco/config/RowMenu.svelte";
  import {
    failureWords,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import { idForWords, type SentWords } from "#lib/cawco/id.js";
  import LineRun from "#lib/cawco/memory/LineRun.svelte";
  import MemoryProposal from "#lib/cawco/memory/MemoryProposal.svelte";
  import type { MemorySource } from "#lib/cawco/memory/memory-source.svelte.js";
  import UseSpark from "#lib/cawco/memory/UseSpark.svelte";
  import {
    crossIn,
    crossOut,
    dur,
    easeOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import RunStatus, { type Status } from "#lib/cawco/routines/RunStatus.svelte";
  import { exactOf, scheduleOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconArrowRight,
    IconBook,
    IconChevronRight,
    IconError,
    IconHistory,
    IconLayers,
    IconNeedsYou,
    IconPlay,
    IconRefresh,
    IconToolNotebook,
    IconTrash,
    IconUnfold,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";

  let {
    project,
    source,
    blocks,
    viewItems,
    openPath = null,
    onopen,
    onraw,
    onhistory,
    taskHref,
    narrow = false,
    landing = null,
  }: {
    project: { id: string; name: string };
    source: MemorySource;
    blocks: ProjectBlocks;
    /** The custom views placed on this page, as blocks, by block id. */
    viewItems: Record<string, BlockItem>;
    /** The memory file open beside the view (`?file=`): its row reads chosen. */
    openPath?: string | null;
    /** Opens a memory file beside the view (AGENTS.md is the person's notes). */
    onopen: (path: string) => void;
    /** Opens a file as the folder holds it, raw. */
    onraw: (path: string) => void;
    /** Opens a memory file beside the view with its commits standing open. */
    onhistory: (path: string) => void;
    /** A task's place on the project page, for a brief's row. */
    taskHref: (id: string) => string;
    /** The Needs-you filter is on: only the rows a proposal waits on stand. */
    narrow?: boolean;
    /** The proposal a link names (`?proposal=`): its row is scrolled into view once read. */
    landing?: string | null;
  } = $props();

  $effect(() => source.keep());

  const page = $derived(source.page);
  const ago = (at: number | null): string =>
    at === null ? routinesWords.neverAt : since(at + source.skew);

  // --- the proposals, and the rows they land on ------------------------------------

  const proposals = $derived(page?.proposals ?? []);
  const inbox = $derived(page?.inbox ?? []);
  const files = $derived(page?.files ?? []);
  const ARCHIVE_PREFIX = "knowledge/archive/";
  /** A path a proposal changes, as the fact file it concerns: an archive's is its source's. */
  const factPathOf = (path: string): string =>
    path.startsWith(ARCHIVE_PREFIX)
      ? `knowledge/${path.slice(ARCHIVE_PREFIX.length)}`
      : path;

  /**
   * Where each proposal lands: under the inbox note it cites, else a
   * reshape at the top of Knowledge, else over the first knowledge file it
   * changes, else (AGENTS.md alone) over AGENTS.md's row.
   */
  const landed = $derived.by(() => {
    const at = new Map<string, string>();
    const noted = new Set(inbox.map((note) => note.id));
    const known = new Set(files.map((file) => file.path));
    for (const proposal of proposals) {
      const note = proposal.notes.find((id) => noted.has(id));
      const file = proposal.files
        .map(factPathOf)
        .find((path) => known.has(path));
      if (note) {
        at.set(proposal.id, `note:${note}`);
      } else if (proposal.kind === "reshape" || !file) {
        at.set(
          proposal.id,
          proposal.files.every((path) => path === "AGENTS.md")
            ? "yours"
            : "facts"
        );
      } else {
        at.set(proposal.id, `file:${file}`);
      }
    }
    return at;
  });
  const proposalsAt = (at: string): MemoryProposalRow[] =>
    proposals.filter((proposal) => landed.get(proposal.id) === at);

  /** What waits on the person in each block: the proposals landed there. */
  const inboxWaiting = $derived(
    proposals.filter((each) => landed.get(each.id)?.startsWith("note:")).length
  );
  const factsWaiting = $derived(proposals.length - inboxWaiting);

  const shownInbox = $derived(
    narrow ? inbox.filter((note) => note.proposal !== null) : inbox
  );
  const shownFiles = $derived(
    narrow ? files.filter((file) => file.proposals.length > 0) : files
  );
  /** AGENTS.md's row stands while it holds notes, narrowed to it when a proposal waits on it. */
  const yoursWaiting = $derived(proposalsAt("yours").length);
  const yoursShown = $derived(
    page !== null && page.yours.count > 0 && (!narrow || yoursWaiting > 0)
  );

  // A link's proposal, brought into view once the page has read it.
  let place = $state<HTMLElement | null>(null);
  let brought: string | null = null;
  $effect(() => {
    const id = landing;
    if (!(id && place && page && id !== brought)) {
      return;
    }
    untrack(() => {
      brought = id;
      requestAnimationFrame(() => {
        place
          ?.querySelector(`[data-proposal="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    });
  });

  // --- the curator -------------------------------------------------------------------

  const curator = $derived(page?.curator ?? null);
  const last = $derived(curator?.last ?? null);
  const running = $derived(
    last?.state === "starting" ||
      last?.state === "running" ||
      last?.state === "queued"
  );
  const failed = $derived(
    last?.state === "ended" && last.outcome === "failed" && !running
  );
  let curating = $state(false);
  let curateRefused = $state<string | null>(null);
  async function curate() {
    curating = true;
    curateRefused = null;
    try {
      await source.curate();
    } catch (error) {
      curateRefused = failureWords(error);
    } finally {
      curating = false;
    }
  }
  /** Inbox's first line while no run goes and none failed: when the curator last ran. */
  const runStatus = $derived.by(
    (): { status: Status; text: string; title: string | null } => {
      if (!last) {
        return { status: "neutral", text: words.neverRun, title: null };
      }
      const at = last.endedAt ?? last.startedAt;
      return {
        status: "done",
        text: words.curatedAgo(ago(at)),
        title: [exactOf(at + source.skew), last.reason]
          .filter(Boolean)
          .join(" · "),
      };
    }
  );
  /** When the curator runs, as the empty Knowledge block says it. */
  const runsWhen = $derived(
    curator
      ? scheduleOf(curator.cron, curator.timeZone, curator.nextSlot).words
      : null
  );
  const TIME = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const clock = (at: number) => TIME.format(at + source.skew);

  // --- asking in the page -------------------------------------------------------------

  const asker = new Asker<AskHereRequest>();
  function ask(request: AskHereRequest) {
    // biome-ignore lint/complexity/noVoid: the question keeps its own state
    void asker.ask(request);
  }
  const fileCount = $derived(files.filter((file) => !file.prose).length);
  const reshapeOpen = $derived(
    page ? fileCount > page.thresholds.reshapeAbove : false
  );

  function fileMenu(file: MemoryFileRow, archiveDays: number): RowAction[] {
    return [
      {
        label: words.fold,
        icon: IconUnfold,
        disabled: file.prose || file.proposals.length > 0,
        onselect: () =>
          ask({
            at: `file:${file.path}`,
            title: words.foldAsk(file.name),
            body: words.foldAskLine,
            confirmLabel: words.fold,
            pendingLabel: words.folding,
            run: () => source.fold(file.path),
          }),
      },
      {
        label: words.archiveUnused,
        icon: IconArchive,
        disabled: file.prose || file.proposals.length > 0,
        onselect: () =>
          ask({
            at: `file:${file.path}`,
            title: words.archiveAsk(archiveDays),
            body: words.archiveAskLine,
            confirmLabel: words.archiveUnused,
            pendingLabel: words.archiving,
            run: () => source.archive(file.path),
          }),
      },
      {
        label: words.history,
        icon: IconHistory,
        onselect: () => onhistory(file.path),
      },
      {
        label: words.openRaw,
        icon: IconLayers,
        onselect: () => onraw(file.path),
      },
    ];
  }
  const factsMenu = $derived<RowAction[]>(
    page ? factsActions(page.thresholds) : []
  );
  function factsActions(thresholds: MemoryThresholds): RowAction[] {
    return [
      {
        label: words.archiveUnused,
        icon: IconArchive,
        disabled: fileCount === 0,
        onselect: () =>
          ask({
            at: "facts",
            title: words.archiveAsk(thresholds.archiveDays),
            body: words.archiveAskLine,
            confirmLabel: words.archiveUnused,
            pendingLabel: words.archiving,
            run: () => source.archive(),
          }),
      },
      {
        label: reshapeOpen
          ? words.reshape
          : `${words.reshape} · ${words.reshapeOffered(thresholds.reshapeAbove)}`,
        icon: IconLayers,
        disabled: !reshapeOpen,
        onselect: () =>
          ask({
            at: "facts",
            title: words.reshapeAsk,
            body: words.reshapeAskLine,
            confirmLabel: words.reshape,
            pendingLabel: words.reshaping,
            run: () => source.reshape(),
          }),
      },
    ];
  }
  function noteMenu(note: MemoryNoteRow): RowAction[] {
    return [
      {
        label: words.withdraw,
        icon: IconTrash,
        destructive: true,
        disabled: note.proposal !== null,
        onselect: () =>
          ask({
            at: `note:${note.id}`,
            title: words.withdrawAsk,
            body: words.withdrawAskLine,
            confirmLabel: words.withdraw,
            pendingLabel: words.withdrawing,
            destructive: true,
            run: () => source.withdraw(note.id),
          }),
      },
    ];
  }

  // --- AGENTS.md's field: Make a note ---------------------------------------------------

  let noteText = $state("");
  let noting = $state(false);
  let noteRefused = $state<string | null>(null);
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
    } catch (error) {
      noteRefused = failureWords(error);
    } finally {
      noting = false;
    }
  }

  // --- the empty page's words to Caw ---------------------------------------------------

  /**
   * The empty page's one act (Empty Starts Work): "Make a note: " in Caw's
   * composer, unsent, the caret after it. A note is kept in AGENTS.md and
   * the page reads it; anything else the person writes there is words to
   * Caw, and the page goes to his thread.
   */
  const noteDraft = new ComposerDraft();
  let telling = $state(false);
  let tellRefused = $state("");
  let tellAgain = $state(false);
  let tellFoot = $state(0);
  let tellUnsent: SentWords | null = null;
  async function tell(text: string, fresh: string) {
    telling = true;
    tellRefused = "";
    tellAgain = false;
    tellUnsent = idForWords(tellUnsent, text, fresh);
    try {
      const thread = await source.tellCaw(text, tellUnsent.id);
      tellUnsent = null;
      if (!MAKE_A_NOTE.test(text.trim())) {
        await goto(threadHref(thread));
      }
    } catch (error) {
      noteDraft.restore(text);
      tellAgain = unreachable(error);
      tellRefused = tellAgain ? THREAD_SEND_UNREACHED : failureWords(error);
    } finally {
      telling = false;
    }
  }

  // --- what a row says -------------------------------------------------------------------

  const lineCount = (file: MemoryFileRow) =>
    file.current + file.formerly + file.conflicts * 2 + file.unreadable;
  let archiveOpen = $state(false);
  const archiveLines = $derived(
    page ? page.archive.reduce((sum, file) => sum + file.lines, 0) : 0
  );
  const briefs = $derived(page?.briefs ?? []);
  /** The most characters any listed brief's lines took: what each brief's meter is scaled to. */
  const busiest = $derived(Math.max(1, ...briefs.map((brief) => brief.chars)));

  /** Nothing remembered at all: no note, no fact, none of yours, no brief, no proposal. */
  const blank = $derived(
    page !== null &&
      proposals.length === 0 &&
      inbox.length === 0 &&
      files.length === 0 &&
      page.yours.count === 0 &&
      briefs.length === 0 &&
      (page.archive.length === 0 || archiveLines === 0)
  );

  /** The running line's arrival and leave: a fade (DESIGN.md, Fast Exit). */
  /** Read as each runs, in the browser: a token is the page's, never the server's. */
  const fadeIn = (node: Element) =>
    fade(node, { duration: dur("--dur-fade"), easing: easeOut });
  const fadeOut = (node: Element) =>
    fade(node, { duration: dur("--dur-exit"), easing: easeOut });

  /** The page's blocks while the first read is out: each its head, its body a skeleton; a placed view draws itself. */
  const loadingItems = $derived.by<Record<string, BlockItem>>(() =>
    Object.fromEntries(
      Object.entries(items).map(([id, item]) => [
        id,
        id in viewItems
          ? item
          : {
              ...item,
              meta: undefined,
              action: undefined,
              actions: undefined,
              content: skeletonBody,
            },
      ])
    )
  );

  const items = $derived<Record<string, BlockItem>>({
    inbox: {
      title: words.inbox,
      glyph: IconToolNotebook,
      meta: inboxMeta,
      action: inboxAction,
      content: inboxBody,
      measure: "--c-block-memory",
      hideable: true,
      body: "capped",
      card: true,
    },
    facts: {
      title: words.facts,
      glyph: IconBook,
      meta: factsMeta,
      actions: factsMenu,
      content: factsBody,
      measure: "--c-block-knowledge",
      hideable: true,
      body: "capped",
      card: true,
    },
    briefs: {
      title: words.briefs,
      glyph: IconArrowRight,
      meta: briefsMeta,
      content: briefsBody,
      measure: "--c-block-memory",
      hideable: true,
      body: "capped",
      card: true,
    },
    ...viewItems,
  });
</script>

{#snippet skeletonBody()}
  <div aria-hidden="true" class="skeleton-body">
    <Skeleton class="skeleton-fill" />
  </div>
{/snippet}

{#snippet count(n: number, waiting: number)}
  <span data-num data-slot="count" class="count num">{n}</span>
  {#if waiting > 0}
    <span data-slot="needs" class="needs" title={words.waitingOnYou(waiting)}
      ><IconNeedsYou aria-hidden="true" /><span class="sr-only"
        >, {words.waitingOnYou(waiting)}</span
      ></span
    >
  {/if}
{/snippet}
{#snippet inboxMeta()}
  {@render count(inbox.length, inboxWaiting)}
  {#if page && !page.jev}
    <!-- Its reason on hover, on focus and on a tap: the kit tooltip on a control. -->
    <Tooltip.Provider>
      <Tip label={words.jevOffTitle} tap>
        {#snippet children(tip)}
          <button
            {...tip}
            aria-describedby="memory-jev-off-{project.id}"
            class="jev-off touch-hit"
            data-slot="jev-off"
            type="button"><Badge><span>{words.jevOff}</span></Badge></button
          >
        {/snippet}
      </Tip>
    </Tooltip.Provider>
    <span id="memory-jev-off-{project.id}" class="sr-only"
      >{words.jevOffTitle}</span
    >
  {/if}
{/snippet}
{#snippet factsMeta()}
  {@render count(
    fileCount + (page && page.yours.count > 0 ? 1 : 0),
    factsWaiting
  )}
{/snippet}
{#snippet briefsMeta()}
  {#if briefs.length > 0}
    {@render count(briefs.length, 0)}
  {/if}
{/snippet}

{#snippet inboxAction()}
  <!-- One form at every width; gone while a failed run's Run again stands, and still while a run goes (the body's first line says so). -->
  {#if !failed}
    <Button
      aria-label={words.curateNow}
      class="touch-hit"
      data-slot="curate"
      disabled={running}
      icon={IconPlay}
      onclick={curate}
      pending={curating}
      size="icon-sm"
      title={words.curateNow}
      variant="ghost"
    />
  {/if}
{/snippet}

<!-- What waits on the person, landed where it concerns. -->
{#snippet landedAt(at: string)}
  {#each proposalsAt(at) as proposal (proposal.id)}
    <li data-flip data-slot="landed" class="landed">
      <MemoryProposal {proposal} {source} />
    </li>
  {/each}
{/snippet}

{#snippet inboxBody()}
  <div class="block-body">
    {#if running && last}
      <p data-slot="running" class="running mark-line" in:fadeIn out:fadeOut>
        <IconRefresh aria-hidden="true" class="breathing" />
        <span>{words.runningSince(clock(last.startedAt))}</span>
        {#if last.href}
          <span aria-hidden="true">·</span>
          <a class="link touch-hit" href={last.href}>{words.openRun}</a>
        {/if}
      </p>
    {:else if failed && last?.outcome === "failed"}
      <Alert data-slot="run-failed" class="run-failed" variant="destructive">
        <AlertDescription
          >{words.runFailed(
            clock(last.startedAt),
            last.reason
          )}</AlertDescription
        >
        <!-- Under the words, wrapping: a block is as narrow as one column. -->
        <div data-slot="run-acts" class="run-acts">
          <Button
            label={words.runAgain}
            onclick={curate}
            pending={curating}
            pendingLabel={words.curating}
            size="sm"
            variant="outline"
          />
          {#if last.href}
            <Button href={last.href} size="sm" variant="ghost"
              >{words.openRun}</Button
            >
          {/if}
        </div>
      </Alert>
    {:else}
      <p data-slot="run-line" class="run-line">
        <RunStatus
          said={null}
          status={runStatus.status}
          text={runStatus.text}
          title={runStatus.title}
        />
      </p>
    {/if}
    {#if curateRefused}
      <p data-slot="refused" class="refused mark-line" role="alert">
        <IconError aria-hidden="true" /><span>{curateRefused}</span>
      </p>
    {/if}
    {#if inbox.length === 0}
      <p class="purpose">{words.noInbox}</p>
    {:else}
      <ul class="rows" aria-label={words.inbox} {@attach reflow()}>
        {#each shownInbox as note (note.id)}
          <li data-flip data-note={note.id} class="row note">
            <div class="row-main">
              <p data-slot="title" class="note-text">{note.text}</p>
              <p data-slot="meta" class="meta mark-line">
                <span class="who">{note.author}</span>
                <span aria-hidden="true">·</span>
                <span class="num" title={exactOf(note.at + source.skew)}
                  >{ago(note.at)}</span
                >
                {#if note.sort}
                  <!-- Its sort is said by the card under it; the file it bears on opens from here. -->
                  <button
                    class="to-file mark-line touch-hit pointer-hit"
                    data-box
                    onclick={() => note.sort && onopen(note.sort.file)}
                    type="button"
                    ><IconArrowRight aria-hidden="true" /><span
                      >{note.sort.name}</span
                    ></button
                  >
                {:else if note.proposal === null}
                  <Badge data-box data-slot="sort" variant="secondary"
                    ><span>{words.waiting}</span></Badge
                  >
                {/if}
              </p>
            </div>
            <span class="row-menu"
              ><RowMenu actions={noteMenu(note)} label={note.text} /></span
            >
          </li>
          <li data-flip data-slot="ask-row" class="ask-row">
            <AskHere {asker} at="note:{note.id}" />
          </li>
          {@render landedAt(`note:${note.id}`)}
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

{#snippet fileRow(file: MemoryFileRow, thresholds: MemoryThresholds)}
  {#each proposalsAt(`file:${file.path}`) as proposal (proposal.id)}
    <li data-flip data-slot="landed" class="landed">
      <MemoryProposal {proposal} {source} />
    </li>
  {/each}
  <li
    data-flip
    data-file={file.path}
    class="row file"
    data-chosen={openPath === file.path ? "" : undefined}
  >
    <div class="row-main">
      <button
        class="opener"
        onclick={() => onopen(file.path)}
        title={file.description}
        type="button"
        ><span data-slot="name" class="name">{file.name}</span></button
      >
      <span data-slot="cells" class="cells">
        <span class="cell lines">
          {#if file.prose}
            <span class="meta">{words.notRead}</span>
          {:else}
            <LineRun
              chars={file.chars}
              limit={thresholds.fileChars}
              marks={file.marks}
            />
            <span class="num">{lineCount(file)}</span>
          {/if}
        </span>
        <span class="cell used">
          <UseSpark
            last={file.usedAt === null ? null : ago(file.usedAt)}
            uses={file.uses14}
          />
        </span>
        <span
          class="cell changed num"
          title={file.changedAt === null
            ? undefined
            : exactOf(file.changedAt + source.skew)}>{ago(file.changedAt)}</span
        >
      </span>
      {#if file.conflicts > 0 || file.unreadable > 0}
        <span data-slot="flags" class="flags">
          {#if file.conflicts > 0}
            <span data-slot="conflict" class="flag attn mark-line"
              ><IconNeedsYou aria-hidden="true" /><span
                >{words.conflicts(file.conflicts)}</span
              ></span
            >
          {/if}
          {#if file.unreadable > 0}
            <span data-slot="unread" class="flag fail mark-line"
              ><IconError aria-hidden="true" /><span
                >{words.notReadCount(file.unreadable)}</span
              ></span
            >
          {/if}
        </span>
      {/if}
    </div>
    <span class="row-menu"
      ><RowMenu
        actions={fileMenu(file, thresholds.archiveDays)}
        label={file.name}
      /></span
    >
  </li>
  <li data-flip data-slot="ask-row" class="ask-row">
    <AskHere {asker} at="file:{file.path}" />
  </li>
{/snippet}

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
      <p data-slot="note-refused" class="refused mark-line" role="alert">
        <IconError aria-hidden="true" /><span>{noteRefused}</span>
      </p>
    {/if}
  </form>
{/snippet}

{#snippet factsBody()}
  <div class="block-body">
    <div class="head-ask"><AskHere {asker} at="facts" /></div>
    {#if shownFiles.length > 0 || yoursShown}
      <!-- The ledger's columns, named over them on a wide ledger (report 2, A). -->
      <div aria-hidden="true" class="band">
        <span class="row-main">
          <span>{words.columnFile}</span>
          <span class="cells">
            <span class="cell lines">{words.columnLines}</span>
            <span class="cell used">{words.columnUsed}</span>
            <span class="cell changed">{words.columnChanged}</span>
          </span>
        </span>
        <span class="menu-room"></span>
      </div>
    {/if}
    <ul class="rows" aria-label={words.facts} {@attach reflow()}>
      {@render landedAt("facts")}
      {@render landedAt("yours")}
      {#if page && yoursShown}
        <li
          data-flip
          data-file="AGENTS.md"
          class="row file yours"
          data-chosen={openPath === "AGENTS.md" ? "" : undefined}
        >
          <div class="row-main">
            <button
              class="opener"
              onclick={() => onopen("AGENTS.md")}
              type="button"
              ><span data-slot="name" class="name">{words.yourNotes}</span
              ></button
            >
            <span data-slot="cells" class="cells">
              <span class="cell lines"
                ><span class="num">{page.yours.count}</span></span
              >
              <span class="cell used"
                ><span class="meta every">{words.everyBrief}</span></span
              >
              <span class="cell changed num">{ago(page.yours.changedAt)}</span>
            </span>
          </div>
          <span class="row-menu"
            ><RowMenu
              actions={[
                {
                  label: words.openRaw,
                  icon: IconLayers,
                  onselect: () => onraw("AGENTS.md"),
                },
              ]}
              label={words.yourNotes}
            /></span
          >
        </li>
      {/if}
      {#if page}
        {#each shownFiles as file (file.path)}
          {@render fileRow(file, page.thresholds)}
        {/each}
      {/if}
    </ul>
    {#if files.length === 0 && page && page.yours.count === 0}
      <p class="purpose">
        {runsWhen ? words.noFacts(runsWhen) : words.noFactsUnscheduled}
      </p>
    {/if}
    {#if page && archiveLines > 0 && !narrow}
      <div class="archive">
        <button
          aria-expanded={archiveOpen}
          class="archive-toggle mark-line"
          onclick={() => {
            archiveOpen = !archiveOpen;
          }}
          type="button"
        >
          <IconChevronRight
            aria-hidden="true"
            class="chevron"
            data-open={archiveOpen ? "" : undefined}
          />
          <span>{words.archiveRow(archiveLines)}</span>
        </button>
        {#if archiveOpen}
          <ul class="archive-files" in:fadeIn out:fadeOut>
            {#each page.archive as file (file.path)}
              <li>
                <button
                  class="archive-file touch-hit"
                  onclick={() => onopen(file.path)}
                  type="button"
                  ><span class="name"
                    >{file.path.split("/").at(-1)?.replace(/\.md$/, "")}</span
                  ><span class="num meta">{words.lines(file.lines)}</span
                  ></button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    {@render field()}
  </div>
{/snippet}

{#snippet briefsBody()}
  <div class="block-body">
    {#if briefs.length === 0}
      <p class="purpose">{words.noBriefs}</p>
    {:else}
      <ul class="rows" aria-label={words.briefs} {@attach reflow()}>
        {#each briefs as brief (`${brief.taskId}@${brief.at}`)}
          <li data-flip class="row brief">
            <div class="row-main">
              <a class="link-row touch-hit" href={taskHref(brief.taskId)}
                ><span data-slot="name" class="name">{brief.title}</span></a
              >
              <span class="cells">
                <span class="cell lines">
                  <span class="num">{brief.lines}</span>
                  <span
                    data-slot="share"
                    class="share"
                    aria-label={words.briefHover(
                      brief.lines,
                      brief.chars,
                      busiest
                    )}
                    role="img"
                    title={words.briefHover(brief.lines, brief.chars, busiest)}
                    ><span
                      class="share-fill"
                      style:inline-size="{(brief.chars / busiest) * 100}%"
                    ></span></span
                  >
                </span>
                <span
                  class="cell changed num"
                  title={exactOf(brief.at + source.skew)}>{ago(brief.at)}</span
                >
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<div bind:this={place} class="memory-place" data-view-memory>
  {#if page === null && source.problem !== null}
    <div class="unread" in:crossIn out:crossOut>
      <EmptyState
        icon={IconBook}
        line={words.unavailableLine(project.name, source.problem)}
        title={words.unavailable}
      >
        {#snippet action()}
          <Button onclick={() => source.read()} variant="outline"
            >{words.retry}</Button
          >
        {/snippet}
      </EmptyState>
    </div>
  {:else if page === null}
    <!-- Until the hub's first read, the person's own page of blocks, each body its skeleton: their order, widths, hidden blocks and placed views, so what arrives lands where it stood (The Claim Of Nothing Rule; the kit's skeleton keeps the wait's grace). -->
    <div
      class="memory-view"
      data-slot="memory-skeletons"
      in:crossIn
      out:crossOut
    >
      <BlockPage {blocks} items={loadingItems} page="memory" />
    </div>
  {:else if blank}
    <div data-slot="memory-empty" class="empty" in:crossIn out:crossOut>
      <EmptyState
        icon={IconBook}
        line={words.emptyLine}
        title={words.emptyTitle}
      >
        {#snippet action()}
          <div class="empty-act">
            <ul aria-label={words.makeNote} class="kit-chips">
              <li>
                <button
                  class="kit-chip touch-hit"
                  data-slot="make-note"
                  onclick={() => noteDraft.ask(words.notePrefix)}
                  type="button"
                  ><IconToolNotebook aria-hidden="true" /><span
                    >{words.makeNote}</span
                  ></button
                >
              </li>
            </ul>
            <div
              data-slot="ask-caw"
              class="ask-caw"
              style:block-size="calc({tellFoot}px + var(--space-4))"
            >
              <Composer
                agentName="Caw"
                attach={false}
                draft={noteDraft}
                onfoot={(foot) => {
                  tellFoot = foot.stack;
                }}
                onstop={() => undefined}
                onsubmit={(text, _extras, id) => {
                  // biome-ignore lint/complexity/noVoid: the composer's sending and its refusal are the act's state
                  void tell(text, id);
                }}
                placeholder={words.notePlaceholder}
                sendAgain={tellAgain}
                sendError={tellRefused}
                sending={telling}
              />
            </div>
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div class="memory-view" in:crossIn out:crossOut>
      <BlockPage {blocks} {items} page="memory" />
    </div>
  {/if}
</div>

<style>
  .memory-place {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  /* A loading block's body: one skeleton, a capped body tall. */
  .skeleton-body :global(.skeleton-fill) {
    block-size: var(--c-block-body-max);
    border-radius: var(--radius-lg);
  }
  .unread,
  .empty {
    max-inline-size: 72ch;
  }
  /* The empty page's act: Make a note over Caw's composer, one measure. */
  .empty-act {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: min(100%, var(--c-memory-field-w));
  }
  .ask-caw {
    position: relative;
    flex: none;
    inline-size: 100%;
  }

  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .needs {
    display: inline-flex;
    color: var(--status-attn-glyph);
  }
  .jev-off {
    display: inline-flex;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    cursor: help;
  }
  .needs :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .running :global(svg),
  .refused :global(svg) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  /* A block's body: its rows, and what stands over and under them. */
  .block-body {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    container: memory-ledger / inline-size;
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0 var(--space-2);
    min-block-size: var(--c-row-h);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .row + .row,
  .ask-row + .row {
    border-block-start: 1px solid var(--border-hairline);
  }
  .row[data-chosen] {
    background: var(--surface-well);
  }
  .row-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .row-menu {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-self: center;
  }
  /* A question asked of a row: its own row under it, so the row's opener never covers its buttons. */
  .ask-row {
    min-inline-size: 0;
    padding: 0 var(--space-2) var(--space-2) var(--space-3);
  }
  .ask-row:empty,
  .head-ask:empty {
    display: none;
  }
  .head-ask {
    padding: 0 var(--space-3);
  }
  .landed {
    padding: var(--space-2) var(--space-3);
    list-style: none;
  }

  /* An inbox note: its words, whole up to two lines, then who and when and
     what Jev made of it. */
  .note-text {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-1);
    min-inline-size: 0;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .who {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .to-file {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .to-file :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }

  /* A fact file's row: its name opens it (the whole row its button); its
     line run, sparkline and age stand in fixed columns on a wide ledger, and
     fold into the line under its name on a narrow one. */
  .opener {
    display: block;
    max-inline-size: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .opener::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  .name {
    display: block;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .archive-file .name {
    min-inline-size: 0;
  }
  .row[data-chosen] .name {
    color: var(--ink-strong);
  }
  .cells {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-inline-size: 0;
  }
  .cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* The row's cells stand over its opener, so their hover words (the line
     run's size, the sparkline's uses, the exact time) are reachable. */
  .file .cell {
    position: relative;
    z-index: 1;
  }
  .every {
    display: inline;
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .flag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .flag :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .flag.attn {
    color: var(--status-attn-ink);
  }
  .flag.attn :global(svg) {
    color: var(--status-attn-glyph);
  }
  .flag.fail {
    color: var(--status-fail-ink);
  }
  .flag.fail :global(svg) {
    color: var(--status-fail-glyph);
  }

  /* From 35rem (the line --c-block-knowledge's description reckons; a
     container query takes no var()) the name keeps 10rem beside the fixed
     columns. */
  @container memory-ledger (width >= 35rem) {
    .file .row-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-1) var(--space-3);
    }
    .file .cells {
      flex-wrap: nowrap;
    }
    :is(.file, .band) .cell.lines {
      inline-size: var(--c-memory-lines-w);
    }
    :is(.file, .band) .cell.used {
      inline-size: var(--c-memory-used-w);
    }
    :is(.file, .band) .cell.changed {
      justify-content: flex-end;
      inline-size: var(--c-memory-age-w);
    }
    .file .flags {
      grid-column: 1 / -1;
    }
    /* The band over the columns: the row's own grid, so each label stands over its column. */
    .band {
      display: grid;
    }
    .band .row-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-1) var(--space-3);
    }
  }
  .band {
    display: none;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 var(--space-2);
    padding: 0 var(--space-2) 0 var(--space-3);
    block-size: var(--c-memory-band-h);
    align-items: center;
    background: var(--surface-band);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .band .cells {
    flex-wrap: nowrap;
  }
  .band .menu-room {
    inline-size: var(--c-btn-h-sm);
  }

  /* A brief: its task, then its lines with a meter of their characters against the busiest brief's, and when. */
  .link-row {
    display: block;
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }
  .link-row:hover .name {
    color: var(--ink-strong);
    text-decoration: underline;
  }
  .share {
    display: inline-block;
    inline-size: var(--space-8);
    block-size: var(--c-memory-meter-h);
    border-radius: var(--radius-hair);
    background: var(--meter-stale-track);
    overflow: clip;
  }
  .share-fill {
    display: block;
    block-size: 100%;
    background: var(--meter-share);
  }

  /* The curator's run, under Inbox's head. */
  .running,
  .run-line,
  .refused {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .refused {
    color: var(--status-fail-ink);
  }
  @media (prefers-reduced-motion: no-preference) {
    .running :global(.breathing) {
      animation: memory-breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes memory-breath {
    50% {
      opacity: var(--breath-floor);
    }
  }
  .link {
    color: var(--link-ink);
  }
  .block-body :global(.run-failed) {
    inline-size: auto;
    min-inline-size: 0;
    margin: var(--space-2) var(--space-3);
  }
  .block-body :global(.run-failed > *) {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .run-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }

  .purpose {
    max-inline-size: 72ch;
    margin: 0;
    padding: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The archive: one folded row at the foot, its files under it. */
  .archive {
    border-block-start: 1px solid var(--border-hairline);
  }
  .archive-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    min-block-size: var(--c-row-h);
    padding: 0 var(--space-3);
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: start;
    cursor: pointer;
    outline-offset: var(--focus-ring-inset);
  }
  .archive-toggle :global(.chevron) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    transition: rotate var(--dur-control) var(--ease-out);
  }
  .archive-toggle :global(.chevron[data-open]) {
    rotate: 90deg;
  }
  .archive-files {
    margin: 0;
    padding: 0 0 var(--space-2);
    list-style: none;
  }
  .archive-file {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    inline-size: 100%;
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-7);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    outline-offset: var(--focus-ring-inset);
  }

  /* AGENTS.md's field: the block's foot, at the composer's field height. */
  .add-note {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
  }
  .add-note :global(.note-field) {
    block-size: var(--c-composer-field);
  }
  .add-note .refused {
    padding: 0;
  }
</style>
