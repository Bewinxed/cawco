<script lang="ts">
  /**
   * A project's memory, the strip's Memory tab (report 1 §1, report 2): the
   * pipeline the hub runs, drawn from its own data, so how memory works is
   * read off it (The Show Don't Tell Rule). Three blocks of the page
   * (blocks/BlockPage) in the person's arrangement, in the order the data
   * flows: Inbox (the notes agents leave), Facts (what the curator and Jev
   * sorted them into, and the person's own notes), In briefs (what the
   * briefs carried back out). Side by side on a desk, stacked on a phone;
   * each block's rows scroll inside it past --c-block-body-max.
   *
   * - **Inbox**: each note, who wrote it and when, and what Jev made of it
   *   (corroborates, changes or conflicts a fact, or waiting for the
   *   curator); its head carries the curator's last run and Curate now, and
   *   "Jev off" while Jev is. A run going says so under the head and the
   *   page reads every few seconds; a failed run is an alert there with Run
   *   again. A note's ⋯ withdraws it, asked in the page.
   * - **Facts**: "Your notes" first (AGENTS.md's `## Notes`, which every
   *   brief carries), then each fact file as its line run (one mark per
   *   line in its section's hue), its size against the fold's threshold,
   *   its 14-day use sparkline and when it changed; files with a conflict or
   *   a line that does not read first. The archive is one folded row at the
   *   foot, and the block ends in the field that adds to your notes. A
   *   file's ⋯ folds it or archives its unused lines; the head's archives
   *   every file's or reshapes them, each asked in the page.
   * - **In briefs**: the task briefs that carried lines, newest first, each
   *   with its lines and a meter of the budget's share they took.
   *
   * Nothing here writes curated memory: every act ends in a proposal the
   * person answers, landed on the row it concerns (The Stay In Context
   * Rule): a sort under its note, a fold or archive over its file, a
   * reshape at the top of Facts. A row becomes its result when the hub says
   * so, never before. The page is the hub's (memory-source.svelte.ts): a
   * fixture's on the states file.
   */
  import {
    type MemoryFileRow,
    type MemoryNoteRow,
    type MemoryProposalRow,
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
  import { failureWords } from "#lib/cawco/hub-read.js";
  import LineRun from "#lib/cawco/memory/LineRun.svelte";
  import MemoryProposal from "#lib/cawco/memory/MemoryProposal.svelte";
  import type { MemorySource } from "#lib/cawco/memory/memory-source.svelte.js";
  import UseSpark from "#lib/cawco/memory/UseSpark.svelte";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import RunStatus, { type Status } from "#lib/cawco/routines/RunStatus.svelte";
  import { exactOf, scheduleOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
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
    at === null ? "—" : since(at + source.skew);

  // --- the proposals, and the rows they land on ------------------------------------

  const proposals = $derived(page?.proposals ?? []);
  const inbox = $derived(page?.inbox ?? []);
  const files = $derived(page?.files ?? []);
  const names = $derived(new Map(files.map((file) => [file.path, file.name])));
  const ARCHIVE_PREFIX = "knowledge/archive/";
  /** A path a proposal changes, as the fact file it concerns: an archive's is its source's. */
  const factPathOf = (path: string): string =>
    path.startsWith(ARCHIVE_PREFIX)
      ? `knowledge/${path.slice(ARCHIVE_PREFIX.length)}`
      : path;

  /**
   * Where each proposal lands: under the inbox note it cites, else a
   * reshape at the top of Facts, else over the first fact file it changes,
   * else (AGENTS.md alone) over Your notes.
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
  /** Inbox's head: how the curator's last run went, in one glyph and its age. */
  const runStatus = $derived.by(
    (): { status: Status; text: string; title: string | null } => {
      if (!last) {
        return { status: "neutral", text: words.neverRun, title: null };
      }
      if (running) {
        return {
          status: "running",
          text: words.running,
          title: words.runningSince(exactOf(last.startedAt + source.skew)),
        };
      }
      const at = last.endedAt ?? last.startedAt;
      return {
        status: last.outcome === "failed" ? "failed" : "done",
        text: ago(at),
        title: [exactOf(at + source.skew), last.reason]
          .filter(Boolean)
          .join(" · "),
      };
    }
  );
  /** When the curator runs, as the empty Facts block says it. */
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

  function fileMenu(file: MemoryFileRow): RowAction[] {
    return [
      {
        label: words.open,
        icon: IconBook,
        onselect: () => onopen(file.path),
      },
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
            title: words.archiveAsk,
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
  const factsMenu = $derived<RowAction[]>([
    {
      label: words.archiveUnused,
      icon: IconArchive,
      disabled: fileCount === 0,
      onselect: () =>
        ask({
          at: "facts",
          title: words.archiveAsk,
          body: words.archiveAskLine,
          confirmLabel: words.archiveUnused,
          pendingLabel: words.archiving,
          run: () => source.archive(),
        }),
    },
    {
      label: reshapeOpen
        ? words.reshape
        : `${words.reshape} · ${words.reshapeOffered(page?.thresholds.reshapeAbove ?? 25)}`,
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
  ]);
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
  const curateMenu = $derived<RowAction[]>([
    {
      label: words.curateNow,
      icon: IconPlay,
      disabled: running || curating,
      onselect: () => {
        // biome-ignore lint/complexity/noVoid: the button's own state says it
        void curate();
      },
    },
  ]);

  // --- your notes' field ---------------------------------------------------------------

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

  // --- what a row says -------------------------------------------------------------------

  const lineCount = (file: MemoryFileRow) =>
    file.current + file.formerly + file.conflicts * 2 + file.unreadable;
  let archiveOpen = $state(false);
  const archiveLines = $derived(
    (page?.archive ?? []).reduce((sum, file) => sum + file.lines, 0)
  );
  const briefs = $derived(page?.briefs ?? []);

  /** Nothing remembered at all: no note, no fact, none of yours, no brief. */
  const blank = $derived(
    page !== null &&
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
      action: factsAction,
      content: factsBody,
      measure: "--c-block-routines",
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

{#snippet count(n: number, waiting: number)}
  <span data-num data-slot="count" class="count num">{n}</span>
  {#if waiting > 0}
    <span data-slot="needs" class="needs" title={words.notes(waiting)}
      ><IconNeedsYou aria-hidden="true" /><span class="sr-only"
        >, {waiting} waiting on you</span
      ></span
    >
  {/if}
{/snippet}
{#snippet inboxMeta()}
  {@render count(inbox.length, inboxWaiting)}
  {#if page && !page.jev}
    <Badge data-slot="jev-off" title={words.jevOffTitle}
      ><span>{words.jevOff}</span></Badge
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
  {@render count(briefs.length, 0)}
{/snippet}

{#snippet inboxAction()}
  <span class="head-run">
    <RunStatus
      said={null}
      status={runStatus.status}
      text={runStatus.text}
      title={runStatus.title}
    />
  </span>
  <span class="wide-only">
    <Button
      data-slot="curate"
      disabled={running}
      label={words.curateNow}
      onclick={curate}
      pending={curating || running}
      pendingLabel={words.curating}
      size="sm"
      variant="outline"
    />
  </span>
  <span class="phone-only">
    <RowMenu actions={curateMenu} label={words.inbox} />
  </span>
{/snippet}
{#snippet factsAction()}
  <RowMenu actions={factsMenu} label={words.facts} />
{/snippet}

<!-- What waits on the person, landed where it concerns. -->
{#snippet landedAt(at: string)}
  {#each proposalsAt(at) as proposal (proposal.id)}
    <li data-flip data-slot="landed" class="landed">
      <MemoryProposal {names} {proposal} {source} />
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
          <a class="link" href={last.href}>{words.openRun}</a>
        {/if}
      </p>
    {:else if failed && last}
      <Alert data-slot="run-failed" class="run-failed" variant="destructive">
        <AlertDescription
          >{words.runFailed(
            clock(last.startedAt),
            last.reason ?? "The hub gave no reason."
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
    {/if}
    {#if curateRefused}
      <p data-slot="refused" class="refused mark-line" role="status">
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
                  <Badge
                    data-box
                    data-slot="sort"
                    variant={note.sort.kind === "conflicts"
                      ? "attn"
                      : "default"}
                    ><span>{words.sorts[note.sort.kind]}</span></Badge
                  >
                  <button
                    class="to-file mark-line"
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
            <div class="row-ask">
              <AskHere {asker} at="note:{note.id}" />
            </div>
          </li>
          {@render landedAt(`note:${note.id}`)}
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

{#snippet fileRow(file: MemoryFileRow)}
  {#each proposalsAt(`file:${file.path}`) as proposal (proposal.id)}
    <li data-flip data-slot="landed" class="landed">
      <MemoryProposal {names} {proposal} {source} />
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
              limit={page?.thresholds.fileChars ?? 8000}
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
      ><RowMenu actions={fileMenu(file)} label={file.name} /></span
    >
    <div class="row-ask">
      <AskHere {asker} at="file:{file.path}" />
    </div>
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
      <p data-slot="note-refused" class="refused mark-line" role="status">
        <IconError aria-hidden="true" /><span>{noteRefused}</span>
      </p>
    {/if}
  </form>
{/snippet}

{#snippet factsBody()}
  <div class="block-body">
    <div class="row-ask head-ask"><AskHere {asker} at="facts" /></div>
    {#if files.length > 0}
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
      {#if page && page.yours.count > 0 && !narrow}
        {@render landedAt("yours")}
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
      {#each shownFiles as file (file.path)}
        {@render fileRow(file)}
      {/each}
    </ul>
    {#if files.length === 0 && page && page.yours.count === 0}
      <div class="no-facts">
        <p class="purpose">
          {runsWhen ? words.noFacts(runsWhen) : words.noFactsUnscheduled}
        </p>
        {#if inbox.length > 0}
          <Button
            label={words.curateNow}
            onclick={curate}
            pending={curating || running}
            pendingLabel={words.curating}
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
    {/if}
    {#if archiveLines > 0 && !narrow}
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
            {#each page?.archive ?? [] as file (file.path)}
              <li>
                <button
                  class="archive-file"
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
              <a class="name link-row" href={taskHref(brief.taskId)}
                >{brief.title}</a
              >
              <span class="cells">
                <span class="cell lines">
                  <span class="num">{brief.lines}</span>
                  <span
                    data-slot="share"
                    class="share"
                    aria-label={words.budgetHover(brief.lines, brief.share)}
                    role="img"
                    title={words.budgetHover(brief.lines, brief.share)}
                    ><span
                      class="share-fill"
                      style:inline-size="{brief.share * 100}%"
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
    <div class="unread">
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
    <!-- The three blocks at their size until the hub's first read (The Claim Of Nothing Rule). -->
    <div aria-hidden="true" class="skeletons">
      <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
      <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
      <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
    </div>
  {:else if blank}
    <div data-slot="memory-empty" class="empty">
      <EmptyState
        icon={IconBook}
        line={words.emptyLine}
        title={words.emptyTitle}
      >
        {#snippet action()}
          <div class="empty-field">{@render field()}</div>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div class="memory-view">
      <BlockPage {blocks} {items} page="memory" />
    </div>
  {/if}
</div>

<style>
  .memory-place {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .skeletons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
    gap: var(--space-group);
  }
  .unread,
  .empty {
    max-inline-size: 72ch;
  }
  .empty-field {
    inline-size: min(100%, var(--c-composer-w));
  }

  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .needs {
    display: inline-flex;
    color: var(--status-attn-glyph);
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
  .head-run {
    display: inline-flex;
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Curate now stands in the head where the block has the room; a narrow
     block's (a phone's, a desk's one column) is in its own ⋯, so the head
     never spills and a phone's one coral control stays Ask Caw (report 1, D).
     28rem holds the glyph, title, count, Jev off, the run's age, the button
     and both ⋯ on one line (a container query takes no var()): a phone's
     block, at its window's 390, does not. */
  .phone-only {
    display: none;
  }
  @container block (width < 28rem) {
    .wide-only {
      display: none;
    }
    .phone-only {
      display: inline-flex;
    }
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
  .row + .row {
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
  .row-ask {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }
  .row-ask:empty {
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

  @container memory-ledger (width >= 30rem) {
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
      inline-size: var(--c-routine-time-w);
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
    block-size: var(--c-toolbar-ctl);
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

  /* A brief: its task, then its lines with their share of the budget and when. */
  .link-row {
    text-decoration: none;
  }
  .link-row:hover {
    color: var(--ink-strong);
    text-decoration: underline;
  }
  .share {
    display: inline-block;
    inline-size: var(--space-8);
    block-size: var(--c-memory-meter-h);
    border-radius: var(--radius-hair);
    background: var(--surface-recess);
    overflow: clip;
  }
  .share-fill {
    display: block;
    block-size: 100%;
    background: var(--ink-muted);
  }

  /* The curator's run, under Inbox's head. */
  .running,
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
      opacity: 0.45;
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
  .no-facts {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding-block-end: var(--space-3);
  }
  .no-facts .purpose {
    padding-block-end: 0;
  }
  .no-facts :global(button) {
    margin-inline-start: var(--space-3);
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
  }

  /* Your notes' field: the block's foot, at the composer's field height. */
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
