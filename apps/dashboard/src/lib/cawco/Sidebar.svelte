<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * Fleet sidebar — reimplemented on top of the shadcn-svelte sidebar primitives
   * (ui/sidebar/*), following the Fluid Functionalism inset preset pattern:
   *
   *   • Header: the CawCo icon + workspace name, search input, "+ New" row
   *   • Content: Fleet nav group, Machines group, Projects (collapsible groups
   *     with sub-items for sessions), Running-now and Not-running sections
   *   • Footer: user avatar + machine count
   *
   * The rail is now built from SidebarGroup / SidebarMenu / SidebarMenuButton /
   * SidebarMenuSub / SidebarMenuSubButton rather than hand-rolled CSS, inheriting
   * built-in hover, active, focus, and spacing from the component library.
   *
   * A session says what it is doing on its mark (SessionMark: an echo, or a
   * dot on its corner) rather than in a text pill.
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { TextMorph } from "torph/svelte";
  import cawcoIcon from "#lib/assets/brand/cawco-icon.png";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import ThemeSwitcher from "#lib/components/ui/ThemeSwitcher.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAssistant,
    IconBox,
    IconHistory,
    IconPlus,
    IconSettings,
    IconSort,
    IconWorkflow,
  } from "#lib/icons.js";
  import { formatAgeShort, formatDistanceToNow } from "#lib/utils/time.js";
  import { page } from "$app/state";
  import type { Activity } from "./activity";
  import {
    cawco,
    type InstanceRow,
    isFailed,
    isResumable,
    isStale,
    type ProjectRow,
  } from "./client.svelte";
  import { LAST_KEY as CONFIG_LAST_KEY, SECTIONS } from "./config/sections";
  import FolderMenu from "./FolderMenu.svelte";
  import { folderPrefs } from "./folder-prefs.svelte";
  import Home from "./home/Home.svelte";
  import HomeRecent from "./home/HomeRecent.svelte";
  import { rowHref } from "./links";
  import { markHue } from "./mark";
  import { type BranchOptions, branch, nestFrom } from "./motion/branch.svelte";
  import { CURVE, dur } from "./motion/curves.svelte";
  import { echoBeat } from "./motion/echo.svelte";
  import { heldOrder, holdWhileInside } from "./motion/held-order.svelte";
  import { reflow } from "./motion/rows.svelte";
  import NewProjectPopover from "./NewProjectPopover.svelte";
  import { olderOpen, openTrees } from "./open-trees.svelte";
  import ProjectMark from "./ProjectMark.svelte";
  import { type RailSort, rail } from "./rail.svelte";
  import SessionHover from "./SessionHover.svelte";
  import SessionRow, { ROW_PILL } from "./SessionRow.svelte";
  import { newSession } from "./spawn/new-session.svelte";
  import TreeMark from "./TreeMark.svelte";
  import { rooted, topsIn, tree } from "./tree";
  import UsageMeter from "./UsageMeter.svelte";
  import { workflowState } from "./workflow-state.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    onassistant,
    assistantOpen,
    narrow,
    scroller,
  }: {
    /** Toggles the assistant, which Shell owns so ⌘J and this row share it. */
    onassistant: () => void;
    assistantOpen: boolean;
    /** The Shell's live narrow answer: a phone opens Configure on its list. */
    narrow: boolean;
    /**
     * Attached to the box the rail's groups scroll in, once they are drawn.
     * The Shell keeps the wide screen's scroll through it while the rail is
     * away (Shell `keepScroll`); a box of its own inside names itself with
     * `data-keep-scroll`.
     */
    scroller?: Attachment<HTMLElement>;
  } = $props();

  const path = $derived(page.url.pathname);
  /**
   * On a phone Configure opens on its section list, every time. A wide
   * screen opens the section last visited, re-read on every navigation so
   * leaving one section for the board and coming back returns to it.
   */
  const configureHref = $derived.by(() => {
    if (narrow) {
      return "/config";
    }
    let last: string | null = null;
    if (path.startsWith("/config/")) {
      [, , last] = path.split("/");
    } else if (typeof localStorage !== "undefined") {
      last = localStorage.getItem(CONFIG_LAST_KEY);
    }
    return `/config/${SECTIONS.some((section) => section.slug === last) ? last : "rules"}`;
  });
  const configuring = $derived(path.startsWith("/config"));
  /**
   * Which conversation is in front, for the rows to mark. The workspace
   * store, not the URL: a tab switch writes the address with `pushState`,
   * which moves nothing the page reads, so a rail keyed to the path stayed
   * on the tab the reader had left.
   */
  const activeSession = $derived(
    path.startsWith("/session") ? workspace.activeSessionId : null
  );

  /** The rail itself: its session rows open the session card (SessionHover). */
  let railEl = $state<HTMLElement>();

  /**
   * The rail's steps, named once. Every size here comes from app.css's scale
   * (`--text-body` 15px for the nav step, `--text-label` 13.5px for list rows,
   * `--text-label` 12.5px for section labels) rather than Tailwind's own, which
   * runs a step and a half smaller at every level and is how a rail of `text-meta`
   * rows ends up unreadable.
   *
   * Heights are the same two the rail always had: the nav band is tall because
   * six destinations can afford to be, and a LIST row is 30px because a rail of
   * 40px rows is a rail that fits eight things.
   */
  const NAV_ROW = "h-[var(--c-nav-h)] gap-2.5 px-2.5 text-body";
  /** A project's row: it ends where a session's does (`pr-2`), so the
   *  counts at the trailing edge stand in one column down the rail. */
  const LIST_ROW = "h-[30px] gap-2.5 pl-2.5 pr-2 py-0";
  /**
   * A row under a project that is no session ("N older", "No sessions"):
   * the compact session row's own measures (SessionRow), so its lead and its
   * words stand on the sessions' axes.
   */
  const SUB_ROW =
    "h-(--row-compact-h) gap-(--row-compact-gap) pl-(--row-compact-gap) pr-(--row-compact-pad-end)";
  /** How a tree's rows open and fold (motion/branch): off each row's mark. */
  const TREE: BranchOptions = { glyph: ".tree-mark" };
  /**
   * What stands in a row's lead slot under a project: a tree mark (a
   * session's, the "N older" row's), or the glyph of a row that is neither
   * ("No sessions"). The rail's arm ends there.
   */
  const LEAD = ".tree-mark, .row-lead";
  /**
   * A project's rows, and its older rows under the row that lists them:
   * each hangs off its parent row's own tree mark, the first in that row.
   */
  const LEAD_TREE: BranchOptions = { glyph: LEAD };
  /** The height the loading rows stand at: a list row's. */
  const LIST_ROW_H = "h-[30px]";
  /** `Sidebar.Group`'s own `p-2` plus `Sidebar.Content`'s `gap-2` stacked to
   *  24px of nothing between every section; the label already separates them. */
  const GROUP = "px-2 py-1";

  /**
   * How far the fleet's first read has come: 1 workflow runs, 2 machines and
   * sessions, 3 every online machine's stored sessions (or the hub is known
   * to be unreachable). It only climbs: a machine coming online later is a
   * live change, not part of the first read. A rail mounted after the read
   * (the drawer opening, the window widening past the drawer's line) starts
   * where the read stands, so its groups are drawn in the update that
   * mounts it and its scroll can be put back over them (`scroller`).
   */
  const readSoFar = (): number => {
    if (cawco.hub === "unreachable") {
      return 3;
    }
    if (!workflowState.loaded) {
      return 0;
    }
    if (!cawco.fleetRead) {
      return 1;
    }
    return cawco.catalogsRead ? 3 : 2;
  };
  let stage = $state(untrack(readSoFar));
  $effect(() => {
    const next = readSoFar();
    if (next > stage) {
      stage = next;
    }
  });
  const GROUP_LABEL = "px-2.5";
  /** A label carrying a control (the sort, the delegates toggle): on a coarse
   *  pointer it takes a 44px row, so the control's touch area stays inside
   *  it, clear of the session row below. */
  const CONTROL_LABEL = "pr-1 pointer-coarse:h-11";
  /** 2px, not 4: these are rows of one list, not six unrelated buttons. */
  const MENU = "gap-0.5";
  /**
   * Every row in the rail shares one hover ghost that glides from row to row
   * across the groups; the nav and each session list carry their own
   * selection pill under it (components/ui/highlight).
   */
  /** Every clickable row in the rail: menu rows, session rows, "Show N more". */
  const ROWS = "[data-rail-row]";
  /** The selected row: a menu row's own flag, or the open session's row. */
  const PILL = {
    rows: ROWS,
    selected: `[data-active="true"], ${ROW_PILL.selected}`,
    ghost: false,
  };
  /**
   * The lead column, 18px, on EVERY row in the rail — nav, machines, projects,
   * sessions, the brand icon and the footer avatar alike. What sits in it
   * varies; the column does not, which is the only reason every label in the
   * rail starts at the same x (10px of row padding + 18 + 10 of gap = 38px).
   */
  const SLOT = "inline-flex size-[18px] shrink-0 items-center justify-center";
  /** A line glyph in the slot: 16px, 1px of air. */
  const SLOT_GLYPH = "size-4";

  /* ---- projects ------------------------------------------------------- */

  /** Which folders are shut is the reader's, kept in folder-prefs, so a reload keeps it. */
  function toggle(project: ProjectRow) {
    folderPrefs.setCollapsed(project.cwd, !folderPrefs.collapsed(project.cwd));
  }

  function collapseOthers(id: string) {
    for (const project of orderedProjects) {
      folderPrefs.setCollapsed(project.cwd, project.id !== id);
    }
  }

  /** What is running now: sessions, and workflow runs still going. */
  const running = $derived([
    ...cawco.runningInstances,
    ...cawco.runRows.filter((row) => row.status === "running"),
  ]);

  const orderedProjects = $derived.by(() =>
    [...cawco.projects].sort((a, b) => {
      const pa = rail.isPinned(a.id) ? 0 : 1;
      const pb = rail.isPinned(b.id) ? 0 : 1;
      if (pa !== pb) {
        return pa - pb;
      }
      return a.name.localeCompare(b.name);
    })
  );

  /** A folder on a machine, as the lookups below key it. */
  const folderKey = (machineId: string, cwd: string): string =>
    `${machineId}\u0000${cwd}`;

  /** The projects in each folder, by machine and folder. */
  const projectsAt = $derived.by(() => {
    const at = new Map<string, string[]>();
    for (const project of cawco.projects) {
      const key = folderKey(project.machineId, project.cwd);
      at.set(key, [...(at.get(key) ?? []), project.id]);
    }
    return at;
  });
  const projectIds = $derived(
    new Set(cawco.projects.map((project) => project.id))
  );

  /**
   * The projects a row belongs to: the one its `projectId` names, and every
   * project on its machine whose folder is its folder or holds it — nested
   * project folders both claim it. Found by walking the row's folder up its
   * path, one lookup per level, rather than testing it against every
   * project: a folder `p` holds `cwd` exactly when `cwd` is `p` or starts
   * with `p/`, which is `p` being `cwd` or `cwd` cut at one of its slashes.
   */
  function projectsOf(row: InstanceRow): Set<string> {
    const found = new Set<string>();
    if (row.projectId && projectIds.has(row.projectId)) {
      found.add(row.projectId);
    }
    const { cwd } = row;
    if (!cwd) {
      return found;
    }
    const claim = (folder: string) => {
      for (const id of projectsAt.get(folderKey(row.machineId, folder)) ?? []) {
        found.add(id);
      }
    };
    claim(cwd);
    for (let at = cwd.indexOf("/"); at !== -1; at = cwd.indexOf("/", at + 1)) {
      claim(cwd.slice(0, at));
    }
    return found;
  }

  /**
   * Every project's sessions, live and resting, as the rail lists them, in
   * one pass over what runs and what rests: a turn ending re-reads each row
   * once, where testing each project against every row read them all once
   * per project. A delegate is work the reader handed off — six of them
   * under one session is six rows about one thing — so it hangs in its
   * parent's tree, folded into the parent's count until opened. With the
   * Delegates switch off, a delegate whose parent the project does not list
   * is left out (tree.ts `rooted`): "Not running" is where those pile up by
   * the hundred.
   *
   * A row lists in the projects of the session at the top of its chain of
   * parents (tree.ts `topsIn`, over every row the rail knows), whatever
   * machine and folder it runs on itself. Placed by its own, a delegate
   * started on another machine has that machine's id and a worktree path
   * there: no project on its parent's machine claimed it, so it stood apart
   * from its parent or in no list, and the switch then dropped it for want
   * of a parent in its list. A row with no parent the rail knows is its own
   * top, and lists by its own project, machine and folder.
   */
  const topOf = $derived.by(() =>
    topsIn(new Map([...running, ...notRunning].map((row) => [row.id, row])))
  );
  const listed = $derived.by(() => {
    const lists = new Map<
      string,
      { live: InstanceRow[]; resting: InstanceRow[] }
    >();
    const listOf = (id: string) => {
      let list = lists.get(id);
      if (!list) {
        list = { live: [], resting: [] };
        lists.set(id, list);
      }
      return list;
    };
    const liveIds = new Set<string>();
    for (const row of running) {
      liveIds.add(row.id);
      for (const id of projectsOf(topOf(row))) {
        listOf(id).live.push(row);
      }
    }
    // A row both running and resting belongs to the same projects either
    // way, so it is left out of every resting list it would join.
    for (const row of notRunning) {
      if (liveIds.has(row.id)) {
        continue;
      }
      for (const id of projectsOf(topOf(row))) {
        listOf(id).resting.push(row);
      }
    }
    if (!rail.delegates) {
      for (const [id, { live, resting }] of lists) {
        const kept = new Set(
          rooted([...live, ...resting]).map((row) => row.id)
        );
        lists.set(id, {
          live: live.filter((row) => kept.has(row.id)),
          resting: resting.filter((row) => kept.has(row.id)),
        });
      }
    }
    return lists;
  });

  const NOTHING: InstanceRow[] = [];

  const sessionsOf = (project: ProjectRow): InstanceRow[] =>
    listed.get(project.id)?.live ?? NOTHING;

  /**
   * A project's count, on its mark: the sessions running in it that are
   * their own top. Its delegates are counted on their parent's mark; counted
   * here too, a session and the ten it started read as eleven on the
   * project, and the number is the project's status, not its rows.
   */
  const runningIn = (project: ProjectRow): number =>
    sessionsOf(project).filter((row) => topOf(row) === row).length;

  /* ---- recent and older ------------------------------------------------
   * A project lists what is recent — running, waiting on you, or moved in
   * the last day — topped up from the newest of the rest until it lists
   * OLDER_ROWS rows, and folds what remains under one "N older" row, unless
   * only one remains. Opened, the older ones scroll in a box OLDER_ROWS rows
   * tall, so they never push the projects under them down the rail.
   */
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** Rows the older box shows before it scrolls, and a project lists unfolded. */
  const OLDER_ROWS = 6;

  interface Split {
    older: InstanceRow[];
    recent: InstanceRow[];
  }
  const NO_SPLIT: Split = { recent: NOTHING, older: NOTHING };

  /**
   * Whether two rows draw the same: the same row, or one whose every field
   * a session row shows is the same (its status, name, place, age when it
   * has no pulse, and where it hangs). Activity and pulses are read by the
   * rows themselves, per row.
   */
  const drawsAlike = (a: InstanceRow, b: InstanceRow): boolean =>
    a === b ||
    (a.id === b.id &&
      a.status === b.status &&
      a.title === b.title &&
      a.cwd === b.cwd &&
      a.machineId === b.machineId &&
      a.parentInstanceId === b.parentInstanceId &&
      a.updatedAt === b.updatedAt);

  /** `next`, or `was` where it lists the same rows in the same order, drawn alike. */
  const keep = (next: InstanceRow[], was: InstanceRow[] | undefined) =>
    was !== undefined &&
    next.length === was.length &&
    next.every((row, i) => drawsAlike(row, was[i]))
      ? was
      : next;

  /** The splits the last derivation handed out, by project. */
  let lastSplits = new Map<string, Split>();

  /**
   * Every project's recent and older lists. A project whose rows did not
   * change keeps the very arrays it had — and the split object holding them
   * — so its lists' `{#each}` have nothing to do on a turn that ended
   * somewhere else.
   */
  const splits = $derived.by(() => {
    const next = new Map<string, Split>();
    for (const [id, { live, resting }] of listed) {
      const split = splitRows(live, resting);
      const was = lastSplits.get(id);
      const recent = keep(split.recent, was?.recent);
      const older = keep(split.older, was?.older);
      next.set(
        id,
        was && recent === was.recent && older === was.older
          ? was
          : { recent, older }
      );
    }
    lastSplits = next;
    return next;
  });

  const splitOf = (project: ProjectRow): Split =>
    splits.get(project.id) ?? NO_SPLIT;

  function splitRows(live: InstanceRow[], resting: InstanceRow[]): Split {
    const recentIds = new Set(live.map((row) => row.id));
    for (const row of resting) {
      if (
        cawco.activityOf(row.id) === "blocked" ||
        now - lastAt(row) < DAY_MS
      ) {
        recentIds.add(row.id);
      }
    }
    // A tree stays whole on the side its top row is on, so a delegate of a
    // recent session folds under it rather than standing alone among the
    // older ones.
    // Its top is the rail's (`topOf`): a row lists where its top lists, so
    // the top of every row here is in this project's rows too.
    const all = [...live, ...resting];
    // A project with only a few sessions lists them all: the list is topped
    // up to the older box's six rows from the newest older trees, and a fold
    // that would hide one row lists it instead, at the same height.
    const shownTops = new Set<string>();
    const olderTops = new Map<string, InstanceRow>();
    for (const row of all) {
      const top = topOf(row);
      if (recentIds.has(top.id)) {
        shownTops.add(top.id);
      } else {
        olderTops.set(top.id, top);
      }
    }
    const room = Math.max(0, OLDER_ROWS - shownTops.size);
    const topUp = [...olderTops.values()].sort((a, b) => lastAt(b) - lastAt(a));
    for (const top of topUp.length - room > 1 ? topUp.slice(0, room) : topUp) {
      shownTops.add(top.id);
    }
    const recent: InstanceRow[] = [];
    const older: InstanceRow[] = [];
    for (const row of all) {
      (shownTops.has(topOf(row).id) ? recent : older).push(row);
    }
    return { recent, older };
  }

  /** Projects whose older rows are asked for and not yet drawn. */
  const olderPending = new SvelteSet<string>();
  /** How many of an open project's older trees are drawn so far. */
  const olderDrawn = new SvelteMap<string, number>();
  /** The frame each project's older rows are next drawn on. */
  const olderFrames = new Map<string, number>();
  /** Older trees drawn a frame once the box's first rows stand. */
  const OLDER_STEP = 24;

  /**
   * Opens a project's older rows, or folds them. The press shows at once: the
   * row is busy and its chevron gives way to the spinner in the frame of the
   * press, and the rows are drawn on the frame after that one is painted, so
   * the press never waits on them. Only what the box shows is drawn then (a
   * project with 275 older rows drew every one in the press's own task); the
   * rest follow once the box has opened (`fillOlder`). A press while it is
   * busy or open takes it back, whatever was under way.
   */
  function toggleOlder(id: string) {
    cancelAnimationFrame(olderFrames.get(id) ?? 0);
    olderFrames.delete(id);
    if (olderOpen.has(id) || olderPending.has(id)) {
      olderOpen.delete(id);
      olderPending.delete(id);
      olderDrawn.delete(id);
      return;
    }
    olderPending.add(id);
    const later = (run: () => void) =>
      olderFrames.set(id, requestAnimationFrame(run));
    // The first frame paints the busy row; the rows are drawn on the next.
    later(() =>
      later(() => {
        olderFrames.delete(id);
        olderDrawn.set(id, OLDER_ROWS);
        olderOpen.add(id);
        olderPending.delete(id);
      })
    );
  }
  /**
   * The rest of an open box's rows, a frame at a time under its fold, from
   * the moment its opening ends: drawn while it opened, they were measured
   * into its line, which then ran the length of every row and landed seconds
   * late.
   */
  function fillOlder(id: string, total: number) {
    const drawn = olderDrawn.get(id);
    if (drawn === undefined || drawn >= total) {
      return;
    }
    olderFrames.set(
      id,
      requestAnimationFrame(() => {
        olderDrawn.set(id, drawn + OLDER_STEP);
        fillOlder(id, total);
      })
    );
  }
  $effect(() => () => {
    for (const frame of olderFrames.values()) {
      cancelAnimationFrame(frame);
    }
  });
  /** Open by hand, or because the conversation in front is one of them. */
  const olderShown = (project: ProjectRow, older: InstanceRow[]): boolean =>
    olderOpen.has(project.id) ||
    (activeSession !== null && older.some((row) => row.id === activeSession));

  // The conversation in front stays in view inside its older box.
  $effect(() => {
    const id = activeSession;
    if (!id) {
      return;
    }
    requestAnimationFrame(() => {
      document
        .querySelector(`.older [data-session-row="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  });

  /** Marks which edges of a scroll box have more past them, for the fade. */
  const scrollEdges: Attachment<HTMLElement> = (node) => {
    const mark = () => {
      node.toggleAttribute("data-more-above", node.scrollTop > 0);
      node.toggleAttribute(
        "data-more-below",
        node.scrollTop + node.clientHeight < node.scrollHeight - 1
      );
    };
    mark();
    const sizes = new ResizeObserver(mark);
    sizes.observe(node);
    // Rows that arrive after the box opened (`fillOlder`) leave its own size
    // as it was: only its content grew.
    const rows = new MutationObserver(mark);
    rows.observe(node, { childList: true });
    node.addEventListener("scroll", mark, { passive: true });
    return () => {
      sizes.disconnect();
      rows.disconnect();
      node.removeEventListener("scroll", mark);
    };
  };

  /** What a project says when nothing in it runs: how much of it is resumable. */
  const notRunning = $derived([
    ...cawco.listedInstances.filter(
      (row) => isResumable(row) || isStale(row) || isFailed(row)
    ),
    ...cawco.runRows.filter(isFailed),
  ]);

  /* ---- order -----------------------------------------------------------
   *
   * The rail could not answer "which one was I just in": every list was
   * alphabetical-by-project then arbitrary, and no row carried a time. Both
   * are fixed here — one `lastAt` per session, one comparator over it, and a
   * sort the reader picks once and the rail remembers.
   */

  /**
   * When a session last moved. The daemon's pulse is the freshest signal a
   * rail has (it is broadcast for every session, subscribed or not); a row
   * with no pulse yet falls back to the hub's own `updatedAt`, and one with
   * neither sorts to the bottom rather than pretending to be new.
   */
  function lastAt(row: InstanceRow): number {
    const pulse = cawco.pulseAt(row.id);
    if (pulse !== undefined) {
      return pulse;
    }
    const moved = row.updatedAt;
    if (moved === null || moved === undefined) {
      return 0;
    }
    const at = new Date(moved).getTime();
    return Number.isNaN(at) ? 0 : at;
  }

  const SORT_LABEL: Record<RailSort, string> = {
    recent: "Last activity",
    name: "Name",
    state: "State",
  };

  /** Blocked before working before idle — the triage order, for `state`. */
  const STATE_ORDER: Record<Activity, number> = {
    blocked: 0,
    working: 1,
    idle: 2,
  };

  /**
   * One comparator for every session list in the rail, so "Running now" and a
   * project's sub-list and "Not running" never disagree about what first means.
   * Recency is the tiebreak under `name` and `state` alike: two idle sessions
   * in one project are still told apart by which one you touched last.
   */
  function ordered(rows: InstanceRow[], key: string): InstanceRow[] {
    // Held (motion/held-order): activity never moves a row, and a settled
    // re-sort lands only while the pointer is away from the rail's lists.
    return heldOrder(key, sorted(rows), (row) => row.id);
  }

  function sorted(rows: InstanceRow[]): InstanceRow[] {
    const by = rail.sort;
    return [...rows].sort((a, b) => {
      if (by === "name") {
        const cmp = sessionName(a).localeCompare(sessionName(b));
        if (cmp !== 0) {
          return cmp;
        }
      }
      if (by === "state") {
        const cmp =
          STATE_ORDER[cawco.activityOf(a.id)] -
          STATE_ORDER[cawco.activityOf(b.id)];
        if (cmp !== 0) {
          return cmp;
        }
      }
      return lastAt(b) - lastAt(a);
    });
  }

  /**
   * A session and the sessions it started. A delegate names its parent
   * (`parentInstanceId`), and the rail was drawing every one of them at the
   * root — a project with one session and six delegates read as seven peers,
   * which is exactly backwards about what is running.
   */
  interface Branch {
    /** The rows under it, as branches of their own. */
    children: Branch[];
    /** Every row under it, at any depth. */
    count: number;
    row: InstanceRow;
  }

  /**
   * `rows` as the tree they are (tree.ts), siblings sorted by the reader's
   * {@link ordered} at every depth. Each parent shows its count and starts
   * folded; whether it is open is the reader's (open-trees).
   */
  function branches(rows: InstanceRow[], key: string): Branch[] {
    const lines = tree(rows, {
      order: (list, under) => ordered(list, `${key}:${under}`),
    });
    const byId = new Map<string, Branch>();
    const roots: Branch[] = [];
    // Tree order puts each parent before its children.
    for (const line of lines) {
      const node: Branch = {
        row: line.row,
        children: [],
        count: line.descendants.length,
      };
      byId.set(line.row.id, node);
      const parent = line.parent ? byId.get(line.parent) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  /**
   * One clock for every row in the rail. A row that ticked for itself would
   * put a timer per session on a list of two hundred, and they all read the
   * same minute. Same rule as LiveSessionRow's module clock.
   */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  /** The age column, and the full sentence behind it on hover. */
  const ageOf = (row: InstanceRow): string => {
    const at = lastAt(row);
    return at === 0 ? "" : formatAgeShort(at, now);
  };
  const ageHint = (row: InstanceRow): string => {
    const at = lastAt(row);
    return at === 0
      ? "No activity recorded"
      : `Last activity ${formatDistanceToNow(new Date(at))}`;
  };

  /* ---- helpers -------------------------------------------------------- */

  const sessionName = (row: InstanceRow): string =>
    row.title?.trim() ||
    row.cwd.split("/").filter(Boolean).pop() ||
    row.id.slice(0, 8);

  const fleetCount = $derived(
    cawco.blockedCount || cawco.runningInstances.length
  );

  /** TextMorph's length, read from the token once the stylesheet is there. */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
</script>

{#snippet pending(
  rows: number,
  height: string
)}
  <!-- Rows where the next groups will stand, while their read is out, at the
       height of the rows that replace them. Each stage has its own, gone when
       that stage's groups arrive, so nothing drawn is ever pushed down. -->
  <Sidebar.Group aria-busy="true" aria-label="Loading" class={GROUP} data-flip>
    <div class="flex h-8 items-center {GROUP_LABEL}">
      <Skeleton class="h-3 w-20" />
    </div>
    <div class="flex flex-col gap-0.5">
      {#each Array.from({ length: rows }, (_, row) => row) as row (row)}
        <Skeleton class="{height} w-full" />
      {/each}
    </div>
  </Sidebar.Group>
{/snippet}

<!-- The sidebar primitives (Header, Content, Footer) expect a flex-column
     parent — the old `.rail` class provided this; now it's an explicit wrapper
     since the Shell's own `<aside>` doesn't set the direction. -->
<!-- When a session last moved, in the ~28px a rail can spare. Every session
     row in the rail renders this, so "which one was I just in" is answered by
     looking down one column instead of opening six of them. -->

<!-- A session, and when it is open the sessions it started, on a rail of
     their own that leaves its mark (app.css .kit-nest): the same row at
     every depth, each parent folded until its count is clicked. The row
     opens the session; the count opens the rows under it. -->
{#snippet subRow(
  node: Branch
)}
  {@const row = node.row}
  {@const unfolded = node.count > 0 && openTrees.has(row.id, "rail")}
  <!-- The row's box (`data-flip="box"`): when its delegates open, it takes
       their room at once and its edge travels down to it, the rows under
       it sliding with that edge (motion/rows). -->
  <li
    class="group/menu-sub-item relative"
    data-flip="box"
    data-session-row={row.id}
    data-sidebar="menu-sub-item"
    data-slot="sidebar-menu-sub-item"
  >
    <!-- The one session row (SessionRow), on one line; its mark says how
         many delegates it has and opens them. -->
    <SessionRow
      active={activeSession === row.id}
      compact
      fold={node.count > 0
        ? {
            count: node.count,
            open: unfolded,
            ontoggle: () => openTrees.toggle(row.id, "rail"),
          }
        : null}
      hint={ageHint(row)}
      href={rowHref(row.id)}
      instance={row}
      machineId={row.machineId}
      peek={false}
      title={sessionName(row)}
      trail={ageOf(row)}
    />
    {#if unfolded}
      <!-- Its delegates, on a rail of their own that grows from this row's
           mark; each swipes out along its arm as the rail reaches it, and
           folds back into it the same way (motion/branch). reflow never
           copies or uncovers what is inside (`data-flip-anchor`). -->
      <ul
        class="kit-nest flex min-w-0 flex-col gap-(--tree-gap) pt-(--tree-gap) pl-(--nest-pad)"
        data-flip-anchor
        in:branch={TREE}
        out:branch={TREE}
        {@attach nestFrom(".tree-mark")}
      >
        {#each node.children as child (child.row.id)}
          {@render subRow(child)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div
  class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
  bind:this={railEl}
  {@attach highlight({ rows: ROWS })}
>
  <!-- ────────────────────── header ──────────────────────── -->

  <Sidebar.Header>
    <!-- The wordmark, and in the header's corner the two things started from
         anywhere: a session (⇧⌘N) and the assistant (⌘J). Jump lives on the
         tab row (Shell), beside the conversations it jumps between. -->
    <div class="flex items-center gap-1">
      <Sidebar.Menu aria-label="Workspace" class="min-w-0 flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW} isActive={false}>
            {#snippet child({
              props,
            })}
              <a href="/session" {...props} class="{props.class} no-underline">
                <!-- The app's own icon (the crow on spark), in the lead
                     column every row's mark stands in. -->
                <img
                  alt=""
                  class="brand-icon"
                  height="18"
                  src={cawcoIcon}
                  width="18"
                >
                <span
                  class="min-w-0 truncate text-[length:var(--text-body)] font-medium text-foreground"
                  >CawCo</span
                >
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <Tip keys="⌘J" label="Assistant">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-expanded={assistantOpen}
            aria-label="Assistant"
            class="head-action focus-inset touch-hit"
            data-assistant-row
            data-on={assistantOpen || undefined}
            onclick={onassistant}
            type="button"
          >
            <IconAssistant class="text-[var(--coral-11)]" />
          </button>
        {/snippet}
      </Tip>
      <Tip keys="⇧⌘N" label="Start session">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-label="Start session"
            class="head-action focus-inset touch-hit"
            onclick={() => newSession()}
            type="button"
          >
            <IconPlus />
          </button>
        {/snippet}
      </Tip>
    </div>
  </Sidebar.Header>

  <!-- ────────────────────── content ──────────────────────── -->

  <!-- Live data comes and goes here all day: a machine re-registering, a
       session starting, a count moving. Every group, row, count and status
       mark is `data-flip`, so it arrives and leaves in place and what it moves
       slides instead of jumping (motion/rows `reflow`). -->
  <Sidebar.Content class="gap-0 py-1" {@attach reflow()} {@attach scroller}>
    <!-- On a wide screen the home is the sidebar: what needs you, what is
         working, what finished, and the rest, while the transcripts take the
         screen. On the narrow line the home is the session surface's own
         page instead, and the rail is only navigation. -->
    <!-- The app's places, first: one compact block, no heading over it. -->
    <Sidebar.Group class={GROUP}>
      <Sidebar.Menu aria-label="Places" class={MENU} {@attach highlight(PILL)}>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith("/session")}
          >
            {#snippet child({
              props,
            })}
              <a href="/session" {...props}>
                <span class={SLOT}><IconBox class={SLOT_GLYPH} /></span>
                <span>Fleet</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
          {#if fleetCount}
            <Sidebar.MenuBadge
              class={cawco.blockedCount > 0
                ? "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]"
                : "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]"}
              data-flip="pop box"
            >
              <TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={String(fleetCount)}
              />
            </Sidebar.MenuBadge>
          {/if}
        </Sidebar.MenuItem>

        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith("/workflows")}
          >
            {#snippet child({
              props,
            })}
              <a href="/workflows" {...props}
                ><span class={SLOT}><IconWorkflow class={SLOT_GLYPH} /></span
                ><span>Workflows</span></a
              >
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Group>
    {#if !narrow}
      <Home variant="rail" />
    {/if}

    <!-- The groups built from the fleet come in together, once every read
         they need is in (`stage` 3): Projects straight under the home, then
         the workflow runs. Arriving each on its own, a later group pushed
         the ones before it down; arriving together, nothing drawn moves.
         Until then, rows standing where they will be. -->
    {#if stage >= 3}
      <!-- Projects. Its working sessions echo in turn, top to bottom
           (motion/echo). -->
      <Sidebar.Group class={GROUP} data-flip {@attach echoBeat()}>
        <Sidebar.GroupLabel class="{GROUP_LABEL} {CONTROL_LABEL}">
          <span>Projects</span>
          <!-- The sort lives here rather than once per list because it governs all
           of them at once: a rail whose projects were ordered by recency and
           whose "Not running" was ordered by name would be two rails. -->
          <div class="-mr-1 ml-auto flex items-center gap-0.5">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({
                  props,
                })}
                  <Button
                    {...props}
                    aria-label="Sort sessions — currently {SORT_LABEL[
                      rail.sort
                    ]}"
                    size="icon-sm"
                    title="Sort sessions — {SORT_LABEL[rail.sort]}"
                    variant="ghost"
                  >
                    <IconSort />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-44">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupHeading
                    >Sort sessions by</DropdownMenu.GroupHeading
                  >
                  <DropdownMenu.RadioGroup
                    onValueChange={(value) => rail.setSort(value as RailSort)}
                    value={rail.sort}
                  >
                    <DropdownMenu.RadioItem value="recent"
                      >Last activity</DropdownMenu.RadioItem
                    >
                    <DropdownMenu.RadioItem value="name"
                      >Name</DropdownMenu.RadioItem
                    >
                    <DropdownMenu.RadioItem value="state"
                      >State</DropdownMenu.RadioItem
                    >
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <NewProjectPopover />
          </div>
        </Sidebar.GroupLabel>
        {#if orderedProjects.length === 0}
          <p class="px-2.5 text-meta text-muted-foreground" data-flip>
            {#if cawco.machines.length === 0}
              Run
              <code
                class="font-mono text-[length:var(--text-label)] text-foreground"
                >cawco</code
              >
              on a machine, then group its checkouts here.
            {:else}
              No projects yet — name a checkout to group its sessions.
            {/if}
          </p>
        {:else}
          <Sidebar.Menu
            class={MENU}
            {@attach highlight(PILL)}
            {@attach holdWhileInside("rail:")}
          >
            {#each orderedProjects as project (project.id)}
              {@const runningCount = runningIn(project)}
              {@const expanded = !folderPrefs.collapsed(project.cwd)}
              <li
                class="group/menu-item relative"
                data-flip="box"
                data-sidebar="menu-item"
                data-slot="sidebar-menu-item"
              >
                <FolderMenu
                  cwd={project.cwd}
                  name={project.name}
                  oncollapseothers={() => collapseOthers(project.id)}
                  onnew={() =>
                    newSession({
                      projectId: project.id,
                      machineId: project.machineId,
                      cwd: project.cwd,
                    })}
                  {project}
                >
                  <Sidebar.MenuButton
                    aria-expanded={expanded}
                    class={LIST_ROW}
                    onclick={() => toggle(project)}
                  >
                    <!-- Its mark says what is running in it, as a
                         session's says its delegates; the whole row is the
                         switch, so the mark only draws the morph. -->
                    <ProjectMark
                      count={runningCount}
                      hue={markHue(project.cwd)}
                      open={expanded}
                    />
                    <span class="min-w-0 flex-1 truncate"
                      >{project.name}
                      {#if runningCount > 0}
                        <span class="sr-only">, {runningCount} running</span>
                      {/if}</span
                    >
                  </Sidebar.MenuButton>
                </FolderMenu>

                <!-- Its sessions hang under it the way a session's delegates
                     hang under theirs: on a rail that leaves the project's
                     mark, each row joined to it by its own arm, opening and
                     folding with the same motion (motion/branch). Every
                     level of the tree steps in by the rail's own measure
                     (app.css .kit-nest), so a session under a project and a
                     delegate under a session are set in alike. -->
                {#if expanded}
                  {@const lists = splitOf(project)}
                  <ul
                    class="kit-nest flex min-w-0 flex-col gap-(--tree-gap) pt-(--tree-gap) pl-(--nest-pad)"
                    data-flip-anchor
                    data-sidebar="menu-sub"
                    data-slot="sidebar-menu-sub"
                    in:branch={LEAD_TREE}
                    out:branch={LEAD_TREE}
                    {@attach nestFrom(".tree-mark", LEAD)}
                  >
                    {#each branches(
                      lists.recent,
                      `rail:${project.id}:recent`
                    ) as node (node.row.id)}
                      {@render subRow(node)}
                    {/each}
                    {#if lists.older.length > 0}
                      {@const olderVisible = olderShown(project, lists.older)}
                      {@const olderBusy = olderPending.has(project.id)}
                      {@const olderLabel = `${lists.older.length} older`}
                      <!-- The row's box (`data-flip="box"`): its older rows
                             open in it, so it takes their room at once and
                             the projects under it slide with its edge
                             (motion/rows), as a session's delegates do. -->
                      <Sidebar.MenuSubItem data-flip="box">
                        <Sidebar.MenuSubButton
                          class="{SUB_ROW} text-muted-foreground"
                          data-branch-item
                        >
                          {#snippet child({
                            props,
                          })}
                            <!-- A disclosure, so a button. Its lead is a
                                   tree mark on the session tiles' axis
                                   (where the rail's arm ends), with the
                                   history glyph as its face and no tile
                                   under it; the row is the switch. Busy from
                                   the press until its rows are drawn: the
                                   glyph gives way to the kit's spinner, as a
                                   pending Button's icon does. -->
                            <button
                              {...props}
                              aria-busy={olderBusy || undefined}
                              aria-expanded={olderVisible}
                              onclick={() => toggleOlder(project.id)}
                              type="button"
                            >
                              <TreeMark open={olderVisible} rowToggles>
                                {#snippet face()}
                                  <!-- The glyph and the spinner stacked in
                                         one cell (the kit's icon swap). Out
                                         of the button's name: `aria-busy`
                                         says it, and a status in here was
                                         read into the name at rest. -->
                                  <span class="older-face icon-swap">
                                    <span data-active={!olderBusy}
                                      ><IconHistory class={SLOT_GLYPH} /></span
                                    >
                                    <span data-active={olderBusy}
                                      ><Spinner
                                        class="size-3"
                                        role="presentation"
                                      /></span
                                    >
                                  </span>
                                {/snippet}
                              </TreeMark>
                              <span class="num">{olderLabel}</span>
                            </button>
                          {/snippet}
                        </Sidebar.MenuSubButton>
                        {#if olderVisible}
                          {@const olderTrees = branches(
                            lists.older,
                            `rail:${project.id}:older`
                          ).slice(0, olderDrawn.get(project.id))}
                          <!-- Older sessions scroll in a box of their own,
                                 six rows at most, so opening them never
                                 pushes the projects below far or the footer.
                                 It opens and folds as every tree in the rail
                                 does (motion/branch), and draws no line: the
                                 rail ends at the row that opens it. reflow
                                 never copies or uncovers what is inside
                                 (`data-flip-anchor`). -->
                          <ul
                            class="older"
                            data-flip-anchor
                            data-keep-scroll={project.id}
                            onintroend={() =>
                              fillOlder(project.id, lists.older.length)}
                            in:branch={LEAD_TREE}
                            out:branch={LEAD_TREE}
                            {@attach scrollEdges}
                          >
                            {#each olderTrees as node (node.row.id)}
                              {@render subRow(node)}
                            {/each}
                          </ul>
                        {/if}
                      </Sidebar.MenuSubItem>
                    {:else if lists.recent.length === 0}
                      <Sidebar.MenuSubItem data-flip>
                        <Sidebar.MenuSubButton
                          class="{SUB_ROW} text-muted-foreground"
                          data-branch-item
                          onclick={() =>
                            newSession({
                              projectId: project.id,
                              machineId: project.machineId,
                              cwd: project.cwd,
                            })}
                        >
                          <span class="{SLOT} row-lead"
                            ><IconPlus class="size-3" /></span
                          >
                          No sessions — start one
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSubItem>
                    {/if}
                  </ul>
                {/if}
              </li>
            {/each}
          </Sidebar.Menu>
        {/if}
      </Sidebar.Group>
    {:else}
      {@render pending(6, LIST_ROW_H)}
    {/if}
    {#if !narrow}
      <!-- Everything else that can be opened, after the projects. -->
      <HomeRecent inset />
    {/if}
  </Sidebar.Content>

  <!-- ────────────────────── footer ──────────────────────── -->

  <Sidebar.Footer {@attach reflow()}>
    <UsageMeter />
    <div class="flex items-center gap-1" data-flip>
      <Sidebar.Menu aria-label="User" class="min-w-0 flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW}>
            <!-- No picture of the reader yet: Caw stands in. -->
            <img
              alt=""
              class="brand-icon avatar"
              height="18"
              src={cawcoIcon}
              width="18"
            >
            <span class="min-w-0 flex-1 truncate text-foreground"
              >bewinxed</span
            >
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <!-- Configure and the theme: the pair of settings in the corner. -->
      <Tip label="Configure">
        {#snippet children(
          tip
        )}
          <Button
            {...tip}
            aria-current={configuring ? "page" : undefined}
            aria-label="Configure"
            class="configure"
            href={configureHref}
            size="icon-sm"
            variant="ghost"
          >
            <IconSettings class="size-4" />
          </Button>
        {/snippet}
      </Tip>
      <ThemeSwitcher />
    </div>
  </Sidebar.Footer>
  <SessionHover within={railEl} />
</div>
<!-- end flex column wrapper -->

<style>
  /* The brand row's icon: the lead column's 18px tile, on the tile's radius.
     Its edge is drawn inside it (a negative offset), so the box stays 18px
     and the icon keeps its shape on the rail in either theme. */
  .brand-icon {
    flex: none;
    inline-size: 18px;
    block-size: 18px;
    border-radius: var(--radius-xs);
    outline: 1px solid var(--image-outline);
    outline-offset: -1px;
  }
  /* The same picture as the reader's placeholder: a round one. */
  .brand-icon.avatar {
    border-radius: var(--radius-pill);
  }
  /* The header's corner actions: icon buttons on the nav row's height. */
  .head-action {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: var(--c-nav-h);
    block-size: var(--c-nav-h);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .head-action :global(svg) {
    inline-size: 18px;
    block-size: 18px;
  }
  .head-action[data-on] {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  @media (hover: hover) and (pointer: fine) {
    .head-action:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  /* A project's older sessions: six sub-rows (28px, 2px apart) at most,
     scrolling in place. The edges fade only while there is more past them. */
  /* The disclosure's face: the history glyph, and the spinner it gives way
     to while its rows are read (the kit's icon swap, at a control's pace). */
  .older-face {
    --icon-swap-dur: var(--dur-control);
  }
  /* The box is off the rail (it scrolls on its own): its rows draw no line,
     and the row that opens it, the project's last, is where the rail ends. */
  .older {
    --fade: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-block-size: calc(6 * 28px + 5 * 2px);
    margin: var(--tree-gap) 0 0;
    padding: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    list-style: none;
  }
  .older[data-more-above] {
    mask-image: linear-gradient(transparent, #000 var(--fade));
  }
  .older[data-more-below] {
    mask-image: linear-gradient(#000 calc(100% - var(--fade)), transparent);
  }
  .older[data-more-above][data-more-below] {
    mask-image: linear-gradient(
      transparent,
      #000 var(--fade),
      #000 calc(100% - var(--fade)),
      transparent
    );
  }
  /* Configure, while a /config page is open: the selected tint, crossing
     over --dur-control like every control's colour. */
  :global(.configure[aria-current="page"]) {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  :global(.configure) {
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
</style>
