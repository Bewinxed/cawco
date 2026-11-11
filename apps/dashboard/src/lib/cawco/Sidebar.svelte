<script lang="ts">
  /**
   * Fleet sidebar, on the shadcn-svelte sidebar primitives (ui/sidebar/*):
   *
   *   • Header: Hide sidebar (a desk), the CawCo icon and wordmark, Start session
   *   • Content: Fleet, then two sections, each a hairline seam above it:
   *     Recent (home/RecentList: every session the person started or wrote
   *     in, grouped by up to three levels) and Projects (every project, one
   *     row each, its running count on its mark the switch that unfolds
   *     those sessions under it, grouped by area and machine from the same
   *     kind of menu)
   *   • Footer: the usage strip, the reader's avatar and the settings
   *
   * A session says what it is doing on its mark (SessionMark: an echo, or a
   * dot on its corner) rather than in a text pill.
   */
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { sidebarWords } from "@cawco/core/words/sidebar";
  import type { Attachment } from "svelte/attachments";
  import cawcoIcon from "#lib/assets/brand/cawco-icon.png";
  import { Button } from "#lib/components/ui/button/index.js";
  import CawLoopSwitcher from "#lib/components/ui/CawLoopSwitcher.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import SoundSwitcher from "#lib/components/ui/SoundSwitcher.svelte";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import ThemeSwitcher from "#lib/components/ui/ThemeSwitcher.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconBox,
    IconFiles,
    IconPlus,
    IconSearch,
    IconSettings,
  } from "#lib/icons.js";
  import { formatAgeShort, formatDistanceToNow } from "#lib/utils/time.js";
  import { page } from "$app/state";
  import { epochOf } from "./board.svelte";
  import { type BoardRow, cawco, type ProjectRow } from "./client.svelte";
  import { LAST_KEY as CONFIG_LAST_KEY, SECTIONS } from "./config/sections";
  import FolderMenu from "./FolderMenu.svelte";
  import { files, filesCount } from "./files/files.svelte";
  import { areaIdOf, areas } from "./home/areas.svelte";
  import GroupMenu from "./home/GroupMenu.svelte";
  import GroupParent from "./home/GroupParent.svelte";
  import {
    grouping,
    inForce,
    PROJECT_OPTIONS,
    type ProjectGroupBy,
    runningPath,
  } from "./home/grouping.svelte";
  import Home from "./home/Home.svelte";
  import {
    clock,
    home,
    instanceTitle,
    isDelegate,
    lastAt,
    machineName,
  } from "./home/home-state.svelte";
  import OlderDelegates from "./home/OlderDelegates.svelte";
  import {
    type Branch,
    branchOf,
    delegatesByTop,
    inFront,
  } from "./home/session-branches";
  import { rowHref } from "./links";
  import { machinesOnline } from "./MachinesButton.svelte";
  import MachinesList from "./MachinesList.svelte";
  import { markHue } from "./mark";
  import { type BranchOptions, branch } from "./motion/branch.svelte";
  import { echoBeat } from "./motion/echo.svelte";
  import { reflow } from "./motion/rows.svelte";
  import { landRegroup, regroup, regroupPrimer } from "./motion/share.svelte";
  import { olderOut } from "./OlderRows.svelte";
  import { type Reading, runningIds } from "./older";
  import { openTrees, type TreeList } from "./open-trees.svelte";
  import PresenceMenu from "./PresenceMenu.svelte";
  import ProjectMark from "./ProjectMark.svelte";
  import { endAtRail } from "./project-end.svelte";
  import { folderOf } from "./projects";
  import RailProjectEnd from "./RailProjectEnd.svelte";
  import { rail } from "./rail.svelte";
  import SessionHover from "./SessionHover.svelte";
  import SessionRow, { ROW_PILL } from "./SessionRow.svelte";
  import { newSession } from "./spawn/new-session.svelte";
  import { stored } from "./storage";
  import TreeLine from "./TreeLine.svelte";
  import { type FlatRow, flatTree, lineAttrs, treeLines } from "./tree-lines";
  import UsageMeter from "./UsageMeter.svelte";
  import { projectTab, tabOfPath } from "./workspace/tabs";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    onsearch,
    onfiles,
    toggleRoom = false,
    narrow,
    sheet = false,
    scroller,
  }: {
    /** Opens Jump, from the phone's Search field (Shell owns the palette). */
    onsearch?: () => void;
    /** Opens Files for the conversation on screen, from the phone's Files row (Shell owns its drawer). */
    onfiles?: () => void;
    /**
     * The desk's: its sidebar toggle stands over the header's leading
     * corner, drawn by the Shell outside the rail (Shell `rail-toggle`), so
     * the brand row is the top bar's height from the rail's top, centred on
     * the bar's centre line as the toggle is, and leads with the toggle's
     * room. The phone's sheet has its own Close and none.
     */
    toggleRoom?: boolean;
    /** The Shell's live narrow answer: a phone opens Configure on its list. */
    narrow: boolean;
    /**
     * The phone's sidebar, a sheet under the drawer's line: its bar holds
     * only the toggle, the tabs and Caw, so Search leads the sheet and the
     * machines have a section of their own in it.
     */
    sheet?: boolean;
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
    } else {
      last = stored("local", CONFIG_LAST_KEY);
    }
    return `/config/${SECTIONS.some((section) => section.slug === last) ? last : "rules"}`;
  });
  const configuring = $derived(path.startsWith("/config"));
  /**
   * Whether the workspace is in front (workspace/tabs.ts `tabOfPath`), read
   * off the URL shown: the workspace moves between its tabs shallowly.
   */
  const onWorkspace = $derived(
    tabOfPath((page.shallow?.url ?? page.url).pathname) !== undefined
  );
  /**
   * Which conversation is in front, for the rows to mark. The workspace
   * store, not the URL: a tab switch writes the address with `pushState`,
   * which moves nothing the page reads, so a rail keyed to the path stayed
   * on the tab the reader had left.
   */
  const activeSession = $derived(
    onWorkspace ? workspace.activeSessionId : null
  );
  /**
   * A project's row, pressed with the workspace in front, opens its tab
   * where it is, as it was left (workspace `openProject`); a press with a
   * key held, from another spoke, or in the phone's sheet (which goes as
   * its link is followed) follows its link.
   */
  function openProjectTab(event: MouseEvent, projectId: string) {
    if (
      sheet ||
      !onWorkspace ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    workspace.openProject(projectId);
  }

  /** The rail itself: its session rows open the session card (SessionHover). */
  let railEl = $state<HTMLElement>();

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
  const SLOT = "inline-flex size-space-5 shrink-0 items-center justify-center";
  /** A line glyph in the slot: 16px, 1px of air. */
  const SLOT_GLYPH = "size-icon-md";

  /* ---- projects ------------------------------------------------------- */

  /** Pinned first, then by name. */
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

  /**
   * A project's running sessions that are their own top, never a delegate
   * (owner: "the working count shouldn't count delegates"), newest started
   * first: its count, on its mark, and the rows that mark unfolds under it.
   */
  const runningIn = $derived.by(() => {
    const running = new Map<string, BoardRow[]>();
    for (const row of cawco.runningInstances) {
      if (row.projectId && !isDelegate(row)) {
        const held = running.get(row.projectId);
        if (held) {
          held.push(row);
        } else {
          running.set(row.projectId, [row]);
        }
      }
    }
    for (const rows of running.values()) {
      rows.sort((a, b) => epochOf(b, "createdAt") - epochOf(a, "createdAt"));
    }
    return running;
  });

  /** Each listed top's delegates, at any depth: read only while a project's sessions are out. */
  const delegatesOf = $derived(
    delegatesByTop(cawco.listedInstances, cawco.listedById)
  );

  /** Projects' unfolded sessions keep their own open delegates (open-trees). */
  const PROJECTS_LIST: TreeList = "rail-projects";
  /** What the older rule reads of the fleet (older.ts). */
  const reading = $derived<Reading>({
    lastAt,
    now: clock.now,
    running: runningIds(),
  });
  /** A session row's age, as Recent says it. */
  const ageOf = (row: BoardRow): string => {
    const at = lastAt(row);
    return at === 0 ? "" : formatAgeShort(at, clock.now);
  };
  const ageHint = (row: BoardRow): string => {
    const at = lastAt(row);
    return at === 0
      ? "No activity recorded"
      : `${sidebarWords.lastActivity} ${formatDistanceToNow(new Date(at))}`;
  };

  /** The machine a project is placed on first: its primary place's. */
  const machineOf = (project: ProjectRow): string =>
    (project.places.find((place) => place.isPrimary) ?? project.places[0])
      ?.machineId ?? "";

  /** A group of Projects: an area or a machine, and what hangs under it. */
  interface ProjectGroup {
    by: ProjectGroupBy;
    groups: ProjectGroup[] | null;
    key: string;
    label: string;
    path: string;
    projects: ProjectRow[];
  }

  /** The machines' order, the fleet's. */
  const machinePlace = (id: string): number => {
    const at = cawco.machines.findIndex((m) => m.machineId === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  /**
   * The projects under `levels`: areas in the person's order (none last),
   * machines in the fleet's, each group's projects in the rail's order.
   */
  function projectGroups(
    list: ProjectRow[],
    levels: ProjectGroupBy[],
    above = "projects"
  ): ProjectGroup[] {
    const [by, ...rest] = levels;
    if (!by) {
      return [];
    }
    const groups = new Map<string, ProjectGroup>();
    for (const project of list) {
      const key =
        by === "area" ? (areaIdOf(project) ?? "") : machineOf(project);
      let group = groups.get(key);
      if (!group) {
        const label =
          by === "area"
            ? (key && areas.nameOf(key)) || sidebarWords.noArea
            : machineName(key);
        group = {
          by,
          key,
          label,
          path: `${above}/${by}:${key}`,
          projects: [],
          groups: null,
        };
        groups.set(key, group);
      }
      group.projects.push(project);
    }
    const out = [...groups.values()].sort((a, b) =>
      by === "area"
        ? areas.placeOf(a.key || null) - areas.placeOf(b.key || null)
        : machinePlace(a.key) - machinePlace(b.key)
    );
    if (rest.length > 0) {
      for (const group of out) {
        group.groups = projectGroups(group.projects, rest, group.path);
      }
    }
    return out;
  }

  const projectLevels = $derived(inForce(grouping.projects));
  const groupedProjects = $derived(
    projectGroups(orderedProjects, projectLevels)
  );

  /** The rail's content: what a regroup moves (`data-regroup-root`). */
  let content = $state<HTMLElement | null>(null);

  /** While Projects' menu is open, its rows are read ahead of a press (motion/share). */
  const primeProjects = regroupPrimer(() => content);

  /** A press in Projects' menu: the projects move to their new places. */
  function pickProjects(at: number, by: ProjectGroupBy): void {
    if (!content) {
      grouping.pickProjects(at, by);
      return;
    }
    regroup(content, () => grouping.pickProjects(at, by));
  }

  /**
   * Projects as one flat tree (tree-lines.ts): the groups and the projects
   * in them, each a row keyed by what it is, so a regroup moves the same
   * rows. Ungrouped, the projects are its roots. A project whose count was
   * pressed has its running sessions under it, each with its delegates
   * folded under it as Recent folds them (a delegate's row, `node`; a
   * session's "N older" row).
   */
  type ProjectNode =
    | { kind: "group"; group: ProjectGroup }
    | { kind: "project"; project: ProjectRow }
    | {
        kind: "session";
        count: number;
        node: Branch | null;
        row: BoardRow;
        under: BoardRow[];
      }
    | { kind: "older"; node: Branch };
  const projectNode = (project: ProjectRow): ProjectNode => ({
    kind: "project",
    project,
  });
  const projectGroupNode = (group: ProjectGroup): ProjectNode => ({
    kind: "group",
    group,
  });
  const branchNode = (node: Branch): ProjectNode => ({
    kind: "session",
    row: node.row,
    count: node.count,
    node,
    under: node.under,
  });
  /** A project's running sessions, as rows under it. */
  const runningNodes = (project: ProjectRow): ProjectNode[] =>
    (runningIn.get(project.id) ?? []).map((row) => {
      const under = delegatesOf.get(row.id) ?? [];
      return {
        kind: "session",
        row,
        count: under.length,
        node: null,
        under,
      };
    });
  /** Whether a row's own rows are out under it. */
  function projectOpen(node: ProjectNode): boolean {
    switch (node.kind) {
      case "group":
        return !grouping.folded(node.group.path);
      case "project":
        return (
          runningIn.has(node.project.id) &&
          !grouping.folded(runningPath(node.project.id))
        );
      case "session":
        return node.count > 0 && openTrees.has(node.row.id, PROJECTS_LIST);
      case "older":
        return olderOut(
          node.node.row.id,
          inFront(node.node.older, activeSession),
          PROJECTS_LIST
        );
      default:
        return node satisfies never;
    }
  }
  const projectKids = (node: ProjectNode): ProjectNode[] => {
    if (node.kind === "older" || !projectOpen(node)) {
      return [];
    }
    if (node.kind === "group") {
      return node.group.groups
        ? node.group.groups.map(projectGroupNode)
        : node.group.projects.map(projectNode);
    }
    if (node.kind === "project") {
      return runningNodes(node.project);
    }
    const own = node.node ?? branchOf(node.row, node.under, reading);
    return [
      ...own.recent.map(branchNode),
      ...(own.older.length > 0 ? [{ kind: "older" as const, node: own }] : []),
    ];
  };
  const projectKey = (node: ProjectNode): string => {
    switch (node.kind) {
      case "group":
        return `group:${node.group.path}`;
      case "project":
        return `project:${node.project.id}`;
      case "session":
        return `session:${node.row.id}`;
      case "older":
        return `older:${node.node.row.id}`;
      default:
        return node satisfies never;
    }
  };
  const projectRows = $derived(
    flatTree(
      projectLevels.length === 0
        ? orderedProjects.map(projectNode)
        : groupedProjects.map(projectGroupNode),
      projectKids,
      projectKey
    )
  );
  /** A box of older delegates' trees: their rows, flat, under the box. */
  const olderProjectRows = (trees: Branch[]): FlatRow<ProjectNode>[] =>
    flatTree(trees.map(branchNode), projectKids, projectKey);
  /** How every row of the tree opens and folds: off its parent's mark (motion/branch). */
  const PROJECT_TREE: BranchOptions = { glyph: "[data-tree-mark]" };

  /**
   * The sessions waiting on you (core `waitingOnYou`), in the attention
   * tone; else the ones running, never their delegates.
   */
  const fleetCount = $derived(
    cawco.waitingCount ||
      cawco.runningInstances.filter((row) => !isDelegate(row)).length
  );
  /** A project row's link in the rail: its end's tray hands the focus back to it. */
  const railLinkId = (projectId: string) => `rail-project-${projectId}`;
</script>

{#snippet pending(rows: number)}
  <!-- Rows where the next groups will stand, while their read is out, at the
       height of the rows that replace them (a list row's). -->
  <Sidebar.Group
    aria-busy="true"
    aria-label="Loading"
    data-flip
    data-flip-skeleton
    pad="rail"
  >
    <div class="flex h-space-8 items-center px-space-3">
      <Skeleton height="x-height" radius="line" type="label" width="label" />
    </div>
    <div class="flex flex-col gap-space-row">
      {#each Array.from({ length: rows }, (_, row) => row) as row (row)}
        <Skeleton class="w-full" height="control-sm" />
      {/each}
    </div>
  </Sidebar.Group>
{/snippet}

<!-- The sidebar primitives (Header, Content, Footer) expect a flex-column
     parent: an explicit wrapper, since the Shell's own `<aside>` doesn't set
     the direction. -->

{#snippet projectRow(project: ProjectRow)}
  {@const runningCount = runningIn.get(project.id)?.length ?? 0}
  {@const href = `/project/${project.id}`}
  {@const here =
    (onWorkspace && workspace.activeTab === projectTab(project.id)) ||
    path.startsWith(`${href}/`)}
  <FolderMenu
    cwd={folderOf(project)}
    onnew={() => newSession({ projectId: project.id })}
    {project}
  >
    <Sidebar.MenuButton isActive={here} row="list">
      {#snippet child({ props })}
        <!-- The row is the link to the project's page. Its mark says how
             many of its sessions run now and is the switch that unfolds
             them under the row, as a session's mark unfolds its delegates;
             its press never reaches the link. Under a finger the switch
             reaches sideways to the name, the row's own gap (`row="list"`,
             a compact row's), as a session row's does. -->
        <a
          {href}
          {...props}
          id={railLinkId(project.id)}
          aria-current={here ? "page" : undefined}
          onclickcapture={(event) => openProjectTab(event, project.id)}
          class="{props.class} mark-line coarse:h-c-btn-h-lg"
          style:--mark-hit-gap="var(--row-compact-gap)"
          data-regroup="regroup:project:{project.id}"
          {@attach landRegroup(() => `regroup:project:${project.id}`)}
        >
          <ProjectMark
            count={runningCount}
            hue={markHue(folderOf(project))}
            name={project.name}
            ontoggle={runningCount > 0
              ? () => grouping.toggle(runningPath(project.id))
              : undefined}
            open={runningCount > 0 && !grouping.folded(runningPath(project.id))}
          />
          <span
            class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
            >{project.name}
            {#if runningCount > 0}
              <span class="sr-only">, {runningCount} running</span>
            {/if}</span
          >
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </FolderMenu>
  <!-- An end asked from this row's menu, under it. -->
  <RailProjectEnd
    at={endAtRail(project.id)}
    opener={() => document.getElementById(railLinkId(project.id))}
    parks
    projectId={project.id}
  />
{/snippet}

<!-- A row of Projects' tree: a group parent, a project, one of its running
     sessions (or a delegate under one) or a session's "N older" row, keyed
     in the one list, its share of the lines its own (TreeLine). -->
{#snippet projectTreeRow(item: FlatRow<ProjectNode>)}
  {@const node = item.node}
  {@const sub = node.kind === "session" || node.kind === "older"}
  <li
    class={["kit-tree-row", sub ? "group/menu-sub-item" : "group/menu-item"]}
    {...lineAttrs(item.line)}
    data-flip="box"
    data-line-open={projectOpen(node) || undefined}
    data-session-row={node.kind === "session" ? node.row.id : undefined}
    data-sidebar={sub ? "menu-sub-item" : "menu-item"}
    data-slot={sub ? "sidebar-menu-sub-item" : "sidebar-menu-item"}
    style:--line-depth={item.line.depth}
    in:branch={PROJECT_TREE}
    out:branch={PROJECT_TREE}
  >
    <TreeLine line={item.line} />
    {#if node.kind === "group"}
      <GroupParent
        by={node.group.by}
        count={node.group.projects.length}
        groupKey={node.group.key}
        label={node.group.label}
        path={node.group.path}
      />
    {:else if node.kind === "project"}
      {@render projectRow(node.project)}
    {:else if node.kind === "session"}
      {@const { row, count } = node}
      <SessionRow
        active={activeSession === row.id}
        compact
        fold={count > 0
          ? {
              count,
              open: projectOpen(node),
              ontoggle: () => openTrees.toggle(row.id, PROJECTS_LIST),
            }
          : null}
        hint={ageHint(row)}
        href={rowHref(row.id)}
        instance={row}
        machineId={row.machineId}
        peek={false}
        stale={home.stale}
        title={instanceTitle(row)}
        trail={ageOf(row)}
      />
    {:else}
      <!-- Its older delegates, in a box of their own under the row. -->
      <OlderDelegates
        active={activeSession}
        flatten={olderProjectRows}
        list={PROJECTS_LIST}
        out={projectOpen(node)}
        own={node.node}
        row={projectTreeRow}
      />
    {/if}
  </li>
{/snippet}

<div
  class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-page text-ink-strong"
  bind:this={railEl}
  {@attach highlight({ rows: ROWS })}
>
  <!-- ────────────────────── header ──────────────────────── -->

  <Sidebar.Header bar={toggleRoom}>
    <!-- At the leading edge on a desk, the sidebar toggle's room; the
         wordmark; and in the header's corner what is started from anywhere:
         a session (⇧⌘N). Jump lives on the tab row (Shell), beside the
         conversations it jumps between. -->
    <div
      data-slot="sidebar-brand-row"
      data-toggled={toggleRoom || undefined}
      class="flex items-center gap-space-1 data-toggled:h-c-top-bar-h"
    >
      {#if toggleRoom}
        <!-- The room the desk's sidebar toggle stands over (Shell
             `rail-toggle`): as wide as its glass, one bar item in its pad. -->
        <span aria-hidden="true" class="flex-none w-c-btn-h"></span>
      {/if}
      <Sidebar.Menu aria-label="Workspace" class="flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton isActive={false} row="nav">
            {#snippet child({ props })}
              <a
                href="/session"
                {...props}
                class="{props.class} mark-line no-underline"
              >
                <!-- The app's own icon (the crow on spark), in the row's
                     lead column every row's mark stands in: the column's 18px
                     tile, on the tile's radius. Its edge is drawn inside it
                     (a negative offset), so the box stays 18px and the icon
                     keeps its shape on the rail in either theme. -->
                <img
                  alt=""
                  class="flex-none size-space-5 rounded-xs outline outline-image-outline -outline-offset-1"
                  height="18"
                  src={cawcoIcon}
                  width="18"
                />
                <!-- The wordmark is the logotype, set as a lockup with the
                     icon in its own box (its face is Nunito, not a label's),
                     a body line tall. -->
                <span
                  class="inline-flex items-center h-(--wordmark-h) font-wordmark text-size-body font-(--weight-wordmark) tracking-wordmark leading-kpi min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
                  data-box
                  style:--wordmark-h={"calc(var(--text-body) * var(--leading-body))"}
                  >Caw&amp;Co</span
                >
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <Tip keys="⇧⌘N" label="Start session">
        {#snippet children(tip)}
          <!-- The header's corner action: an icon button on the nav row's
               height. -->
          <!-- The form hangs from it, and from it too when its opener had
               no trigger of its own (`data-start-session`, NewSessionPopover). -->
          <button
            {...tip}
            aria-label="Start session"
            class="select-none focus-inset touch-hit inline-grid flex-none place-items-center size-c-nav-h border-none border-current rounded-sm bg-transparent text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
            data-start-session
            onclick={(event) => newSession(undefined, event.currentTarget)}
            type="button"
          >
            <IconPlus class="size-space-5" />
          </button>
        {/snippet}
      </Tip>
      {#if sheet}
        <!-- The phone's sheet names itself by this row, so its Close is the
             row's last control (Sheet `titleHidden`), Start session's twin:
             the same box and glyph size, the row's gap between them. -->
        <Sheet.Close />
      {/if}
    </div>
  </Sidebar.Header>

  <!-- ────────────────────── content ──────────────────────── -->

  <!-- Live data comes and goes here all day: a machine re-registering, a
       session starting, a count moving. Every group, row, count and status
       mark is `data-flip`, so it arrives and leaves in place and what it moves
       slides instead of jumping (motion/rows `reflow`). -->
  <Sidebar.Content
    bind:ref={content}
    class="relative"
    data-regroup-root
    pad="rail"
    {@attach reflow()}
    {@attach scroller}
  >
    {#if sheet && onsearch}
      <!-- The phone's search: the Jump palette's field, which opens Jump
           hanging from the bar's glass, standing where the sheet starts; a
           press closes the sheet and opens the palette. -->
      <div class="px-space-2 pb-space-1">
        <button
          data-slot="search"
          aria-haspopup="dialog"
          class="select-none mark-line press-tint focus-inset flex items-center gap-space-2 w-full min-h-c-btn-h-lg px-space-3 border border-border-control rounded-sm bg-surface-raised type-body text-ink-muted text-start cursor-text"
          data-share="jump"
          onclick={() => onsearch()}
          type="button"
        >
          <IconSearch class="flex-none size-icon-md" />
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >Search sessions, projects, machines</span
          >
        </button>
      </div>
    {/if}
    {#if sheet && onfiles && files.session}
      {@const count = filesCount(files.session)}
      <!-- The conversation on screen's Files, where the phone keeps the
           bar's other items: one row under the search, its count on the
           row's badge as Fleet's stands. Its drawer is Shell's. -->
      <Sidebar.Group pad="rail">
        <Sidebar.Menu aria-label="This conversation" gap="tight">
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={false} row="nav">
              {#snippet child({ props })}
                <button
                  {...props}
                  class="select-none {props.class} mark-line"
                  aria-label={count ? `Files, ${count}` : "Files"}
                  data-sidebar-files
                  onclick={() => onfiles()}
                  type="button"
                >
                  <span class={SLOT} data-box
                    ><IconFiles class={SLOT_GLYPH} /></span
                  ><span>Files</span>
                </button>
              {/snippet}
            </Sidebar.MenuButton>
            {#if count}
              <!-- Centred on its nav row, as Fleet's count stands. -->
              <Sidebar.MenuBadge>{count}</Sidebar.MenuBadge>
            {/if}
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Group>
    {/if}
    <!-- On a wide screen the home is the sidebar: what needs you, what is
         working, what finished, and the rest, while the transcripts take the
         screen. On the narrow line the same home leads the sheet, above the
         projects; with no session open the session surface draws its own
         page of it too. -->
    <!-- The app's places, first: one compact block, no heading over it. -->
    <Sidebar.Group pad="rail">
      <!-- The pill's host: a list is a `ul`, which holds no layers of its own. -->
      <div {@attach highlight(PILL)}>
        <Sidebar.Menu aria-label="Places" gap="tight">
          <Sidebar.MenuItem>
            <!-- The board is the place while it is on screen; with a
                 conversation or a project open, its row is the one
                 selection. -->
            <Sidebar.MenuButton
              isActive={onWorkspace && workspace.activeTab === null}
              row="nav"
            >
              {#snippet child({ props })}
                <a href="/session" {...props} class="{props.class} mark-line">
                  <span class={SLOT} data-box
                    ><IconBox class={SLOT_GLYPH} /></span
                  >
                  <span>Fleet</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
            {#if fleetCount}
              <!-- A status count keeps its status pair whatever the row does:
                   the kit's active and hover inks are for a plain count, and
                   on the live fill the active one reads 3.3:1. -->
              <Sidebar.MenuBadge
                data-blocked={cawco.waitingCount > 0 || undefined}
                data-flip="pop box"
                tone="live"
              >
                <MorphText text={String(fleetCount)} />
              </Sidebar.MenuBadge>
            {/if}
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </div>
    </Sidebar.Group>
    <!-- Recent, the sessions: what the home holds in the rail (its status
         line, the starts under way, the one Recent list). -->
    <Home active={activeSession} variant="rail" />

    <!-- Projects stand from the first paint, as the board was read for
         this page (home `ready`). Until it is in hand, rows standing where
         they will be. -->
    {#if home.ready}
      <!-- Projects, the index of every project: one row each, its running
           count on its mark, which unfolds those sessions under it, grouped
           by the same kind of menu as Recent (area first). A seam and room
           above it, as above Recent. -->
      <Sidebar.Group data-flip="box" pad="rail">
        <!-- Its controls end where the rows do, inside the row (the label's
             `end="action"`). The word gives way first (DESIGN.md, The
             Truncate Inside Rule). It travels as Recent above it regroups. -->
        <Sidebar.GroupLabel
          seam="section"
          data-regroup="regroup:heading:projects"
          end="action"
          pad="rail"
          {@attach landRegroup(() => "regroup:heading:projects")}
        >
          <span
            class="min-w-0 flex-auto overflow-hidden text-ellipsis whitespace-nowrap"
            >Projects</span
          >
          <div class="ms-auto flex flex-none items-center gap-space-row">
            <GroupMenu
              label={sidebarWords.groupProjects}
              levels={grouping.projects}
              onopenchange={primeProjects}
              onpick={pickProjects}
              options={PROJECT_OPTIONS}
            />
            <!-- Where a forgotten project waits, from the list it left
                 (Forgotten projects, /project/forgotten). -->
            <Tip label={projectEndWords.forgottenTitle}>
              {#snippet children(tip)}
                <Button
                  {...tip}
                  aria-current={path === "/project/forgotten"
                    ? "page"
                    : undefined}
                  aria-label={projectEndWords.forgottenTitle}
                  href="/project/forgotten"
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconArchive />
                </Button>
              {/snippet}
            </Tip>
            <Tip label="New project">
              {#snippet children(tip)}
                <Button
                  {...tip}
                  aria-label="New project"
                  href="/project/new"
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconPlus />
                </Button>
              {/snippet}
            </Tip>
          </div>
        </Sidebar.GroupLabel>
        {#if orderedProjects.length === 0}
          <p class="px-space-3 text-meta text-ink-muted" data-flip>
            {cawco.machines.length === 0
              ? sidebarWords.noProjectsNoMachines
              : sidebarWords.noProjects}
          </p>
        {:else}
          <div {@attach highlight(PILL)} {@attach echoBeat()}>
            <!-- One flat tree, every row keyed: grouped, a section's room
                 between the groups at the root; ungrouped, the projects
                 a list's two pixels apart. -->
            <ul
              class="kit-tree flex w-full flex-col"
              data-sidebar="menu"
              data-slot="sidebar-menu"
              style:--line-root-gap={projectLevels.length > 0
                ? "var(--space-3)"
                : "var(--space-row)"}
              {@attach treeLines("[data-tree-mark]")}
            >
              {#each projectRows as item (item.key)}
                {@render projectTreeRow(item)}
              {/each}
            </ul>
          </div>
        {/if}
      </Sidebar.Group>
    {:else}
      {@render pending(6)}
    {/if}
    {#if sheet}
      <!-- The machines, where a phone keeps them: each with its status and
           its menu (a long press), then Add machine. -->
      <Sidebar.Group data-flip pad="rail">
        <Sidebar.GroupLabel pad="rail">
          Machines
          <span class="ms-auto num">{machinesOnline()} online</span>
        </Sidebar.GroupLabel>
        <MachinesList rail />
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <!-- ────────────────────── footer ──────────────────────── -->

  <Sidebar.Footer {@attach reflow()}>
    <!-- Limits are read on machines: with none online the strip would only
         repeat the empty fleet (home `limitsShown`). -->
    {#if home.limitsShown}
      <UsageMeter />
    {/if}
    <!-- One row at every rail width: the product holds no name for the
         reader (a single operator, called "you"), so the user chip is its
         avatar alone and says "You" in its tooltip. -->
    <div class="flex items-center gap-space-1" data-flip>
      <Sidebar.Menu aria-label="User" class="w-auto">
        <Sidebar.MenuItem>
          <!-- The reader's avatar, with their presence on its corner and its
               menu: Appear away, and the machines that count. -->
          <PresenceMenu />
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <!-- Configure, the theme and sound: the settings in the corner. -->
      <div
        data-slot="sidebar-settings"
        class="ms-auto flex items-center gap-space-1"
      >
        <Tip label="Configure">
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-current={configuring ? "page" : undefined}
              aria-label="Configure"
              current="selected"
              data-rail-configure
              href={configureHref}
              size="icon-sm"
              variant="ghost"
            >
              <IconSettings class="size-icon-md" />
            </Button>
          {/snippet}
        </Tip>
        <ThemeSwitcher />
        <SoundSwitcher />
        <CawLoopSwitcher />
      </div>
    </div>
  </Sidebar.Footer>
  <SessionHover within={railEl} />
</div>

<!-- end flex column wrapper -->
