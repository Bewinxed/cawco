<script lang="ts">
  /**
   * The sidebar's one Recent list (tsk-323), the rail's and the phone
   * home's: every session the person started or wrote in (recent.svelte.ts),
   * newest first by their own last word, grouped by the levels the reader
   * picks in its menu (grouping.svelte.ts: Day then Project until they
   * pick). Every level is a tree parent with its mark (GroupParent), its
   * rows hung from it by the rail's nesting lines (tree-lines.ts), and
   * folds on its row; Older starts folded.
   *
   * A row is the one session row (SessionRow): its mark says its status (the
   * echo for Working, a dot for Needs you or a failure), never a word on
   * screen; its name is 500 while it needs the reader or holds a reply they
   * have not read, 400 otherwise; its age stands in the rail's column. A
   * delegate never has a row of its own: its session's mark counts them and
   * opens them, as every tree in the app opens (motion/branch). Done is the
   * row's archive (its press, its swipe), offered on a Your turn row and on
   * one that failed: the row closes where it stood and the rows under it
   * slide up (motion/rows `reflow`, the rail's own).
   *
   * The whole tree is one flat keyed list (tree-lines.ts `flatTree`): the
   * group parents, the sessions, the delegates a session has unfolded and
   * the "N older" row under them, each a row keyed by what it is (a group
   * by its path, a session by its id), its depth and its siblings carried
   * to a reader by `aria-level`, `aria-posinset` and `aria-setsize`. A pick
   * in the menu regroups the list behind it (motion/share `regroup`): the
   * same rows are reordered, never rebuilt, and each row's own box moves to
   * its new place; its lines are its own and stand there from the first
   * frame.
   */
  import { sidebarWords } from "@cawco/core/words/sidebar";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { formatAgeShort, formatDistanceToNow } from "#lib/utils/time.js";
  import { type BoardRow, isFailed } from "../client.svelte";
  import { rowHref, sessionTitle } from "../links";
  import { type BranchOptions, branch } from "../motion/branch.svelte";
  import { echoBeat } from "../motion/echo.svelte";
  import { regroup, regroupPrimer } from "../motion/share.svelte";
  import { olderOut } from "../OlderRows.svelte";
  import { type Reading, runningIds } from "../older";
  import { openTrees, type TreeList } from "../open-trees.svelte";
  import SessionRow, { ROW_PILL } from "../SessionRow.svelte";
  import TreeLine from "../TreeLine.svelte";
  import { type FlatRow, flatTree, lineAttrs, treeLines } from "../tree-lines";
  import GroupMenu from "./GroupMenu.svelte";
  import GroupParent from "./GroupParent.svelte";
  import { grouping, inForce, RECENT_OPTIONS } from "./grouping.svelte";
  import {
    archive,
    clock,
    home,
    instanceTitle,
    lastAt,
    projectOfRow,
  } from "./home-state.svelte";
  import OlderDelegates from "./OlderDelegates.svelte";
  import {
    groupEntries,
    type RecentEntry,
    type RecentGroup,
    type RecentStatus,
    recentEntries,
    type SessionEntry,
    type StoredEntry,
  } from "./recent.svelte";
  import { type Branch, branchOf, inFront } from "./session-branches";

  let {
    variant,
    active,
  }: {
    /** The rail's, or the phone home's: each keeps its own unfolded trees. */
    variant: "rail" | "page";
    /** The conversation in front: its row takes the selection pill. */
    active: string | null;
  } = $props();

  const list: TreeList = $derived(
    variant === "rail" ? "rail-recent" : "home-recent"
  );
  const levels = $derived(inForce(grouping.recent));
  const entries = $derived(recentEntries());
  const groups = $derived(groupEntries(entries, levels));
  /** No project above the rows: each row names its own under its title. */
  const tall = $derived(!levels.includes("project"));
  const stale = $derived(home.stale);

  /** The section, for the root a regroup moves (`data-regroup-root`). */
  let section = $state<HTMLElement | null>(null);

  /** The root a regroup moves: the rail's content, or the section. */
  const regroupRoot = (): HTMLElement | null =>
    section?.closest<HTMLElement>("[data-regroup-root]") ?? section;
  /** While the menu is open, the rows are read ahead of a press (motion/share). */
  const prime = regroupPrimer(regroupRoot);

  /** A press in the menu: the list regroups, its rows moving to their new places. */
  function pick(at: number, by: (typeof RECENT_OPTIONS)[number]): void {
    const root = regroupRoot();
    if (!root) {
      grouping.pickRecent(at, by);
      return;
    }
    regroup(root, () => grouping.pickRecent(at, by));
  }

  /** The status word a row is read out with: never drawn, its mark says it. */
  const WORD: Partial<Record<RecentStatus, string>> = {
    working: "Working",
    yours: sidebarWords.yourTurn,
  };

  /** A row's age: when it last moved (a stored transcript, when its file last changed). */
  const ageAt = (at: number): string =>
    at === 0 ? "" : formatAgeShort(at, clock.now);
  const hintAt = (at: number): string =>
    at === 0
      ? "No activity recorded"
      : `${sidebarWords.lastActivity} ${formatDistanceToNow(new Date(at))}`;
  const ageOf = (row: BoardRow): string => ageAt(lastAt(row));
  const ageHint = (row: BoardRow): string => hintAt(lastAt(row));

  /** How many sessions a group holds, at every level under it. */
  const countIn = (group: RecentGroup): number => group.entries.length;

  /* ── A session's delegates, as every tree in the app hangs them ────── */

  /** What the older rule reads of the fleet. */
  const reading = $derived<Reading>({
    lastAt,
    now: clock.now,
    running: runningIds(),
  });

  /* ── The list as one flat tree ─────────────────────────────────────── */

  /**
   * A row of the list: a group parent, a session (one of the list's, or a
   * delegate under one, `node`), a session's "N older" row, or a transcript
   * stored on a machine.
   */
  type Node =
    | { kind: "group"; group: RecentGroup }
    | {
        kind: "session";
        count: number;
        entry: SessionEntry | null;
        node: Branch | null;
        row: BoardRow;
      }
    | { kind: "older"; node: Branch }
    | { kind: "stored"; entry: StoredEntry };

  const groupNode = (group: RecentGroup): Node => ({ kind: "group", group });
  const entryNode = (entry: RecentEntry): Node =>
    entry.kind === "stored"
      ? { kind: "stored", entry }
      : {
          kind: "session",
          row: entry.row,
          count: entry.under.length,
          entry,
          node: null,
        };
  const branchNode = (node: Branch): Node => ({
    kind: "session",
    row: node.row,
    count: node.count,
    entry: null,
    node,
  });

  /** Whether a row's own rows are out under it. */
  function isOpen(node: Node): boolean {
    if (node.kind === "stored") {
      return false;
    }
    if (node.kind === "group") {
      return !grouping.folded(node.group.path);
    }
    if (node.kind === "session") {
      return node.count > 0 && openTrees.has(node.row.id, list);
    }
    return olderOut(node.node.row.id, inFront(node.node.older, active), list);
  }

  /** What hangs under a row while it is open: the next level, or a session's delegates. */
  function kidsOf(node: Node): Node[] {
    if (node.kind === "older" || node.kind === "stored" || !isOpen(node)) {
      return [];
    }
    if (node.kind === "group") {
      const { group } = node;
      return group.groups
        ? group.groups.map(groupNode)
        : group.entries.map(entryNode);
    }
    const entry = node.entry as SessionEntry;
    const own = node.node ?? branchOf(entry.row, entry.under, reading);
    return [
      ...own.recent.map(branchNode),
      ...(own.older.length > 0 ? [{ kind: "older" as const, node: own }] : []),
    ];
  }

  /** A row's key: a group by its path, a session by its id, wherever it moves. */
  const keyOf = (node: Node): string => {
    switch (node.kind) {
      case "group":
        return `group:${node.group.path}`;
      case "session":
        return `session:${node.row.id}`;
      case "stored":
        return `stored:${node.entry.key}`;
      case "older":
        return `older:${node.node.row.id}`;
      default:
        return node satisfies never;
    }
  };

  const rows = $derived(
    flatTree(
      levels.length === 0 ? entries.map(entryNode) : groups.map(groupNode),
      kidsOf,
      keyOf
    )
  );
  /** A box of older delegates' trees: their rows, flat, under the box. */
  const olderRows = (trees: Branch[]): FlatRow<Node>[] =>
    flatTree(trees.map(branchNode), kidsOf, keyOf);

  /** How every row opens and folds: off its mark (motion/branch). */
  const TREE: BranchOptions = { glyph: "[data-tree-mark]" };
  /** The glyph each row's lines are placed by. */
  const GLYPH = "[data-tree-mark]";
