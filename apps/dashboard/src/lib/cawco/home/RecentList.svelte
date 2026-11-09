<script lang="ts">
  /**
   * The sidebar's one Recent list (tsk-323), the rail's and the phone
   * home's: every session the person started or wrote in (recent.svelte.ts),
   * newest first by their own last word, grouped by the levels the reader
   * picks in its menu (grouping.svelte.ts: Day then Project until they
   * pick). Every level is a tree parent with its mark (GroupParent), its
   * rows hung from it by the rail's nesting lines (app.css .kit-nest), and
   * folds on its row; Older starts folded.
   *
   * A row is the one session row (SessionRow): its mark says its status (the
   * echo for Working, a dot for Needs you or a failure), never a word on
   * screen; its name is 500 while it needs the reader or holds a reply they
   * have not read, 400 otherwise; its age stands in the rail's column. A
   * delegate never has a row of its own: its session's mark counts them and
   * opens them, as every tree in the app opens (motion/branch). Done is the
   * row's archive (its press, its swipe): the row closes where it stood and
   * the rows under it slide up (motion/rows `reflow`, the rail's own).
   *
   * A pick in the menu regroups the list behind it (motion/share
   * `regroup`): every row, group parent and heading moves to its new place,
   * never closing and opening again; the nesting lines read their place
   * again once the rows have landed (motion/branch `nestsLanded`).
   */
  import { sidebarWords } from "@cawco/core/words/sidebar";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { formatAgeShort, formatDistanceToNow } from "#lib/utils/time.js";
  import type { BoardRow } from "../client.svelte";
  import { rowHref } from "../links";
  import { nestsLanded } from "../motion/branch.svelte";
  import { echoBeat } from "../motion/echo.svelte";
  import { regroup } from "../motion/share.svelte";
  import OlderRows, { olderOut } from "../OlderRows.svelte";
  import {
    DELEGATE_WINDOW,
    failedIn,
    listedOf,
    type Reading,
    runningIds,
  } from "../older";
  import { openTrees, type TreeList } from "../open-trees.svelte";
  import SessionRow, { ROW_PILL } from "../SessionRow.svelte";
  import { tree } from "../tree";
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
  import { nestList } from "./NestList.svelte";
  import {
    groupEntries,
    type RecentEntry,
    type RecentGroup,
    type RecentStatus,
    recentEntries,
  } from "./recent.svelte";

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
  const stale = $derived(!home.live);

  /** The section, for the root a regroup moves (`data-regroup-root`). */
  let section = $state<HTMLElement | null>(null);

  /** A press in the menu: the list regroups, its rows moving to their new places. */
  function pick(at: number, by: (typeof RECENT_OPTIONS)[number]): void {
    const root =
      section?.closest<HTMLElement>("[data-regroup-root]") ?? section;
    if (!root) {
      grouping.pickRecent(at, by);
      return;
    }
    regroup(
      root,
      () => grouping.pickRecent(at, by),
      () => nestsLanded(root)
    );
  }

  /** The status word a row is read out with: never drawn, its mark says it. */
  const WORD: Partial<Record<RecentStatus, string>> = {
    working: "Working",
    yours: sidebarWords.yourTurn,
  };

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

  /** How many sessions a group holds, at every level under it. */
  const countIn = (group: RecentGroup): number => group.entries.length;

  /* ── A session's delegates, as every tree in the app hangs them ────── */

  /** A session and the sessions it started (tree.ts), split by older.ts's rule. */
  interface Branch {
    children: Branch[];
    count: number;
    older: Branch[];
    recent: Branch[];
    row: BoardRow;
    under: BoardRow[];
  }

  /** What the older rule reads of the fleet. */
  const reading = $derived<Reading>({
    lastAt,
    now: clock.now,
    running: runningIds(),
  });

  /** The session's own branch, its delegates under it newest first. */
  function branchOf(entry: RecentEntry): Branch {
    const rows = [entry.row, ...entry.under];
    const lines = tree(rows, {
      order: (siblings) => [...siblings].sort((a, b) => lastAt(b) - lastAt(a)),
    });
    const byId = new Map<string, Branch>();
    const roots: Branch[] = [];
    for (const line of lines) {
      const node: Branch = {
        row: line.row,
        children: [],
        count: line.descendants.length,
        older: [],
        recent: [],
        under: line.descendants,
      };
      byId.set(line.row.id, node);
      const parent = line.parent ? byId.get(line.parent) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    for (const node of byId.values()) {
      if (node.children.length === 0) {
        continue;
      }
      const listed = listedOf(
        node.children.map((child) => child.row),
        (row) => byId.get(row.id)?.under ?? [],
        reading,
        DELEGATE_WINDOW
      );
      for (const child of node.children) {
        (listed.has(child.row.id) ? node.recent : node.older).push(child);
      }
    }
    return byId.get(entry.row.id) ?? (roots[0] as Branch);
  }

  const inFront = (trees: Branch[]): boolean =>
    active !== null &&
    trees.some(
      (node) =>
        node.row.id === active || node.under.some((row) => row.id === active)
    );
  const rowsIn = (trees: Branch[]): number =>
    trees.reduce((rows, node) => rows + 1 + node.count, 0);
</script>

{#snippet delegates(node: Branch)}
  <!-- Its delegates, on a rail of their own that grows from its mark. -->
  {#snippet rows()}
    {#each node.recent as child (child.row.id)}
      {@render item(child.row, child.count, null, child)}
    {/each}
    {#if node.older.length > 0}
      <OlderRows
        count={rowsIn(node.older)}
        failed={failedIn(
          node.older.flatMap((held) => [held.row, ...held.under])
        )}
        front={inFront(node.older)}
        id={node.row.id}
        keyOf={(held) => held.row.id}
        {list}
        trees={olderOut(node.row.id, inFront(node.older), list)
          ? node.older
          : []}
      >
        {#snippet tree(held)}
          {@render item(held.row, held.count, null, held)}
        {/snippet}
      </OlderRows>
    {/if}
  {/snippet}
  {@render nestList(rows)}
{/snippet}

<!-- A session of the list (`entry`), or a delegate under one (`node`):
     the one session row. Its own box moves on a regroup (`regroup`), never
     this item: each row flies on its own, and the item and its nesting
     lines stand at the new layout from the first frame. -->
{#snippet item(
  row: BoardRow,
  count: number,
  entry: RecentEntry | null,
  node: Branch | null
)}
  {@const unfolded = count > 0 && openTrees.has(row.id, list)}
  <li
    class="group/menu-sub-item relative"
    data-flip="box"
    data-session-row={row.id}
    data-sidebar="menu-sub-item"
    data-slot="sidebar-menu-sub-item"
  >
    <SessionRow
      active={active === row.id}
      compact={entry === null || !tall}
      fold={count > 0
        ? {
            count,
            open: unfolded,
            ontoggle: () => openTrees.toggle(row.id, list),
          }
        : null}
      hint={ageHint(row)}
      href={rowHref(row.id)}
      instance={row}
      line={entry && tall ? projectOfRow(row) : ""}
      machineId={row.machineId}
      mark={entry?.mark}
      onarchive={entry?.status === "yours" && home.archivable(row)
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
    {#if unfolded}
      {@render delegates(node ?? branchOf(entry as RecentEntry))}
    {/if}
  </li>
{/snippet}

{#snippet session(entry: RecentEntry)}
  {@render item(entry.row, entry.under.length, entry, null)}
{/snippet}

{#snippet level(nodes: RecentGroup[])}
  {#each nodes as group (group.path)}
    {@const open = !grouping.folded(group.path)}
    <li class="relative" data-recent-group={group.path}>
      <GroupParent
        by={group.by}
        count={countIn(group)}
        groupKey={group.key}
        label={group.label}
        path={group.path}
      />
      {#if open}
        <!-- What it holds hangs from its mark, one tree step in. -->
        {#snippet held()}
          {#if group.groups}
            {@render level(group.groups)}
          {:else}
            {#each group.entries as entry (entry.row.id)}
              {@render session(entry)}
            {/each}
          {/if}
        {/snippet}
        {@render nestList(held)}
      {/if}
    </li>
  {/each}
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
      <ul
        class="m-0 flex min-w-0 list-none flex-col p-0 data-grouped:gap-space-3 not-data-grouped:gap-(--tree-gap)"
        data-grouped={levels.length > 0 || undefined}
      >
        {#if levels.length === 0}
          {#each entries as entry (entry.row.id)}
            {@render session(entry)}
          {/each}
        {:else}
          {@render level(groups)}
        {/if}
      </ul>
    </div>
  {/if}
</Sidebar.Group>
