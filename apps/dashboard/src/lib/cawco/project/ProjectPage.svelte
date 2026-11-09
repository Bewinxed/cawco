<script lang="ts">
  import { SETUP_PAGE, setupPageAt } from "@cawco/core/artifact-needs";
  import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
  import {
    BLOCK_PAGE_TITLES,
    type ShownBlockPage as BlockPageId,
    SHOWN_BLOCK_PAGES,
    viewOfBlock,
  } from "@cawco/core/blocks";
  import { detach } from "@cawco/core/detach";
  /**
   * The project's views (design §2, PRD §5.2): the head with Caw's face,
   * then the view; the view strip stands in the shell's bar on
   * a wide screen and under the head on a narrow one. On a phone (under
   * 640px) the page is the one scroller: the head scrolls away with the
   * view, and the views, Needs you and Ask Caw stand in one bar docked
   * at the foot where a session's composer docks (ViewBar). Board and Table
   * always; Calendar when a task carries a date; then each view
   * kept in `views/`, then each Caw drafted, marked `draft`, with Keep and
   * Discard over it. The tasks are the hub's: every change is a commit, so
   * the page shows what the hub answered and reads the list again after
   * each of its own writes, whenever the hub says the project's tasks
   * changed (`tasks.changed`: Caw filed one, an attempt moved one), on a
   * reconnect, and when the tab comes back.
   *
   * The view, the open task and the open file of the project's folder live
   * in the URL (`?view=`, `?task=`, `?file=`), so a link opens the same.
   * Needs you is a filter, not a stage: the tasks whose stage is of kind
   * `you`.
   *
   * A task opens in the page (DESIGN.md, The Open Page Rule): on a desk
   * beside the view it came from, in a resizable split (Split) whose width
   * and expansion the project keeps, the view live beside it, another card
   * swapping the task in place; under 900px it is its own page, with Back
   * (a history entry of its own, so the browser's back is Back too). A file
   * of the folder (FolderFile) opens the same way, in the task's place: one
   * stands beside the view at a time.
   */
  import type { StageKind } from "@cawco/core/views";
  import { blocksWords } from "@cawco/core/words/blocks";
  import { commonWords } from "@cawco/core/words/common";
  import { madeWords } from "@cawco/core/words/made";
  import { setupWords } from "@cawco/core/words/onboarding";
  import { projectWords } from "@cawco/core/words/project";
  import { viewsWords } from "@cawco/core/words/views";
  import { onMount, type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import {
    isBlockPage,
    ProjectBlocks,
  } from "#lib/cawco/blocks/arrangement.svelte.js";
  import BlockPage, {
    type BlockItem,
  } from "#lib/cawco/blocks/BlockPage.svelte";
  import {
    type BlockedRequest,
    cawco,
    type PendingPermission,
    requestView,
  } from "#lib/cawco/client.svelte.js";
  import DecisionsView from "#lib/cawco/decisions/DecisionsView.svelte";
  import { ProjectDecisions } from "#lib/cawco/decisions/decisions.svelte.js";
  import { firstRender } from "#lib/cawco/first-render.svelte.js";
  import { connectionStore } from "#lib/cawco/hub/socket.svelte.js";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import FolderFile from "#lib/cawco/project/FolderFile.svelte";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { ProjectBoard } from "#lib/cawco/project/project-board.svelte.js";
  import SetUpBar from "#lib/cawco/project/SetUpBar.svelte";
  import SetupBoard from "#lib/cawco/project/SetupBoard.svelte";
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import { SetupDraftSource } from "#lib/cawco/project/setup-draft.svelte.js";
  import {
    handedOver,
    setupLandsOnBoard,
    setupProgressOf,
  } from "#lib/cawco/project/setup-progress.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import {
    firstTodoStage,
    movesFrom,
    stageLabel,
  } from "#lib/cawco/project-tasks.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import { QUESTION_KEYS } from "#lib/cawco/question.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { refusals } from "#lib/cawco/refusals.svelte.js";
  import Split from "#lib/cawco/side/Split.svelte";
  import { tickersStore } from "#lib/cawco/stores/tickers.svelte.js";
  import BulkBar from "#lib/cawco/tasks/BulkBar.svelte";
  import NewTaskForm from "#lib/cawco/tasks/NewTaskForm.svelte";
  import { setTaskProject, waitsOnYou } from "#lib/cawco/tasks/needs.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskFilterPopover from "#lib/cawco/tasks/TaskFilterPopover.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import {
    activeCount,
    applyFilter,
    filterOf,
    type TaskFilter,
    writeFilter,
  } from "#lib/cawco/tasks/task-filter.js";
  import {
    type FindSeed,
    TaskFind,
    wordsOf,
  } from "#lib/cawco/tasks/task-find.svelte.js";
  import {
    isPicked,
    pickAll,
    pickTask,
  } from "#lib/cawco/tasks/task-select.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import { taskEdges } from "#lib/cawco/views/task-graph.js";
  import ViewCalendar, {
    calendarField,
  } from "#lib/cawco/views/ViewCalendar.svelte";
  import ViewCanvas from "#lib/cawco/views/ViewCanvas.svelte";
  import ViewMade from "#lib/cawco/views/ViewMade.svelte";
  import ViewOpenUi from "#lib/cawco/views/ViewOpenUi.svelte";
  import ViewRoutines from "#lib/cawco/views/ViewRoutines.svelte";
  import {
    projectHref,
    projectTab,
    tabOfPath,
  } from "#lib/cawco/workspace/tabs.js";
  import { workspace } from "#lib/cawco/workspace/workspace.svelte.js";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { NARROW_QUERY, PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconArtifactSheet,
    IconColumns,
    IconFileTable,
    IconLayers,
    IconMore,
    IconPlus,
    IconSparkles,
    IconToolTodo,
  } from "#lib/icons.js";
  import { graceWhile } from "#lib/platform/grace-while.svelte.js";
  import {
    failureClause,
    failureWords as message,
    unreachable,
  } from "#lib/platform/hub-read.js";
  import {
    crossOut,
    reveal,
    revealOut,
  } from "#lib/platform/motion/curves.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import { depart } from "#lib/platform/motion/share.svelte.js";
  import { store, stored } from "#lib/platform/storage.js";
  import { track } from "#lib/platform/track.js";
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { ProjectPageData } from "./project-page-data";

  let {
    front,
    projectId,
    seed,
  }: {
    /**
     * Its tab is its group's chosen one. A phone's swipe neighbour is drawn
     * beside it and is not: only the page in front draws Caw's panel
     * (CawFloat `front`), whose sheet stands over the whole screen.
     */
    front: boolean;
    /** The project this tab is. */
    projectId: string;
    /**
     * What the server read for it, on a cold load that named it
     * (project-page-data.ts); null when the tab opened in the browser,
     * which reads its tasks and stages itself as it mounts.
     */
    seed: ProjectPageData | null;
  } = $props();

  /**
   * The address this tab reads its view, its open task or file, its filter
   * and its decision card from: the URL while the URL is this project's,
   * else the address it last stood at in front (workspace
   * `projectSearchOf`), so a tab shown again is as it was left and a
   * project beside a conversation in a split keeps its own.
   */
  const shownUrl = $derived(page.shallow?.url ?? page.url);
  const ownsUrl = $derived(
    tabOfPath(shownUrl.pathname) === projectTab(projectId)
  );
  const here = $derived(
    ownsUrl
      ? shownUrl
      : new URL(
          projectHref(projectId, workspace.projectSearchOf(projectId)),
          shownUrl.origin
        )
  );
  // What this page writes into the URL is kept for when it is shown again.
  $effect(() => {
    if (ownsUrl) {
      workspace.keepProjectSearch(projectId, shownUrl.search + shownUrl.hash);
    }
  });

  const project = $derived(
    cawco.project(projectId) ?? untrack(() => seed?.project) ?? null
  );
  const machine = $derived.by(() => {
    const primary = project ? checkoutOf(project) : undefined;
    return primary
      ? (cawco.machines.find((row) => row.machineId === primary.machineId) ??
          untrack(() => seed?.machine) ??
          null)
      : null;
  });
  setTaskProject(() => projectId);

  /** An address's filter words, nothing found for them yet: TaskFind asks the hub as the tasks are read. */
  const wordless = (url: {
    readonly searchParams: { get: (name: string) => string | null };
  }): FindSeed => ({
    words: wordsOf(url.searchParams.get("q") ?? ""),
    found: null,
    problem: null,
  });

  /** A reason that already ends as a sentence does. */
  const SENTENCE_END = /[.!?]$/u;

  // --- the tasks: what the hub answered, from the load and each re-read ------

  /** What the hub found for the filter's words, first from the load (task-find). */
  const find = new TaskFind(
    () => projectId,
    untrack(() => seed?.find ?? wordless(here))
  );
  /** The board's data and its writes (project-board.svelte.ts). */
  const board = new ProjectBoard({
    project: () => projectId,
    seed: untrack(() => seed),
    find,
  });
  // A tab opened in the browser had no server read: it reads itself now.
  onMount(() => {
    if (!seed) {
      detach(board.refresh(), "refresh");
    }
  });
  /**
   * The project is not set up yet (hub tasks.ts `stagesOf`, source `none`):
   * no stages.md and no template. While Caw sets it up, its board is his
   * draft drawn as the board it becomes (SetupDraft, fed by the setup page
   * he writes: setup-draft.svelte.ts); with no setup under way, the scene
   * that offers one (SetupScene).
   */
  const notSetUp = $derived(board.stages?.source === "none");
  /** The project's starters, live: a new set the hub writes replaces the one its stages carried. */
  const starters = $derived(
    tickersStore.startersOf(projectId, "board", board.stages?.starters)
  );
  /** The empty Routines page's starters and the empty Decisions tab's, live as the board's. */
  const routineStarters = $derived(
    tickersStore.startersOf(
      projectId,
      "routines",
      board.stages?.routineStarters
    )
  );
  const decisionStarters = $derived(
    tickersStore.startersOf(
      projectId,
      "decisions",
      board.stages?.decisionStarters
    )
  );
  /** The task open beside the view, or as its own page on a phone: the URL's `?task=`. */
  const openTask = $derived(here.searchParams.get("task"));
  /** The folder's file open beside the view, or as its own page on a phone: the URL's `?file=`. */
  const openFile = $derived(here.searchParams.get("file"));
  let needsOnly = $state(false);
  let adding = $state(false);

  const stageList = $derived(board.stages?.stages ?? []);
  const kindById = $derived(
    new Map(board.tasks.map((task) => [task.id, task.kind]))
  );
  /** What waits on you: the hub's reasons, a session's ask, an action (needs.svelte.ts). */
  const needsYou = $derived(
    board.tasks.filter((task) => waitsOnYou(projectId, task))
  );
  /** The filter holds only while something needs you. */
  const filtering = $derived(needsOnly && needsYou.length > 0);
  /** What narrows every view of the tasks, kept in the URL (task-filter). */
  let filter = $state<TaskFilter>(untrack(() => filterOf(here.searchParams)));
  const narrowed = $derived(activeCount(filter));
  const shownTasks = $derived(
    applyFilter(filtering ? needsYou : board.tasks, filter, find.ids)
  );
  /** Needs you on, the columns those tasks stand in. */
  const shownStages = $derived(
    filtering
      ? stageList.filter((stage) =>
          needsYou.some((task) => task.stage === stage.name)
        )
      : stageList
  );
  const newIn = $derived(firstTodoStage(stageList)?.name);
  const empty = $derived(board.list !== null && board.list.tasks.length === 0);

  const allowedFrom = (stage: string): Set<string> =>
    board.stages ? movesFrom(board.stages, stage) : new Set();

  // --- Caw, the views and the data they bind to ------------------------------

  /**
   * The tab's first read of its tasks, opened in the browser with no server
   * read: once the wait outlasts --dur-wait-grace the board stands as its
   * skeleton and Caw reads it (design §2, Loading); a quick one shows
   * nothing of its own.
   */
  const leavingFor = $derived(
    board.list === null && board.listProblem === null
  );
  const reading = graceWhile(() => leavingFor);

  const lead = new CawLead({
    id: () => projectId,
    project: () => project,
    machinesOnline: () =>
      seed?.machinesOnline ??
      cawco.machines.some((row) => row.status === "online"),
    tasks: () => board.tasks,
    reading: () => reading.current,
  });
  /** You can talk to Caw, on or off: only a reason he cannot start (no machine) stops it. */
  const canTalk = $derived(lead.canTalk);
  /**
   * Arrived on the project, its board and its row read: his panel opens as
   * the person last left it here, else while the board is empty, so a
   * project just made opens on Caw (PRD §5.6; CawLead.arrive). Arriving on
   * a decision page or a draft on a phone, where his sheet would stand over
   * it, his panel stays put away.
   */
  $effect(() => {
    if (board.list !== null && lead.project !== null) {
      const blank = empty;
      untrack(() => lead.arrive(blank, sheetCovers()));
    }
  });
  /**
   * Words for Caw carried here (`?ask=`, from an empty state off this page:
   * the view route's, The Empty Starts Work Rule): once he is read they
   * stand in his panel's composer, the caret after them, nothing sent, and
   * the URL lets them go so a reload doesn't put them back.
   */
  $effect(() => {
    const words = here.searchParams.get("ask");
    if (!words || board.list === null || lead.project === null) {
      return;
    }
    untrack(() => {
      lead.draft.ask(words);
      lead.open = true;
      const url = new URL(here.href);
      url.searchParams.delete("ask");
      goto(url, { replace: true, reset: false }).catch(() => undefined);
    });
  });
  /** His panel stands docked beside the page, which yields it its room (CawFloat). */
  const docked = $derived(front && lead.open && lead.anchor !== null);

  /**
   * Pages are blocks (blocks/): each page's arrangement, as the hub keeps
   * it, and the kept views placed on a page as blocks there.
   */
  const blocks = new ProjectBlocks(
    () => projectId,
    () =>
      board.viewsRead
        ? board.views.filter((view) => !view.draft).map((view) => view.name)
        : null
  );

  /** The date field the calendar places tasks by; null: no Calendar tab. */
  const dateField = $derived(
    calendarField(
      board.dated ?? [],
      board.stages?.views.find((each) => each.name === "calendar")?.by ?? null
    )
  );
  const dateById = $derived(
    new Map(
      (board.dated ?? []).flatMap((task) => {
        const at = dateField ? task.dates[dateField] : undefined;
        return at === undefined ? [] : [[task.id, at] as const];
      })
    )
  );
  const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  /** A task set for a date says when, short, while it is still to come. */
  const dateOf = (id: string): string | null => {
    const at = dateById.get(id);
    const kind = kindById.get(id);
    return at !== undefined && kind !== "done" && kind !== "dropped"
      ? SHORT_DATE.format(at)
      : null;
  };

  // --- the strip ----------------------------------------------------------------

  /**
   * Where the strip stands: in the shell's bar on a wide screen, where the
   * crumb would only have said the name the head says (bar-strip); a
   * phone's bar is the burger's, so there it is the page's own row under
   * the head. The line the shell hosts a conversation's tabs by.
   */
  const narrowQuery = new MediaQuery(NARROW_QUERY);
  /** Under 900px a task is its own page, not the split beside the view (`phone`). */
  const sheetQuery = new MediaQuery("(width < 900px)");
  /** Under 640px the page is the one scroller, not the pane (the styles' own line). */
  const pageScrollsQuery = new MediaQuery(PHONE_QUERY, false);
  // The first paint, on both sides, has the width cookie's guess
  // (first-render.svelte.ts); the queries answer from a frame after mount.
  const wide = $derived(
    !(firstRender.held ? Boolean(page.data.narrow) : narrowQuery.current)
  );

  interface StripTab {
    draft: boolean;
    label: string;
    value: string;
  }
  const viewLabel = (name: string): string => stageLabel(name);
  const tabs = $derived<StripTab[]>([
    { value: "board", label: "Board", draft: false },
    { value: "table", label: "Table", draft: false },
    // Routines, the third tab, always there.
    { value: "routines", label: "Routines", draft: false },
    // The project's decision pages, always: an empty one starts Caw on one.
    { value: "decisions", label: "Decisions", draft: false },
    // The task graph, while the tasks draw one (an edge between two).
    ...(taskEdges(board.tasks).length > 0
      ? [{ value: "canvas", label: "Canvas", draft: false }]
      : []),
    ...(dateField
      ? [{ value: "calendar", label: "Calendar", draft: false }]
      : []),
    // What the project's tasks made, while one has made something.
    ...(board.tasks.some((task) => task.outputs.length > 0)
      ? [{ value: "made", label: madeWords.tab, draft: false }]
      : []),
    // A view placed on a page stands there as a block, and is no tab.
    ...board.views
      .filter((view) => view.draft || blocks.pageOfView(view.name) === null)
      .map((view) => ({
        value: `view:${view.name}`,
        label: viewLabel(view.name),
        draft: view.draft,
      })),
  ]);
  /** The views as a phone's bar lists them: Decisions with the pages waiting on picks. */
  const barViews = $derived(
    tabs.map((each) => ({
      ...each,
      count: each.value === "decisions" ? decisions.waiting : 0,
    }))
  );
  let tab = $derived(here.searchParams.get("view") ?? "board");
  /** The decision page open in the tab. */
  let decisionPage = $derived<string | null>(here.searchParams.get("page"));
  /** The card a link names (`#<card>`): the page opens scrolled to it. */
  let decisionCard = $derived<string | null>(
    here.hash ? decodeURIComponent(here.hash.slice(1)) : null
  );
  /** The setup page lands on the board while the project is not set up (setup-progress.ts `setupLandsOnBoard`). */
  const setupLands = (at: string | null, card: string | null): boolean =>
    setupLandsOnBoard(notSetUp, at, card);
  /** The view on screen: the one asked for once it exists, the board meanwhile. */
  const current = $derived.by(() => {
    if (tab === "decisions" && setupLands(decisionPage, decisionCard)) {
      return "board";
    }
    return tabs.some((each) => each.value === tab) ? tab : "board";
  });
  /** A view the URL names is still being read: its place holds a skeleton. */
  const awaiting = $derived(
    tab.startsWith("view:") && !board.viewsRead && current !== tab
  );

  // --- the Decisions tab ---------------------------------------------------------

  /** The project's decision pages (decisions.svelte.ts): the tab and its trail read them. */
  const decisions = new ProjectDecisions(() => projectId);
  /** The decision page the person has open, in the Decisions tab. */
  const openPage = $derived(current === "decisions" ? decisionPage : null);
  /**
   * On a phone Caw's panel is a sheet over the page's foot: an open
   * decision page stands under it, and so does a project's draft before it
   * is set up, which is its board (decision page `onboarding-first-minutes`,
   * card `draft-where`). Arriving on either, the sheet stays put away; the
   * draft bar's Answer Caw brings it up on his questions.
   */
  const sheetCovers = () =>
    pageScrollsQuery.current && (openPage !== null || notSetUp);
  /**
   * A decision page opened on a phone puts Caw's sheet away, as his Close
   * does (DESIGN.md, The Work Outlives Its Surface Rule): the sheet leaves
   * by its own exit, his conversation keeps its place, and his seat brings it
   * back over the page when the person asks. Only an opening moves it: his
   * panel reopened over the page stays.
   */
  $effect(() => {
    track(openPage);
    untrack(() => {
      if (lead.open && sheetCovers()) {
        lead.open = false;
      }
    });
  });
  interface DecisionsPlace {
    card?: string | null;
    page?: string | null;
  }

  /** A decision page of this project's, by its artifact: its name in Decisions (a task's sheet goes there for a card it waits on). */
  const pageOf = (artifactId: string): string | null =>
    decisions.list?.pages.find((one) => one.artifactId === artifactId)?.name ??
    null;
  /**
   * The view and the open task or file in the URL, so a link opens the
   * same. A task opened puts the file away; with none, the file open stays.
   */
  function hrefOf(
    id: string | null,
    as: string = current,
    place: DecisionsPlace = {},
    file: string | null = id ? null : openFile
  ): string {
    const query = new URLSearchParams();
    if (as !== "board") {
      query.set("view", as);
    }
    const at = {
      page: "page" in place ? (place.page ?? null) : decisionPage,
      card: "card" in place ? (place.card ?? null) : decisionCard,
    };
    if (as === "decisions" && at.page) {
      query.set("page", at.page);
    }
    if (id) {
      query.set("task", id);
    } else if (file) {
      query.set("file", file);
    }
    writeFilter(query, filter);
    const search = query.toString();
    const hash =
      as === "decisions" && at.page && at.card
        ? `#${encodeURIComponent(at.card)}`
        : "";
    return `/project/${projectId}${search ? `?${search}` : ""}${hash}`;
  }

  /** Where the Decisions tab goes: a page (at a card) or the list. */
  function decisionsGo(to: DecisionsPlace) {
    if ("page" in to) {
      decisionPage = to.page ?? null;
    }
    if ("card" in to) {
      decisionCard = to.card ?? null;
    }
    remember();
  }

  /**
   * A page of this project Caw's conversation shows opens in Decisions
   * (JOURNEY.md, Act on what waits: "a decision page opens in Decisions"),
   * where its frame tells the hub it is on screen (PageFrame): his panel
   * stands nothing beside his conversation (SessionPane `docked`), so the
   * reveal a panel acts on (client `revealPreview`: a new open frame, or
   * his artifact card pressed) is this page's. Only a reveal heard while
   * the page stands: the panel's frame as the page arrives leaves the view
   * the URL names. The setup page of a project not set up yet lands on the
   * board instead ({@link setupLands}).
   */
  let revealsSeen: { count: number | undefined; id: string } | null = null;
  $effect(() => {
    const id = lead.conversationId;
    const count = id ? cawco.previewRequests[id] : undefined;
    untrack(() => {
      const seen = revealsSeen;
      revealsSeen = id ? { id, count } : null;
      if (!(id && seen?.id === id && count !== seen.count)) {
        return;
      }
      const frame = cawco.previews[id];
      if (!(
        frame?.state === "open" &&
        frame.project === projectId &&
        frame.artifact.kind === "page"
      )) {
        return;
      }
      if (setupLands(frame.artifact.name, null)) {
        choose("board");
        return;
      }
      decisionsGo({ page: frame.artifact.name, card: null });
      choose("decisions");
    });
  });
  // The URL says the board too once the setup page lands on it, so a reload
  // or a shared link opens where the person is.
  $effect(() => {
    if (!(tab === "decisions" && setupLands(decisionPage, decisionCard))) {
      return;
    }
    untrack(() => {
      tab = "board";
      decisionPage = null;
      remember();
    });
  });

  /** The time the rows' ages read, moved each minute while the tab shows. */
  let decisionsNow = $state(Date.now());
  $effect(() => {
    if (current !== "decisions") {
      return;
    }
    decisionsNow = Date.now();
    const ticking = setInterval(() => {
      decisionsNow = Date.now();
    }, 60_000);
    return () => clearInterval(ticking);
  });

  const taskOf = (id: string) => {
    const task = board.tasks.find((each) => each.id === id);
    return task ? { kind: task.kind, title: task.title } : undefined;
  };

  function remember() {
    if (!browser) {
      return;
    }
    try {
      goto(hrefOf(openTask), {
        shallow: true,
        replace: true,
        state: page.state,
      });
    } catch {
      // Before the router is ready the URL is already right.
    }
  }

  /**
   * The panes swap as the New session dialog's lists do (motion/list-swap,
   * its keyframes and timings): the view on screen leaves over the pane's
   * top and the next comes in once it has gone. The pane is the viewport's
   * height whatever it shows, so there is no height to follow: its children
   * (a board that fills it, a calendar sized to it) take their size from
   * it, and a morph() here would have nothing of theirs to tween to. What
   * leaves is the view itself, held by its outro as
   * the hover panel holds its old content (HoverPanel `swapOut`): a view is
   * never mounted a second time to be animated out, so a board, a calendar
   * or a drawn view leaves as it stood and is torn down once, after.
   */
  const swap = new ListSwap<never>();
  const leave = swap.leaveView;
  /** What the pane shows: a view, or the wait for one the URL names. */
  const shown = $derived(awaiting ? "awaiting" : current);
  function choose(next: string) {
    if (next === current) {
      return;
    }
    const order = tabs.map((each) => each.value);
    swap.swap([], order.indexOf(next) > order.indexOf(current) ? 1 : -1);
    tab = next;
    remember();
  }

  /**
   * Under 900px a task is its own page (the session split's line), read off
   * the screen.
   */
  const phone = $derived(firstRender.held ? !wide : sheetQuery.current);

  /**
   * Opens a task: on a desk beside the view, swapping the one open in place;
   * on a phone as its own page, a history entry of its own.
   */
  function openOne(id: string) {
    if (id === openTask) {
      return;
    }
    if (phone) {
      goto(hrefOf(id), { shallow: true, state: { taskOpened: true } });
    } else {
      goto(hrefOf(id), { shallow: true, replace: true, state: page.state });
    }
  }

  /** Close on a desk, Back on a phone: the view, as it stood. */
  function closeTask() {
    if (phone && page.state.taskOpened) {
      history.back();
      return;
    }
    goto(hrefOf(null), { shallow: true, replace: true, state: {} });
  }

  /** Close on a desk, Back on a phone, for the folder's file: the view, as it stood. */
  function closeFile() {
    if (phone && page.state.fileOpened) {
      history.back();
      return;
    }
    goto(hrefOf(null, current, {}, null), {
      shallow: true,
      replace: true,
      state: {},
    });
  }

  /**
   * What the split's side holds: the open file, else the open task, kept
   * while the side closes, so it leaves as it stood.
   */
  let sideHeld = $state<{ file: string } | { task: string } | null>(null);
  $effect(() => {
    if (openFile) {
      sideHeld = { file: openFile };
    } else if (openTask) {
      sideHeld = { task: openTask };
    }
  });
  const viewWord = $derived(
    (
      tabs.find((each) => each.value === current)?.label ?? "Board"
    ).toLowerCase()
  );

  // --- the filter and a bulk change ------------------------------------------

  function setFilter(next: TaskFilter) {
    filter = next;
    remember();
  }
  /** The phone's Filter, opened from the head's ⋯ (ProjectHead `onfilter`). */
  let filterOpen = $state(false);
  let filterAnchor = $state<HTMLElement | null>(null);

  /** The picked tasks the view shows: a bulk change acts on what you see. */
  const picked = $derived(shownTasks.filter((task) => isPicked(task.id)));
  /** A card's or a row's tick; held still while a bulk change runs. */
  function pick(id: string, on: boolean, range?: string[]) {
    if (!board.bulkRun) {
      pickTask(id, on, range);
    }
  }
  const dropTo = $derived(
    stageList.find((stage) => stage.kind === "dropped")?.name ?? null
  );
  const pickedIds = () => picked.map((task) => task.id);
  const bulkMove = (stage: string) => board.bulkMove(pickedIds(), stage);
  const bulkDrop = (reason: string) => {
    if (dropTo) {
      board.bulkDrop(pickedIds(), dropTo, reason);
    }
  };
  const bulkLabel = (label: string) => board.bulkLabel(pickedIds(), label);
  const bulkArchive = () => board.bulkArchive(pickedIds());

  // Another project, or another view: the picks go (a card picked on the
  // board is not a row picked in the table); the filter is the next
  // project's own, from its URL.
  let pickedFor = "";
  $effect(() => {
    const at = `${projectId}:${current}`;
    if (pickedFor && pickedFor !== at && !board.bulkRun) {
      untrack(() => board.endBulk());
    }
    pickedFor = at;
  });
  let filterFor = "";
  $effect(() => {
    const id = projectId;
    if (filterFor && filterFor !== id) {
      untrack(() => {
        filter = filterOf(here.searchParams);
        find.reset(wordless(here));
        askedWords = wordsOf(filter.q);
      });
    }
    filterFor = id;
  });

  /**
   * The filter's words go to the hub once typing rests, each change of them
   * once: the field writes them at every key, and a read per key would only
   * be dropped for the next. Taken out, they unnarrow at once.
   */
  const FIND_REST_MS = 250;
  let askedWords = wordsOf(untrack(() => filter.q));
  $effect(() => {
    const words = wordsOf(filter.q);
    if (words === askedWords) {
      return;
    }
    if (!words) {
      askedWords = words;
      untrack(() => find.find(words));
      return;
    }
    const resting = setTimeout(() => {
      askedWords = words;
      find.find(words);
    }, FIND_REST_MS);
    return () => clearTimeout(resting);
  });

  // --- drafts --------------------------------------------------------------------

  let keeping = $state<string | null>(null);
  let discarding = $state<string | null>(null);
  /**
   * What the hub refused of a view (Keep, Discard, Place on a page), said
   * under the view's own bar or head, in words, with Try again, until a try
   * goes or another view's act replaces it; never a toast (DESIGN.md, The
   * Work Outlives Its Surface Rule).
   */
  /** A refusal's closing stop, dropped so it sits inside the sentence. */
  const REASON_STOP = /\.$/u;
  type ViewAct =
    { act: "keep" | "discard" } | { act: "place"; on: BlockPageId };
  /** Where a view's refused act is said: kept through a reload (refusals.svelte.ts). */
  const viewKey = (name: string) => `view:${projectId}:${name}`;
  /** The refused act's words and its Try again, for the view `name`. */
  function viewFaultOf(
    name: string
  ): { reason: string; again: () => Promise<void> } | null {
    const said = refusals.get(viewKey(name));
    if (!said) {
      return null;
    }
    const asked = said.asked as ViewAct;
    const again = (): Promise<void> => {
      if (asked.act === "place") {
        return placeView(name, asked.on);
      }
      return asked.act === "keep" ? keep(name) : discard(name);
    };
    return { reason: said.reason, again };
  }

  /** Keep: the draft becomes a kept view where its tab stands. */
  async function keep(name: string) {
    keeping = name;
    refusals.delete(viewKey(name));
    try {
      await board.keepView(name);
    } catch (error) {
      refusals.set(viewKey(name), {
        reason: `The ${viewLabel(name)} view was not kept: ${failureClause(error)}. It stays a draft.`,
        asked: { act: "keep" } satisfies ViewAct,
      });
    } finally {
      keeping = null;
    }
  }

  /** Discard: the draft goes, and the board comes back. */
  async function discard(name: string) {
    discarding = name;
    refusals.delete(viewKey(name));
    try {
      await board.discardView(name, () => choose("board"));
    } catch (error) {
      refusals.set(viewKey(name), {
        reason: `The ${viewLabel(name)} view was not discarded: ${failureClause(error)}. It stays a draft.`,
        asked: { act: "discard" } satisfies ViewAct,
      });
    } finally {
      discarding = null;
    }
  }

  // --- the pages' blocks ----------------------------------------------------------

  const TASK_GLYPHS = {
    board: IconColumns,
    table: IconFileTable,
  } as const;

  /** The kept views placed on `on`, each a block there. */
  function viewItemsOf(on: BlockPageId): Record<string, BlockItem> {
    return Object.fromEntries(
      blocks.placesOf(on).flatMap((place): [string, BlockItem][] => {
        const name = viewOfBlock(place.block);
        const view = name
          ? board.views.find((each) => each.name === name && !each.draft)
          : undefined;
        return view
          ? [
              [
                place.block,
                {
                  title: viewLabel(view.name),
                  glyph: IconArtifactSheet,
                  content: viewBody,
                  measure: "--c-block-view",
                  hideable: true,
                  body: "natural",
                  card: false,
                  view: view.name,
                },
              ],
            ]
          : [];
      })
    );
  }

  /**
   * A task view's page: the view itself, drawn alone as it always was until
   * a view is placed beside it; then the view's block spans the row, and
   * the board fills the page's height.
   */
  function taskPageItems(
    view: "board" | "table",
    content: Snippet<[string]>
  ): Record<string, BlockItem> {
    return {
      [view]: {
        title: BLOCK_PAGE_TITLES[view],
        glyph: TASK_GLYPHS[view],
        meta: taskCount,
        content,
        alone: true,
        wideOnly: true,
        hideable: false,
        body: view === "board" ? "fill" : "natural",
        card: false,
        measure: "--c-block-view",
      },
      ...viewItemsOf(view),
    };
  }

  /** A task view's page with blocks beside its view: the pane scrolls them. */
  const framed = $derived(
    isBlockPage(current) &&
      current !== "routines" &&
      blocks.placesOf(current).length > 1
  );

  /** A kept view placed on a page: it leaves the strip, and the page shows it. */
  async function placeView(name: string, on: BlockPageId) {
    refusals.delete(viewKey(name));
    if (await blocks.place(name, on)) {
      if (current !== on) {
        choose(on);
      }
      tab = on;
      remember();
    } else {
      // Refused, the view stays where it is: under its head, which says why.
      const why = (blocks.refused[on] ?? blocksWords.notPlaced).replace(
        REASON_STOP,
        ""
      );
      refusals.set(viewKey(name), {
        reason: `The ${viewLabel(name)} view was not placed on ${BLOCK_PAGE_TITLES[on]}: ${why}. It stays a tab of its own.`,
        asked: { act: "place", on } satisfies ViewAct,
      });
    }
  }

  // --- Ask Caw for a view -------------------------------------------------------

  let askOpen = $state(false);
  let askAnchor = $state<HTMLElement | null>(null);
  /** The ask's words, in the session Composer the popover holds. */
  const viewDraft = new ComposerDraft();
  let viewSending = $state(false);
  let viewRefused = $state("");
  /** The ask never reached the hub: its line offers Send again. */
  let viewAgain = $state(false);
  /** What the Composer stands over its foot: the popover holds that much room. */
  let viewFoot = $state(0);
  function ask(anchor: HTMLElement) {
    askAnchor = anchor;
    askOpen = true;
    viewDraft.focusWanted = true;
  }
  /**
   * The view is asked of the project's conversation (client `requestView`):
   * a refusal puts the words back in the composer with the reason over them.
   */
  async function askView(text: string) {
    viewSending = true;
    viewRefused = "";
    viewAgain = false;
    try {
      await requestView(projectId, text);
      askOpen = false;
    } catch (error) {
      viewDraft.restore(text);
      viewAgain = unreachable(error);
      viewRefused = message(error);
    } finally {
      viewSending = false;
    }
  }

  // --- what keeps the page live -------------------------------------------------

  // On arrival and on every reconnect: Caw, the views and their data, and the
  // tasks the hub may have moved while the socket was down.
  let readFor = "";
  $effect(() => {
    const live = connectionStore.status === "connected";
    const id = projectId;
    if (!(live && id)) {
      readFor = "";
      return;
    }
    if (readFor === id) {
      return;
    }
    readFor = id;
    untrack(() => {
      lead.read();
      board.readViews();
      blocks.read();
      board.readDated();
      board.readArchived();
      decisions.read();
      if (board.list) {
        board.refresh();
      }
    });
  });

  // His start carries on after a project is made (his view's `starting`): each
  // change of the project's row while it does (the hub's `projects.changed`
  // as it ends, a refusal with it) reads his view again, for whether he is
  // still starting and why he could not.
  $effect(() => {
    const row = project;
    untrack(() => {
      if (row && lead.view?.starting) {
        lead.read();
      }
    });
  });

  // Another hand flipped the project's events (another dashboard, the app):
  // the project row the hub's `projects.changed` brings says where they
  // stand, which every switch reads; the view is read again for what only it
  // carries (what the conversation started that still runs).
  let cawSeen: boolean | undefined;
  $effect(() => {
    const on = project?.eventsOn;
    if (cawSeen !== undefined && on !== undefined && on !== cawSeen) {
      untrack(() => {
        if (!lead.moving) {
          lead.read();
        }
      });
    }
    cawSeen = on;
  });

  // Another hand changed the tasks (Caw filed one, an attempt moved one): the
  // hub says so, and the list is read again.
  let changesSeen = -1;
  $effect(() => {
    const changes = tickersStore.tasksChangedOf(projectId);
    if (changesSeen !== -1 && changes !== changesSeen && board.list) {
      untrack(() => board.refresh());
    }
    changesSeen = changes;
  });

  // A decision page was built, picked on or sent, or tasks it made moved:
  // its tiles and the tab's count are read again.
  let decisionsSeen = -1;
  $effect(() => {
    const changes =
      tickersStore.decisionsChangedOf(projectId) +
      tickersStore.tasksChangedOf(projectId);
    if (decisionsSeen !== -1 && changes !== decisionsSeen) {
      untrack(() => decisions.read());
    }
    decisionsSeen = changes;
  });

  // The arrangement changed (here, or on another screen): it is read again,
  // and the views with it, since a view placed or made a tab moves the strip.
  let blocksSeen = -1;
  $effect(() => {
    const changes = tickersStore.blocksChangedOf(projectId);
    if (blocksSeen !== -1 && changes !== blocksSeen) {
      untrack(() => {
        blocks.read();
        board.readViews();
      });
    }
    blocksSeen = changes;
  });

  // Another hand may have changed the tasks while the tab was away.
  $effect(() => {
    const back = () => {
      if (document.visibilityState === "visible") {
        detach(board.refresh(), "refresh");
        detach(decisions.read(), "read");
        detach(blocks.read(), "read");
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  });

  // Caw drafts a view in a turn of the project's conversation; when that
  // turn ends, the views are read again, so a new draft arrives as a tab.
  let turnWas = false;
  $effect(() => {
    const working = lead.status === "working";
    if (turnWas && !working) {
      untrack(() => board.readViews());
    }
    turnWas = working;
  });

  // A task that lands in a done stage: Caw says so for two breaths.
  let kindsSeen: Map<string, StageKind | null> | null = null;
  $effect(() => {
    const now = new Map(
      (board.list?.tasks ?? []).map((task) => [task.id, task.kind])
    );
    if (kindsSeen) {
      for (const [id, kind] of now) {
        const was = kindsSeen.get(id);
        if (kind === "done" && was !== undefined && was !== "done") {
          untrack(() => lead.land(id));
        }
      }
    }
    kindsSeen = now;
  });

  // --- what the page says --------------------------------------------------------

  /**
   * What of the project the hub didn't give, and why, as one sentence: a
   * read that fails fails for the tasks, the stages and the views at once
   * (a tunnel's 502), so it is said once, where the board would be, with
   * one Retry that reads all of them again (owner: "why does the error show
   * up in two places on the screen?").
   */
  const unread = $derived.by((): string | null => {
    const parts = [
      board.listProblem === null ? null : "tasks",
      board.stagesProblem === null ? null : "stages",
      board.viewsProblem === null ? null : "views",
    ].filter((part) => part !== null);
    const reason = (
      board.listProblem ??
      board.stagesProblem ??
      board.viewsProblem ??
      ""
    ).trim();
    if (parts.length === 0 || reason === "") {
      return null;
    }
    const named =
      parts.length > 1
        ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
        : parts[0];
    const why = `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
    return `The ${named} for ${project?.name ?? "this project"} couldn't be read. ${
      SENTENCE_END.test(why) ? why : `${why}.`
    } Nothing was changed.`;
  });
  /** Retry: the tasks, the stages, the views and Caw read again, together. */
  let rereading = $state(false);
  async function readAgain() {
    rereading = true;
    try {
      await Promise.all([board.refresh(), board.readViews(), lead.read()]);
    } finally {
      rereading = false;
    }
  }
  /** The pane says it in the board's place: its tasks are what's missing. */
  const paneSaysUnread = $derived(
    board.list === null &&
      !shown.startsWith("view:") &&
      shown !== "routines" &&
      shown !== "decisions"
  );
  const unreadStages = $derived(
    `stages.md in the project folder does not read: ${(board.stages?.problems ?? []).join(" ")} Tasks keep their stages meanwhile; fix the file and the board takes its columns from it.`
  );
  /** The empty board with Caw: what Caw does, in this project's own stages, named as the board names them. */
  const cawLine = $derived.by(() => {
    const named = stageList
      .filter((stage) => stage.kind !== "dropped")
      .map((stage) => stageLabel(stage.name));
    const you = stageList.find((stage) => stage.kind === "you");
    const flow =
      named.length > 1
        ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
        : (named[0] ?? "");
    return `Tell Caw what to do: the tasks Caw files move through ${flow}.${
      you ? ` One waiting on you shows in ${stageLabel(you.name)}.` : ""
    }`;
  });
  /**
   * New task stands in the strip whenever there is no form for it on the
   * board: a board with tasks, and an empty one Caw's field stands over
   * (an empty board while Caw can't start holds the form itself).
   */
  const strippedNewTask = $derived(board.list !== null && (!empty || canTalk));
  /** The view on screen is one of the tasks, which the filter narrows. */
  const filterHere = $derived(
    board.list !== null &&
      !empty &&
      ["board", "table", "canvas", "calendar"].includes(current)
  );
  /** Something stands after the tabs: the hairline marks where it starts. */
  const trailing = $derived(
    needsYou.length > 0 ||
      strippedNewTask ||
      canTalk ||
      (filterHere && (wide || narrowed > 0))
  );
  // --- before setup -------------------------------------------------------------

  /** The setup page, once Caw has opened it (the project-setup skill's `decisions/setup/`). */
  const setupPage = $derived(
    decisions.list?.pages.find((one) => one.name === SETUP_PAGE) ?? null
  );
  /** A parked ask that is a question of his (his `ask` call), not a permission. */
  const isQuestion = (request: PendingPermission): boolean =>
    request.toolName === ASK_USER_QUESTION;
  /** His questions on the setup, oldest first, while the project is not set up. */
  const setupAsks = $derived<BlockedRequest[]>(
    notSetUp ? lead.asks.filter((one) => isQuestion(one.request)) : []
  );
  /**
   * The board draws his questions (a desk's scene; on a phone his sheet
   * stands over the board, and his composer has them, one at a time).
   */
  const asksOnBoard = $derived(notSetUp && !phone);
  const asksElsewhere = (request: PendingPermission): boolean =>
    asksOnBoard && isQuestion(request);
  /**
   * The setup page Caw has stood at rest over, by its artifact: the draft
   * he handed over (the project-setup skill hands it over by ending the
   * turn that wrote it). Stages come only from that turn; a turn of his
   * after it (a word with the person, a revision in place) adds no stage
   * still to come, so the draft stays whole and Set up stays in reach.
   * Kept for the tab, so a reload or a way back to this page after the
   * hand-over finds the draft whole; a page read mid-draft, never rested
   * over, still shows the stages coming.
   */
  const restedKey = $derived(`cawco-setup-rested-${projectId}`);
  let restedOver = $state<string | null>(null);
  $effect(() => {
    restedOver = stored("session", restedKey);
  });
  /** He is at rest: his turn over, no question of his open, the board read (a wait or a load says nothing of his turn). */
  const atRest = $derived(
    setupAsks.length === 0 &&
      lead.status !== "working" &&
      lead.status !== "needs-you" &&
      lead.status !== "loading" &&
      lead.status !== "reconnecting"
  );
  $effect(() => {
    const artifactId = setupPage?.artifactId;
    if (artifactId && atRest && artifactId !== untrack(() => restedOver)) {
      restedOver = artifactId;
      store("session", restedKey, artifactId);
    }
  });
  /** He is writing the draft: at work on a page he has not yet handed over (a page read mid-draft included). */
  const writingPage = $derived(
    lead.status === "working" &&
      (setupPage === null || setupPage.artifactId !== restedOver)
  );
  /**
   * How far he has got, while he drafts the setup in his conversation: his
   * setup element in his panel (SetupWell) reads it; none once the page is
   * open, or while nothing of his runs on it. A project just made stands
   * here from his start (CawLead `startingId`): its first step, before his
   * session has said anything.
   */
  const setupProgress = $derived.by(() => {
    const id = lead.startingId ?? lead.conversationId;
    if (!(notSetUp && project && id)) {
      return null;
    }
    const progress = setupProgressOf({
      messages: id ? (cawco.session(id)?.messages ?? []) : [],
      name: project.name,
      named: project.name !== projectWords.placeholderName,
      open: setupAsks.map((one) => ({
        blocks: (one.request.input as { blocks?: unknown }).blocks === true,
      })),
      // Handed over once the page holds his draft and he is not writing
      // it: he writes it early and adds to it as he drafts (project-setup
      // skill), and ends his turn to hand it over.
      page: setupPage !== null && !writingPage,
    });
    const going =
      lead.startingId !== null ||
      lead.status === "working" ||
      lead.status === "needs-you" ||
      setupAsks.length > 0;
    return handedOver(progress) || going ? progress : null;
  });
  /** His draft, read from the setup page he writes, kept and sent from the board. */
  const draft = new SetupDraftSource();
  $effect(() => {
    const id = projectId;
    const row = notSetUp ? setupPage : null;
    untrack(() => detach(draft.follow(id, row), "read the setup draft"));
  });
  $effect(() => () => draft.leave());
  /** The draft stands on the board: the page holds it, or he is drafting it. */
  const drafting = $derived(
    notSetUp && (Boolean(setupPage?.artifactId) || setupProgress !== null)
  );
  /** Stages still to come while he writes: skeletons at a stage's size. */
  const draftComing = $derived.by(() => {
    if (!setupProgress || handedOver(setupProgress)) {
      return 0;
    }
    return draft.stages.length === 0 ? 4 : 1;
  });
  /** Set up: the page sent; the hub applies it and he writes the stages. */
  async function setUp() {
    const artifactId = setupPage?.artifactId;
    if (artifactId) {
      await draft.send(projectId, artifactId);
    }
  }
  /**
   * Just set up through his page, before its first task: the board draws
   * the columns his draft became (each landing from its draft column) with
   * the set-up bar over them naming the next step (SetUpBar), not the
   * empty board's scene (decision page `onboarding-first-minutes`, card
   * `draft-where`: "the stages travelling into the board's columns").
   */
  const setUpFresh = $derived(
    !notSetUp && empty && setupPage !== null && newIn !== undefined
  );
  /** The scene's one action with no setup under way. */
  const setupAction = $derived(
    canTalk
      ? {
          kind: "ask" as const,
          ask: () => lead.ask(setupWords.askSetupWords, "board"),
        }
      : { kind: "none" as const }
  );
  /** The head's ⋯: finish the setup, or change how a set-up project runs, through the same page. */
  const setupAct = $derived.by(() => {
    if (!(canTalk && board.stages)) {
      return null;
    }
    if (notSetUp) {
      return {
        label: setupWords.finishSetup,
        run: () =>
          setupPage?.artifactId
            ? document
                .querySelector<HTMLElement>(
                  `[data-slot="draft-bar"] button, [data-slot="setup-asks"] :is(${QUESTION_KEYS})`
                )
                ?.focus({ focusVisible: true } as FocusOptions)
            : lead.ask(setupWords.askSetupWords, "board"),
      };
    }
    return {
      label: setupWords.changeSetup,
      run: () => lead.ask(setupWords.changeSetupWords, "board"),
    };
  });

  /**
   * Caw stands over the empty board while he can start (the empty board's
   * seat, the setup scene's); elsewhere he sits in the head, and the board
   * is drawn — its columns and the new task's form — once a task is being
   * added by hand. His draft in the board's place draws no seat of its
   * own, so he sits in the head over it: the page always shows the one
   * seat that opens his panel.
   */
  const standing = $derived(
    current === "decisions"
      ? canTalk && !decisionPage && decisions.list?.pages.length === 0
      : empty &&
          canTalk &&
          !adding &&
          !(notSetUp && drafting) &&
          !(setUpFresh && current === "board") &&
          !current.startsWith("view:") &&
          current !== "routines"
  );
  /** What the pane holds, as its layout reads it: a decision page fills it. */
  const paneView = $derived.by(() => {
    if (current !== "decisions") {
      // A task view with views placed beside it is a page of blocks.
      return framed ? "blocks" : current;
    }
    return decisionPage ? "decisions-page" : "decisions";
  });
  /** A view that fills its pane stands on the pane's foot at its own padding. */
  const PANE_FOOT: Record<string, string> = {
    board: "pb-0",
    canvas: "pb-space-5",
    "decisions-page": "pb-0",
  };
  /**
   * The pane's foot: its view's own padding, and on a phone while Caw's
   * sheet stands (CawFloat, a bottom sheet that holds nothing) the sheet's
   * height of room, so any part of the view (a form's buttons, a block's
   * head) scrolls clear of it, whatever the view. One class per state:
   * the phone's comes after the view's in Tailwind's order at equal weight,
   * where `view-board:pb-0` (0,2,0) outweighed
   * `max-phone:in-data-caw-open:…` (0,1,0) and the sheet covered the foot.
   * A view that fills its pane on a phone stands at `--pane-min`, a
   * border-box height the sheet's room counts toward, so that room is added
   * to it: without it the room alone met the minimum and a decision page's
   * frame stood 0px tall.
   */
  const paneFoot = $derived([
    PANE_FOOT[reading.current ? "board" : paneView] ?? "pb-space-6",
    docked && "max-phone:pb-c-sheet-max-h",
  ]);
  /**
   * Which box wears the house edge fade: the one that scrolls the view. On a
   * phone that is the page (the board's columns included, which stand at
   * their height in it); elsewhere the pane, where the board scrolls its
   * columns sideways under its own. None while a view fills its pane (the
   * canvas, a decision page) or the next project is read.
   */
  const fadeOn = $derived.by((): "page" | "pane" | null => {
    if (
      reading.current ||
      current === "canvas" ||
      paneView === "decisions-page"
    ) {
      return null;
    }
    if (pageScrollsQuery.current) {
      return "page";
    }
    // The board alone scrolls its columns sideways; a board page with
    // blocks beside it scrolls in the pane.
    return paneView === "board" ? null : "pane";
  });

  /**
   * When he sits down (the first task landed, or the view moved off the
   * board), the Caw standing over the board departs as he goes, and the
   * head's seat lands him (CawSeat): one Caw, 80 into 48. His outro is the
   * one moment he is known to be leaving while still drawn, so it is where
   * he departs; it takes no time of its own.
   */
  function sitDown(node: HTMLElement): TransitionConfig {
    depart(node);
    return { duration: 0 };
  }
</script>

<!-- The view strip: the views, then what acts on them, the page's own row
     under its head (the top bar holds the workspace's tabs). `roomy`: a wide
     screen, where the filter stands whole. -->
{#snippet strip(roomy: boolean)}
  <div
    data-slot="strip"
    class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
  >
    <ViewTabs
      {current}
      hrefOf={(view) => hrefOf(null, view)}
      onchoose={choose}
      views={barViews}
    />
    {#if trailing}
      <!-- Under 640px New task and Ask Caw are in the head's ⋯: the rule
           stands only while Needs you follows it there. -->
      <span
        data-wide={needsYou.length === 0 || undefined}
        aria-hidden="true"
        class={[
          "h-c-btn-h-sm w-px flex-none bg-border-hairline",
          needsYou.length === 0 && "max-phone:hidden",
        ]}
      ></span>
    {/if}
    <!-- The strip is a toolbar: its actions are bare symbols, each named in
         its tooltip and for a screen reader, a count where one says
         something (DESIGN.md, Title bars follow Liquid Glass: "Its items are
         bare symbols … each named for the screen reader and in its
         tooltip"), so the views keep the room. -->
    <div data-form="compact" class="flex flex-none items-center gap-space-2">
      <!-- Filter, on the views of the tasks: whole in the bar; on a phone,
           where the row has no room for it, its glyph and count stand while
           a filter does, and the head's ⋯ opens it. -->
      {#if filterHere && (roomy || narrowed > 0)}
        <TaskFilterPopover
          compact={!roomy}
          {filter}
          {find}
          onchange={setFilter}
          tasks={[...board.tasks, ...board.archived]}
        />
      {/if}
      {#if needsYou.length > 0}
        <NeedsYouChip
          count={needsYou.length}
          on={filtering}
          ontoggle={() => {
            needsOnly = !filtering;
          }}
        />
      {/if}
      {#if strippedNewTask}
        <Button
          aria-label="New task"
          data-wide
          layout="wide"
          press="pressable"
          onclick={() => {
            if (current !== "table") {
              choose("board");
            }
            adding = true;
          }}
          size="sm"
          title="New task"
          variant="ghost"
        >
          <IconPlus />
          <span class="in-form-compact:hidden">New task</span>
        </Button>
      {/if}
      {#if canTalk}
        <Button
          aria-label={viewsWords.ask}
          data-wide
          layout="wide"
          press="pressable"
          onclick={(event) => ask(event.currentTarget as HTMLElement)}
          size="sm"
          title={viewsWords.ask}
          variant="ghost"
        >
          <IconSparkles />
          <span class="in-form-compact:hidden">{viewsWords.ask}</span>
        </Button>
      {/if}
    </div>
  </div>
{/snippet}

<!-- What acts on the picked tasks, the board's cards or the table's rows. -->
{#snippet bulkBar()}
  {#if picked.length > 0 || board.bulkRun}
    <BulkBar
      {allowedFrom}
      {dropTo}
      labels={[...new Set(board.tasks.flatMap((task) => task.labels))].sort()}
      onarchive={bulkArchive}
      onclear={() => board.endBulk()}
      ondrop={bulkDrop}
      onlabel={bulkLabel}
      onmove={bulkMove}
      onretry={() => board.bulkAgain?.()}
      {picked}
      run={board.bulkRun}
      stages={stageList}
    />
  {/if}
{/snippet}

<!-- The task views, each its page's own block (blocks/BlockPage). -->
{#snippet boardBody(_block: string)}
  <TaskBoard
    {allowedFrom}
    archived={applyFilter(board.archived, filter, find.ids)}
    {dateOf}
    hrefOf={(id) => hrefOf(id)}
    moving={(id) => id in board.moving}
    {newIn}
    oncreate={(title, stage) => board.create(title, stage)}
    onmove={(id, stage, source) => board.drop(id, stage, source)}
    onopen={openOne}
    onpick={pick}
    picked={isPicked}
    refused={(id) => board.refusedMove(id)}
    stages={shownStages}
    tasks={shownTasks}
    bind:adding
  />
{/snippet}
{#snippet tableBody(_block: string)}
  <div class="flex flex-col gap-space-3">
    {#if adding}
      <div
        class="max-w-c-new-task-w rounded-lg bg-surface-raised p-space-3 shadow-tile"
      >
        <NewTaskForm
          oncreate={(title, stage) => board.create(title, stage)}
          stage={newIn ?? ""}
          stages={stageList}
          bind:open={adding}
        />
      </div>
    {/if}
    <TaskTable
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      onpick={pick}
      onpickall={(ids, on) => {
        if (!board.bulkRun) {
          pickAll(ids, on);
        }
      }}
      picked={isPicked}
      stages={stageList}
      tasks={shownTasks}
    />
  </div>
{/snippet}
<!-- A task view's block counts the tasks it shows. -->
{#snippet taskCount()}
  <span data-slot="num" class="type-meta num text-ink-subtle"
    >{shownTasks.length}</span
  >
{/snippet}
<!-- A kept view placed on a page, drawn as its tab draws it. -->
{#snippet viewBody(block: string)}
  {@const view = board.views.find((each) => `view:${each.name}` === block)}
  {#if view}
    <ViewOpenUi
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      {projectId}
      {view}
    />
  {/if}
{/snippet}

{#snippet pane(value: string)}
  {#if value.startsWith("view:")}
    {@const view = board.views.find((each) => `view:${each.name}` === value)}
    {#if view}
      <div class="flex flex-col gap-space-3" in:reveal>
        {#if view.draft}
          <!-- The tab already says `draft`; the bar says what it is and
               offers the two answers, kept together on one row. -->
          <div
            class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 rounded-lg bg-surface-band px-space-3 py-space-2 inset-ring inset-ring-border-hairline"
            out:crossOut
          >
            <span
              class="type-label min-w-0 shrink grow basis-c-draft-line text-ink-strong"
              >{viewsWords.drafted(viewLabel(view.name))}</span
            >
            <div class="flex flex-none gap-space-2">
              <Button
                label={viewsWords.keep}
                onclick={() => keep(view.name)}
                pending={keeping === view.name}
                pendingLabel={viewsWords.keeping}
                size="sm"
                variant="outline"
              />
              <Button
                label={viewsWords.discard}
                onclick={() => discard(view.name)}
                pending={discarding === view.name}
                pendingLabel={viewsWords.discarding}
                size="sm"
                variant="ghost"
              />
            </div>
          </div>
          {@const fault = viewFaultOf(view.name)}
          <!-- In the bar's own inset, under its words. -->
          <RowFault
            again={fault?.again}
            data-view-refusal={view.name}
            end="var(--space-3)"
            indent="var(--space-3)"
            reason={fault?.reason}
          />
        {:else}
          <!-- A kept view's head: its ⋯ places it on a page, as a block. -->
          <div
            data-slot="view-head"
            class="mark-line flex min-h-c-btn-h-sm items-center gap-space-2 px-space-1"
          >
            <span
              aria-hidden="true"
              class="grid flex-none place-items-center text-ink-muted"
              data-box><IconArtifactSheet class="size-icon-md" /></span
            >
            <h2
              class="type-label m-0 min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
            >
              {viewLabel(view.name)}
            </h2>
            <span data-box>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  aria-label={commonWords.moreFor(viewLabel(view.name))}
                  class="touch-hit"
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconMore />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-auto">
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>
                      <IconLayers />
                      <span>{blocksWords.placeOnPage}</span>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent class="w-auto" min="compact">
                      {#each SHOWN_BLOCK_PAGES as target (target)}
                        <DropdownMenu.Item
                          onSelect={() => placeView(view.name, target)}
                          >{BLOCK_PAGE_TITLES[target]}</DropdownMenu.Item
                        >
                      {/each}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </span>
          </div>
          {@const fault = viewFaultOf(view.name)}
          <!-- In the head's own inset, under its name. -->
          <RowFault
            again={fault?.again}
            data-view-refusal={view.name}
            end="var(--space-1)"
            indent="var(--space-1)"
            reason={fault?.reason}
          />
        {/if}
        <ViewOpenUi
          hrefOf={(id) => hrefOf(id)}
          onopen={openOne}
          {projectId}
          {view}
        />
      </div>
    {:else}
      <div out:revealOut>
        <Skeleton class="w-full" height="board" radius="card" />
      </div>
    {/if}
  {:else if value === "routines" && project}
    <!-- The routines, the strip's fourth tab: a page of blocks. -->
    <ViewRoutines
      {blocks}
      {canTalk}
      cawProblem={lead.problem}
      onform={() => {
        // A phone's Caw is a sheet over the page's foot: the routine form
        // the reader opened stands clear of it, his seat brings him back.
        if (pageScrollsQuery.current) {
          lead.open = false;
        }
      }}
      project={{ id: project.id, name: project.name }}
      starters={routineStarters}
      viewItems={viewItemsOf("routines")}
    />
  {:else if value === "decisions"}
    <DecisionsView
      {canTalk}
      card={decisionCard}
      {decisions}
      go={decisionsGo}
      hrefOf={(to) => hrefOf(null, "decisions", to)}
      {lead}
      now={decisionsNow}
      onopentask={openOne}
      page={decisionPage}
      {projectId}
      projectName={project?.name ?? ""}
      {sitDown}
      starters={decisionStarters}
      taskHref={(id) => hrefOf(id)}
      {taskOf}
    />
  {:else if leavingFor}
    <!-- The tab's first read, inside its grace: it shows nothing of its
         own, never the refusal it has not had (a quick read drew "Tasks are
         not available" for a beat on every open from the rail). -->
  {:else if !board.list}
    <div class="max-w-c-measure">
      <EmptyState
        icon={IconToolTodo}
        line={unread ??
          `The tasks for ${project?.name ?? "this project"} couldn't be read. Nothing was changed.`}
        title="Tasks are not available"
      >
        {#snippet action()}
          <Button
            label="Retry"
            onclick={readAgain}
            pending={rereading}
            pendingLabel="Retrying…"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if notSetUp && !adding && drafting}
    <SetupBoard
      aim={draft.aim}
      asks={setupAsks}
      cards={draft.cards}
      coming={draftComing}
      delegates={draft.delegates}
      name={project?.name ?? ""}
      onaim={(next) => draft.keep("aim", next)}
      onanswercaw={() => detach(lead.answerAsks(), "answer Caw")}
      onBoard={asksOnBoard}
      pageHref={draft.cards[0] ? setupPageAt(projectId, draft.cards[0]) : null}
      onsetup={() => detach(setUp(), "set the project up")}
      onstages={(next) => draft.keep("stages", next)}
      onaskagain={canTalk
        ? () => lead.ask(setupWords.askSetupWords, "board")
        : undefined}
      problem={draft.problem}
      sending={draft.sending}
      stale={draft.stale}
      stages={draft.stages}
    />
  {:else if notSetUp && !adding}
    <SetupScene act={setupAction} seat={canTalk ? setupSeat : undefined} />
  {:else if setUpFresh && value === "board" && newIn}
    <div class="flex min-h-0 w-full flex-auto flex-col gap-space-4">
      <SetUpBar
        first={newIn}
        name={project?.name ?? ""}
        onask={() => lead.talk()}
      />
      <div class="min-h-0 flex-auto">{@render boardBody("board")}</div>
    </div>
  {:else if empty && !adding}
    {#if !lead.project}
      <div class="w-full" out:revealOut>
        <Skeleton
          class="mx-auto w-full"
          height="chart"
          radius="card"
          width="chart-cap"
        />
      </div>
    {:else if canTalk}
      <!-- The project's starters are the empty board's one action (DESIGN.md,
           The Empty Starts Work Rule): while his panel is open they are in
           it (CawFloat); put away, they stand here and open it with their
           words. -->
      <div
        data-slot="caw-empty"
        class="mx-auto w-full max-w-c-starters-w"
        in:reveal
      >
        <EmptyState
          actionWidth="fill"
          axis
          line={cawLine}
          title="Nothing on the board yet"
        >
          {#snippet mark()}
            <!-- He stands here instead of sitting in the head, and is the
                 same seat at 80: a press opens his panel beside the page
                 (CawFloat). His switch is under the head's ⋯, empty board
                 or not. -->
            <div
              data-slot="caw-80"
              class="mb-space-3 grid justify-items-center"
              data-share="caw:{projectId}"
              out:sitDown|global
            >
              <CawSeat
                {lead}
                {projectId}
                projectName={project?.name ?? ""}
                size={80}
              />
            </div>
          {/snippet}
          {#snippet action()}
            <!-- A starter opens his panel with its words in his composer. -->
            {#if starters.length > 0 && !lead.open}
              <StarterCards
                onpick={(text) => lead.ask(text, "board")}
                {starters}
              />
            {/if}
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <div class="max-w-c-measure" in:reveal>
        <EmptyState
          icon={IconToolTodo}
          line="Add a task by hand while Caw can’t start."
          title="Nothing on the board yet"
        >
          {#snippet action()}
            <div class="flex flex-wrap items-start gap-space-2">
              <NewTaskForm
                oncreate={(title, stage) => board.create(title, stage)}
                primary
                stage={newIn ?? ""}
                stages={stageList}
                bind:open={adding}
              />
            </div>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  {:else if value === "board"}
    <BlockPage
      {blocks}
      items={taskPageItems("board", boardBody)}
      page="board"
    />
  {:else if value === "table"}
    <BlockPage
      {blocks}
      items={taskPageItems("table", tableBody)}
      page="table"
    />
  {:else if value === "canvas"}
    <ViewCanvas
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      tasks={shownTasks}
    />
  {:else if value === "calendar" && dateField && board.dated}
    <!-- What the skeleton below stood for until its dates were read. -->
    <div in:reveal>
      <ViewCalendar field={dateField} onopen={openOne} tasks={board.dated} />
    </div>
  {:else if value === "made"}
    <ViewMade
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      open={openTask}
      {projectId}
      tasks={shownTasks}
    />
  {:else}
    <div out:revealOut>
      <Skeleton class="w-full" height="board" radius="card" />
    </div>
  {/if}
{/snippet}

{#if !project}
  <div class="flex flex-1 items-center justify-center p-space-7">
    <p class="text-body text-ink-muted">
      No such project. It may have been removed; pick another from the rail.
    </p>
  </div>
{:else}
  <ProjectDock {docked} preview={lead.tab === "preview"}>
    {#snippet page()}
      {#if phone && openFile}
        <!-- A phone: the folder's file is its own page, with Back to the view. -->
        <div
          data-slot="project-page"
          class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:@container-size max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--safe-bottom)"
        >
          {#key openFile}
            <FolderFile
              onclose={closeFile}
              page={{ backTo: project.name }}
              path={openFile}
              {projectId}
            />
          {/key}
        </div>
      {:else if phone && openTask && board.stages}
        <!-- A phone: the task is its own page, with Back to the view. -->
        <div
          data-slot="project-page"
          class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:@container-size max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--safe-bottom)"
        >
          <TaskPane
            {allowedFrom}
            onchanged={(task) => board.changed(task)}
            onclose={closeTask}
            onmove={(id, stage) => board.move(id, stage)}
            onopen={openOne}
            page={{ backTo: project.name }}
            {pageOf}
            {projectId}
            stages={board.stages}
            taskId={openTask}
            tasks={board.tasks}
          />
        </div>
      {:else}
        <!-- The frame the phone's views bar docks in, over the page's foot. -->
        <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <!-- A phone: the page is the one scroller, so iOS never chains two. The
           foot's edge fade ends at the bar's top edge, a step of air under
           the reach. What it reveals (a scrollIntoView here, or one in a
           decision page's frame, which carries up into it) lands in the part
           nothing stands over: above the bar, or above Caw's sheet while it
           stands (--reveal-foot, its scroll padding), and never inside the
           foot's fade: at least the run the fade covers there
           (edge-fade.css `--fade-foot`, --bar-fade-inset + its length;
           0px while the page wears no fade). -->
          <div
            data-slot="project-page"
            class={[
              "flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:@container-size max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--bar-reach) max-phone:scroll-pb-(--reveal-foot) max-phone:fade-inset-end-(--bar-fade-inset)",
              fadeOn === "page" && "kit-edge-fade-block",
            ]}
            style:--reveal-foot={`max(${docked ? "var(--c-sheet-max-h)" : "var(--bar-reach)"}, var(--fade-foot))`}
            style:--bar-reach={"calc(var(--c-composer-panel) + var(--space-4) + var(--safe-bottom) + var(--space-3))"}
            style:--bar-fade-inset="calc(var(--bar-reach) - var(--space-3))"
          >
            <ProjectHead
              {lead}
              {machine}
              onask={canTalk ? ask : null}
              onfilter={(anchor) => {
                filterAnchor = anchor;
                filterOpen = true;
              }}
              onnewtask={() => {
                choose("board");
                adding = true;
              }}
              setup={setupAct}
              {project}
              seated={!standing}
            />

            {#if lead.problem}
              <Alert
                data-id-page-notice
                class="me-space-6 mb-space-3 ms-space-7 w-auto max-desk:mx-space-5"
                variant="warning"
              >
                <AlertDescription>{lead.problem}</AlertDescription>
              </Alert>
            {/if}
            {#if board.stages && board.stages.problems.length > 0}
              <Alert
                data-id-page-notice
                class="me-space-6 mb-space-3 ms-space-7 w-auto max-desk:mx-space-5"
                variant="warning"
              >
                <AlertDescription>{unreadStages}</AlertDescription>
              </Alert>
            {/if}
            {#if board.list && board.list.problems.length > 0}
              <Alert
                data-id-page-notice
                class="me-space-6 mb-space-3 ms-space-7 w-auto max-desk:mx-space-5"
                variant="warning"
              >
                <AlertDescription
                  >{board.list.problems.join(" ")}</AlertDescription
                >
              </Alert>
            {/if}
            {#if unread && !paneSaysUnread}
              <!-- The tasks stand, but the stages or the views didn't come: said
                 once, here, with its Retry. -->
              <Alert
                data-id-page-notice
                class="me-space-6 mb-space-3 ms-space-7 w-auto max-desk:mx-space-5"
                variant="warning"
              >
                <AlertDescription>{unread}</AlertDescription>
                <AlertAction>
                  <Button
                    label="Retry"
                    onclick={readAgain}
                    pending={rereading}
                    pendingLabel="Retrying…"
                    size="sm"
                    variant="outline"
                  />
                </AlertAction>
              </Alert>
            {/if}

            <!-- Under the head from 640px; a phone's views are its bar's. -->
            <div class="contents max-phone:hidden">
              {@render strip(wide)}
            </div>

            {#if phone}
              <!-- Under 900px a task is its own page: the view stands alone,
                 the page's one scroller on a phone. -->
              {@render viewPane()}
            {:else}
              <Split
                backLabel="Back to {viewWord}"
                defaultWidth={40}
                keys={{
                  width: `cawco.task.width.${projectId}`,
                  expanded: `cawco.task.expanded.${projectId}`,
                }}
                main={viewPane}
                open={!!openFile || (!!openTask && !!board.stages)}
                side={sideCard}
              />
            {/if}
          </div>
          {#if !wide}
            <ViewBar
              {current}
              needs={needsYou.length}
              needsOn={filtering}
              onchoose={choose}
              onnewsession={() => lead.newConversation()}
              ontoggleneeds={() => {
                needsOnly = !filtering;
              }}
              views={barViews}
            >
              {#snippet tools()}
                <!-- As the strip draws it on a narrow screen: its glyph and count
                 while a filter stands; the head's ⋯ opens it. -->
                {#if filterHere && narrowed > 0}
                  <TaskFilterPopover
                    compact
                    {filter}
                    look="in-bar"
                    {find}
                    onchange={setFilter}
                    tasks={[...board.tasks, ...board.archived]}
                  />
                {/if}
              {/snippet}
            </ViewBar>
          {/if}
          <!-- Outside the scroller, whose edge fade would mask it where it
           floats: a fixed box is drawn under its ancestors' masks. -->
          {#if shown === "board" || shown === "table"}
            {@render bulkBar()}
          {/if}
        </div>
      {/if}
    {/snippet}
    {#snippet dock()}
      <CawFloat
        {asksElsewhere}
        {front}
        {lead}
        {projectId}
        projectName={project?.name ?? ""}
        setup={setupProgress}
      />
    {/snippet}
  </ProjectDock>
{/if}

<!-- His seat over the setup scene, the same seat the empty board stands
     him on (CawSeat at 80): a press opens his panel beside the page. -->
{#snippet setupSeat()}
  <div
    data-slot="caw-80"
    class="grid justify-items-center"
    data-share="caw:{projectId}"
    out:sitDown|global
  >
    <CawSeat {lead} {projectId} projectName={project?.name ?? ""} size={80} />
  </div>
{/snippet}

{#snippet sideCard()}
  {#if sideHeld && "file" in sideHeld}
    {#key sideHeld.file}
      <FolderFile onclose={closeFile} path={sideHeld.file} {projectId} />
    {/key}
  {:else if sideHeld && board.stages}
    <TaskPane
      {allowedFrom}
      onchanged={(task) => board.changed(task)}
      onclose={closeTask}
      onmove={(id, stage) => board.move(id, stage)}
      onopen={openOne}
      {pageOf}
      {projectId}
      stages={board.stages}
      taskId={sideHeld.task}
      tasks={board.tasks}
    />
  {/if}
{/snippet}

{#snippet viewPane()}
  <div
    data-slot="pane"
    aria-busy={connectionStore.hub === "unreachable" ||
      awaiting ||
      reading.current}
    class={[
      "group flex min-h-0 max-w-full flex-auto flex-col overflow-y-auto pt-0 pe-space-6 ps-space-7 max-desk:px-space-5 view-board:overflow-hidden view-canvas:overflow-hidden view-decisions-page:overflow-hidden max-phone:shrink-0 max-phone:overflow-visible max-phone:view-board:overflow-visible max-phone:view-canvas:basis-0 max-phone:view-canvas:min-h-(--pane-min) max-phone:view-canvas:overflow-visible max-phone:view-decisions-page:basis-0 max-phone:view-decisions-page:min-h-(--pane-min) max-phone:view-decisions-page:overflow-visible",
      fadeOn === "pane" && "kit-edge-fade-block",
      paneFoot,
    ]}
    data-view={reading.current ? "board" : paneView}
    style:--draft-bleed-end={sheetQuery.current
      ? "var(--space-5)"
      : "var(--space-6)"}
    style:--draft-bleed-start={sheetQuery.current
      ? "var(--space-5)"
      : "var(--space-7)"}
    style:--pane-min={docked ? "calc(50cqb + var(--c-sheet-max-h))" : "50cqb"}
  >
    {#if reading.current}
      <!-- The board at its real layout, its columns standing empty: the
             next project's read takes its place in the skeleton's reveal. -->
      <div
        aria-hidden="true"
        class="grid auto-cols-(--skeleton-col) grid-flow-col gap-space-3 overflow-hidden max-phone:auto-cols-(--skeleton-col-phone)"
        style:--skeleton-col={"minmax(var(--c-board-col-min), var(--c-board-col-max))"}
        style:--skeleton-col-phone="calc(100% - var(--space-8))"
        out:revealOut
      >
        {#each stageList.filter((stage) => stage.kind !== "dropped") as stage (stage.name)}
          <div
            class="flex flex-col gap-space-2 rounded-lg bg-surface-band p-space-2 inset-ring inset-ring-border-hairline"
          >
            <Skeleton class="w-3/5" line="label" />
            <Skeleton class="w-full" height="card" radius="chip" />
            <Skeleton class="w-full" height="card" radius="chip" />
          </div>
        {/each}
      </div>
    {:else}
      <div
        data-slot="swap"
        class="relative flex min-h-0 flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-page:flex-auto"
        in:reveal
      >
        <!-- A view the URL names, still read, stands as its skeleton, which
             hands its place to the view in its reveal; one view to the next
             swaps as the lists do (leave). -->
        {#if shown === "awaiting"}
          <div
            class="flex min-h-0 flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-page:flex-auto"
            out:revealOut
          >
            <Skeleton class="w-full" height="board" radius="card" />
          </div>
        {:else}
          <div
            class="relative flex min-h-0 flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-page:flex-auto"
            in:reveal
          >
            {#key shown}
              <div
                class="flex min-h-0 flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-page:flex-auto"
                style:animation={swap.rowAnim(0)}
                out:leave
              >
                {@render pane(shown)}
              </div>
            {/key}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#if project}
  <Popover.Root bind:open={askOpen}>
    <!-- The ask is the session Composer floating under the menu: the
         composer is the surface (its pill, edge and shadow), so the popover
         draws none of its own (`bare`), and its box is as tall as what the
         Composer stands (Composer's dock stands on its foot). -->
    <Popover.Content
      align="end"
      bare
      class="w-(--ask-w)"
      customAnchor={askAnchor}
      side="bottom"
      style="--ask-w: min(var(--c-panel-w), calc(100vw - 2 * var(--c-screen-margin)))"
    >
      <div
        class="relative w-full"
        style:block-size="calc({viewFoot}px + var(--space-4))"
      >
        <Composer
          fleet={composerFleet}
          agentName="Caw"
          attach={false}
          draft={viewDraft}
          onfoot={(foot) => {
            viewFoot = foot.stack;
          }}
          onstop={() => undefined}
          onsubmit={(text) => {
            detach(askView(text), "askView");
          }}
          placeholder={viewsWords.placeholder}
          sendAgain={viewAgain}
          sendError={viewRefused}
          sending={viewSending}
        />
      </div>
    </Popover.Content>
  </Popover.Root>

  {#if filterAnchor}
    <TaskFilterPopover
      anchor={filterAnchor}
      {filter}
      {find}
      onchange={setFilter}
      tasks={[...board.tasks, ...board.archived]}
      bind:open={filterOpen}
    />
  {/if}
{/if}