</script>

<!-- A row of the tree, keyed in the one list (`rows`, or an "N older"
     box's own). The row's own box moves on a regroup (`regroup`), never
     this item: each row flies on its own, and the item and its lines stand
     at the new layout from the first frame. -->
{#snippet treeRow(item: FlatRow<Node>)}
  {@const node = item.node}
  <li
    class="kit-tree-row group/menu-sub-item"
    {...lineAttrs(item.line)}
    data-flip="box"
    data-line-open={isOpen(node) || undefined}
    data-recent-group={node.kind === "group" ? node.group.path : undefined}
    data-session-row={node.kind === "session" ? node.row.id : undefined}
    data-stored-row={node.kind === "stored" ? node.entry.key : undefined}
    data-sidebar="menu-sub-item"
    data-slot="sidebar-menu-sub-item"
    style:--line-depth={item.line.depth}
    in:branch={TREE}
    out:branch={TREE}
  >
    <TreeLine line={item.line} />
    {#if node.kind === "group"}
      {@const group = node.group}
      <GroupParent
        by={group.by}
        count={countIn(group)}
        endAt="{list}:{group.path}"
        groupKey={group.key}
        label={group.label}
        path={group.path}
      />
    {:else if node.kind === "session"}
      {@const { row, count, entry } = node}
      <SessionRow
        active={active === row.id}
        compact={entry === null || !tall}
        fold={count > 0
          ? {
              count,
              open: isOpen(node),
              ontoggle: () => openTrees.toggle(row.id, list),
            }
          : null}
        hint={ageHint(row)}
        href={rowHref(row.id)}
        instance={row}
        line={entry && tall ? projectOfRow(row) : ""}
        machineId={row.machineId}
        mark={entry?.mark}
        onarchive={entry &&
        (entry.status === "yours" || isFailed(row)) &&
        home.archivable(row)
          ? () => archive(home.treeOf(row.id))
          : undefined}
        peek={false}
        quiet={!(entry?.status === "needs" || entry?.unread)}
        regroup="regroup:session:{row.id}"
        {stale}
        title={instanceTitle(row)}
        trail={ageOf(row)}
        word={entry ? WORD[entry.status] : undefined}
      />
    {:else if node.kind === "stored"}
      <!-- A transcript stored on its machine that no session wraps: read
           by its own key, Your turn, never unread, and no Done (the hub
           keeps nothing to archive it by). -->
      {@const { info, machineId, project } = node.entry}
      <SessionRow
        active={active !== null && active === info.sessionId}
        compact={!tall}
        hint={hintAt(info.lastModified)}
        href={rowHref(info.sessionId)}
        {info}
        line={tall ? project.name : ""}
        {machineId}
        mark={node.entry.mark}
        peek={false}
        quiet
        regroup="regroup:stored:{node.entry.key}"
        {stale}
        title={sessionTitle(info)}
        trail={ageAt(info.lastModified)}
        word={WORD[node.entry.status]}
      />
    {:else}
      <!-- Its older delegates, in a box of their own under the row. -->
      <OlderDelegates
        {active}
        flatten={olderRows}
        {list}
        out={isOpen(node)}
        own={node.node}
        row={treeRow}
      />
    {/if}
  </li>
{/snippet}

<!-- A section of the rail: a hairline seam and room above it, its name in
     strong ink, its one control (the groupings) at its end. -->
<Sidebar.Group
  bind:ref={section}
  aria-label={sidebarWords.recent}
  data-flip="box"
  data-slot="recent"
  pad="rail"
>
  <Sidebar.GroupLabel seam="section" end="action" pad="rail">
    <span
      class="min-w-0 flex-auto overflow-hidden text-ellipsis whitespace-nowrap"
      >{sidebarWords.recent}</span
    >
    <GroupMenu
      label={sidebarWords.groupSessions}
      levels={grouping.recent}
      onopenchange={prime}
      onpick={pick}
      options={RECENT_OPTIONS}
    />
  </Sidebar.GroupLabel>
  {#if !home.ready}
    <!-- Rows where the list will stand while the first read is out. -->
    <div aria-busy="true" class="flex flex-col gap-(--tree-gap)" role="status">
      {#each [0, 1, 2] as row (row)}
        <Skeleton class="w-full" height="control-sm" />
      {/each}
    </div>
  {:else if entries.length === 0}
    <p class="m-0 px-space-3 py-space-2 type-meta text-ink-muted" data-flip>
      {sidebarWords.recentNone}
    </p>
  {:else}
    <!-- The rail's working rows echo in turn, top to bottom (motion/echo);
         the open conversation's row takes the list's pill (highlight). -->
    <div {@attach highlight(ROW_PILL)} {@attach echoBeat()}>
      <!-- One flat tree, every row keyed (`rows`); between the groups at
           the root, a section's room. -->
      <ul
        class="kit-tree flex flex-col"
        style:--line-root-gap={levels.length > 0 ? "var(--space-3)" : undefined}
        {@attach treeLines(GLYPH)}
      >
        {#each rows as item (item.key)}
          {@render treeRow(item)}
        {/each}
      </ul>
    </div>
  {/if}
</Sidebar.Group>
