<script lang="ts">
  /**
   * Working and Finished, as one switch over one list: the sidebar's and the
   * phone home's, reading one remembered choice (work-tab). The header is the
   * session tabs' own folder tabs (ui/fluid-tabs, hosted the way PaneTabs
   * hosts them in a bar: no shelf, the chosen sheet the only mark), each a
   * label and a count washed in its status ink.
   *
   * The rows under a machine's header change in a relay (motion/list-swap):
   * the old lines leave top down, and each new line arrives the moment the
   * line in its place has gone, so no two are ever drawn in one place.
   * Working → Finished sends the old out to the left and brings the new in
   * from the right; back, the reverse.
   *
   * The skeleton is stable. Machines keep one order whichever tab is shown
   * (the fleet's, `byMachine`), and while the rows change every machine of
   * either tab is drawn. A machine in both keeps its header, the same node,
   * which only ever glides; a machine in one comes or goes with its rows,
   * its header the first line of its group. Each group's height is driven
   * here, not measured after the fact: a group that grows opens at once, a
   * group that shrinks holds its height until its last old line has gone and
   * then closes, a group that leaves closes to nothing. What is below glides
   * with the layout. The seams between groups never take room, so a group
   * coming or going never moves one.
   *
   * Every tree starts folded to its parent's row (tree.ts, open-trees): a
   * count at the row's trailing edge, opened one level at a time by the
   * count or →, and folded again by the count, the parent's rail or ←. A
   * parent's rows hang under it in a list of their own on its nesting rail,
   * opening and folding as every tree in the app does (motion/branch). Each
   * machine lists its first MORE_AT trees and its own "N
   * more", so every machine with rows keeps its header and its Archive all;
   * opening the rest (or closing them) is the same relay, the rows arriving
   * or leaving in place. A finished row, or a whole tree, can be archived
   * without opening it, and a machine's header archives all it finished.
   * With nothing changing, the list's own `reflow` carries live changes: a
   * row arriving, a held re-sort.
   *
   * A tab with nothing in it shows nothing; with nothing in either, there is
   * no switch at all. The delegates button lists work other sessions started,
   * each under the session that started it; a parent the tab does not list
   * stands in as a quiet context line, not counted and taking no room.
   */
  import { flushSync, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { page } from "$app/state";
  import { TabItem, Tabs, TabsList } from "$lib/components/ui/fluid-tabs";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import { IconArchive } from "$lib/icons";
  import StructureOn from "~icons/solar/structure-bold";
  import Structure from "~icons/solar/structure-bold-duotone";
  import { cawco, type InstanceRow, isFailed } from "../client.svelte";
  import { conversationHref } from "../links";
  import {
    type BranchOptions,
    branch,
    nestFrom,
  } from "../motion/branch.svelte";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { IN_MS, ListSwap } from "../motion/list-swap.svelte";
  import {
    boxHeights,
    driveHeights,
    onScreen,
    waitForBoxes,
  } from "../motion/relay-boxes";
  import { reflow, reflowsFrom, reread } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { openTrees } from "../open-trees.svelte";
  import { rail } from "../rail.svelte";
  import { collapse, rooted, type TreeLine, tree } from "../tree";
  import { workspace } from "../workspace/workspace.svelte";
  import HomeRow, { ROW_PILL } from "./HomeRow.svelte";
  import {
    archive,
    byMachine,
    clock,
    home,
    instanceTitle,
    lastAt,
    type MachineGroup,
    machineName,
    projectOf,
    span,
  } from "./home.svelte";
  import { type Arrival, planRelay, type RelayLine } from "./relay-plan";
  import { type WorkTab, workTab } from "./work-tab.svelte";

  let { stale }: { stale: boolean } = $props();

  const current = $derived(
    page.url.pathname.startsWith("/session") ? workspace.activeSessionId : null
  );

  const TABS = [
    { id: "working", label: "Working" },
    { id: "finished", label: "Finished" },
  ] as const;
  /** Rows a tab lists before "N more". */
  const MORE_AT = 8;
  /** How a parent's rows open and fold (motion/branch): off each row's mark. */
  const TREE: BranchOptions = { glyph: ".session-mark" };
  /** The boxes whose heights a change drives: each group, its "N more" line in it. */
  const BOXES = ":scope > .group";

  /** Every session a tab could list, delegates included. */
  const allOf = (tab: WorkTab): InstanceRow[] =>
    tab === "working" ? home.working : home.finished;
  /**
   * A tab's own rows. Every delegate under a listed parent, folded into
   * its parent's count (tree.ts `rooted`); one whose parent the tab does
   * not list only when the Delegates button is on: work another session
   * started is listed on its own on request. A failed one is
   * listed whatever the button says, so a failure is never missed; a
   * blocked one is never in a tab, it is a Needs-you card above them.
   */
  const rowsOf = (tab: WorkTab): InstanceRow[] => {
    const all = allOf(tab);
    if (rail.delegates) {
      return all;
    }
    // A delegate under a listed parent stays, folded into its parent's
    // count; only one whose parent this tab does not list waits for the
    // switch.
    const kept = new Set(rooted(all).map((row) => row.id));
    return all.filter((row) => kept.has(row.id) || isFailed(row));
  };
  /** A session the tab does not list, to stand in for a delegate's parent. */
  const known = (id: string): InstanceRow | undefined =>
    cawco.instanceIndex.byId.get(id);
  /**
   * Each tab as its tree (tree.ts): every session followed by its
   * delegates, and each ancestor the tab does not list drawn as a context
   * line in its delegates' place, so none stands alone. Newest on top: the
   * rows come newest first, and Finished stands a tree at its latest member,
   * Working at its earliest (so two agents trading turns never swap).
   */
  const trees = $derived({
    working: tree(rowsOf("working"), { anchor: "last", context: known }),
    finished: tree(rowsOf("finished"), { anchor: "first", context: known }),
  });
  /** Each tab as the reader sees it: every tree folded until opened. */
  const folded = $derived({
    working: collapse(trees.working, (id) => openTrees.has(id, "home")),
    finished: collapse(trees.finished, (id) => openTrees.has(id, "home")),
  });
  /** Every row's place in its tab's tree: depth, last sibling, rails through it. */
  const shapes = $derived({
    working: new Map(trees.working.map((line) => [line.row.id, line])),
    finished: new Map(trees.finished.map((line) => [line.row.id, line])),
  });
  const shapeOf = (tab: WorkTab, id: string) => shapes[tab].get(id);
  /** The rows of `rows` that hang directly under `parent` (null: the tops). */
  const under = (
    tab: WorkTab,
    rows: InstanceRow[],
    parent: string | null
  ): InstanceRow[] =>
    rows.filter((row) => (shapeOf(tab, row.id)?.parent ?? null) === parent);

  /** A parent's folded rows, for its row's count; null otherwise. */
  function foldOf(tab: WorkTab, id: string) {
    const line = shapeOf(tab, id);
    if (!line?.descendants.length) {
      return null;
    }
    return {
      count: line.descendants.length,
      failed: line.descendants.filter(isFailed).length,
      open: openTrees.has(id, "home"),
      ontoggle: () => openTrees.toggle(id, "home"),
    };
  }
  /**
   * Takes a finished row off the list, and with a parent its whole tree,
   * the rows the Delegates switch hides too. Offered only on a row
   * `home.archivable` allows: nothing in the tree is still doing anything.
   */
  function archiveTree(id: string): void {
    archive(home.treeOf(id));
  }
  /**
   * Every finished row a machine lists, folded or not, that may be archived:
   * its "Archive all", shown only when it has one. A row still doing
   * something, or with something under it that is, stays.
   */
  function finishedOn(machineId: string): string[] {
    const ids: string[] = [];
    let top = "";
    for (const line of trees.finished) {
      if (line.depth === 0) {
        top = line.row.machineId;
      }
      if (top === machineId && !line.context && home.archivable(line.row)) {
        ids.push(line.row.id);
      }
    }
    return ids;
  }

  type Group = MachineGroup<InstanceRow>;
  /** A line that is leaving: a machine's header, or one of its rows. */
  interface Line extends RelayLine<InstanceRow> {
    tab: WorkTab;
  }
  /** One change of the rows in flight: what leaves, what arrives, when. */
  interface Plan {
    /** Each arriving line's place in the cascade, and the earliest it may start. */
    enter: Map<string, Arrival>;
    /** Machines whose old rows leave in place of new ones (a layer over them). */
    layered: Set<string>;
    /** Each leaving line's place in the cascade. */
    leave: Map<string, number>;
    /** Each machine's "N more" words before the change, while they fade. */
    more: Map<string, string>;
    /** The groups drawn before the change, as they were drawn. */
    old: Group[];
    /** The tab the leaving rows came from. */
    tab: WorkTab;
  }

  /** The machines' order, the one every list keeps (`byMachine`). */
  const place = (id: string): number => {
    const at = cawco.machines.findIndex((m) => m.machineId === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  /**
   * A tab's rows by machine, each session followed by its delegates (tree.ts)
   * under the machine its top-level session runs on, so a delegate on
   * another machine still hangs under the session that started it.
   */
  function grouped(tab: WorkTab): Group[] {
    const lines = folded[tab];
    const tops = byMachine(
      lines.filter((line) => line.depth === 0).map((line) => line.row)
    );
    const at = new Map(
      tops.map((group) => [
        group.machineId,
        { ...group, rows: [] as InstanceRow[] },
      ])
    );
    let top = "";
    for (const line of lines) {
      if (line.depth === 0) {
        top = line.row.machineId;
      }
      at.get(top)?.rows.push(line.row);
    }
    return [...at.values()];
  }

  /**
   * A machine's group as listed: all of it, or its first MORE_AT trees, each
   * with whatever of it is open. A tree is one line until it is opened, so
   * the count is of top-level lines. The cap is each machine's own: every
   * machine with rows keeps its group, its header and its Archive all,
   * however many trees the machines above it list.
   */
  function capped(
    tab: WorkTab,
    group: Group,
    whole: ReadonlySet<string>
  ): Group {
    if (whole.has(group.machineId)) {
      return group;
    }
    let room = MORE_AT;
    const rows: InstanceRow[] = [];
    for (const row of group.rows) {
      if (shapeOf(tab, row.id)?.depth === 0) {
        if (room === 0) {
          break;
        }
        room -= 1;
      }
      rows.push(row);
    }
    return { ...group, rows };
  }

  /** A tab's groups as listed, `whole` naming the machines shown in full. */
  const listed = (tab: WorkTab, whole: ReadonlySet<string>): Group[] =>
    grouped(tab).map((group) => capped(tab, group, whole));

  /** A machine's trees past its first MORE_AT. */
  const beyondCap = (tab: WorkTab, group: Group): TreeLine<InstanceRow>[] =>
    (
      group.rows
        .map((row) => shapeOf(tab, row.id))
        .filter((line) => line?.depth === 0) as TreeLine<InstanceRow>[]
    ).slice(MORE_AT);

  /** A group's last line: its words, and the failures it keeps folded away. */
  interface More {
    failed: number;
    words: string;
  }
  /**
   * Each machine's line under its rows: "Show N more", with the failures in
   * those trees beside it, or "Show fewer"; none for a machine within the cap.
   */
  function moreOf(tab: WorkTab, whole: ReadonlySet<string>): Map<string, More> {
    const out = new Map<string, More>();
    for (const group of grouped(tab)) {
      const hidden = beyondCap(tab, group);
      if (hidden.length === 0) {
        continue;
      }
      const all = whole.has(group.machineId);
      out.set(group.machineId, {
        words: all ? "Show fewer" : `Show ${hidden.length} more`,
        failed: all
          ? 0
          : hidden
              .flatMap((line) =>
                line.context
                  ? line.descendants
                  : [line.row, ...line.descendants]
              )
              .filter(isFailed).length,
      });
    }
    return out;
  }

  /** The tab whose rows are drawn; it follows the choice in the click. */
  let shown = $state<WorkTab>(untrack(() => workTab.current));
  const groups = $derived(listed(shown, workTab.shownWhole(shown)));
  const more = $derived(moreOf(shown, workTab.shownWhole(shown)));
  /** The key of a machine's "N more" line. */
  const moreKey = (machineId: string): string => `more:${machineId}`;
  /** Whether anything listed as finished failed: its numeral says so. */
  const finishedFailed = $derived(rowsOf("finished").some(isFailed));

  let plan = $state.raw<Plan | null>(null);
  const swap = new ListSwap<Line>();
  let listEl = $state<HTMLElement>();
  let heights: Animation[] = [];
  let settle: ReturnType<typeof setTimeout> | undefined;

  // Another home (the phone's, the rail's) chose: follow, without a relay.
  $effect.pre(() => {
    const chosen = workTab.current;
    if (chosen !== untrack(() => shown) && !untrack(() => plan)) {
      shown = chosen;
    }
  });

  /** What is drawn: every machine either side of a change, in one order. */
  const drawn = $derived.by(() => {
    const live = new Map(groups.map((g) => [g.machineId, g]));
    const old = new Map((plan?.old ?? []).map((g) => [g.machineId, g]));
    const ids = [...new Set([...old.keys(), ...live.keys()])].sort(
      (a, b) => place(a) - place(b)
    );
    return ids.map((id) => {
      const fresh = live.get(id);
      const was = old.get(id);
      let kind: "stay" | "new" | "gone" = "stay";
      if (plan && !was) {
        kind = "new";
      } else if (!fresh) {
        kind = "gone";
      }
      return {
        group: (fresh ?? was) as Group,
        rows: fresh?.rows ?? [],
        gone: swap.leaving.filter((line) => line.machineId === id),
        kind,
      };
    });
  });

  /**
   * Changes what the list shows, as one relay: `apply` changes the state
   * (the tab, which machines show in full), and every line, header and
   * height moves from what is drawn this frame to what that state draws.
   */
  function relay(
    dir: number,
    next: WorkTab,
    whole: ReadonlySet<string>,
    apply: () => void
  ) {
    const list = listEl;
    const before = list ? boxHeights(list, BOXES) : new Map<string, number>();
    // Mid-change, only what is on screen this frame is drawn: a line not
    // yet arrived, or still below its opening box, has nothing to leave.
    const seen = plan && list ? onScreen(list, ".group") : null;
    const drawnNow = (key: string) => !seen || seen.has(key);
    // What is drawn now: the groups as they stand, mid-change or not. A
    // group already closing has said its goodbye; it is not said twice.
    const old: Group[] = drawn
      .filter((entry) => entry.kind !== "gone")
      .map((entry) => ({
        ...entry.group,
        rows: entry.rows.filter((row) => drawnNow(row.id)),
      }));
    for (const run of heights) {
      run.cancel();
    }
    heights = [];

    const after = moreOf(next, whole);
    const relayed = planRelay(
      old,
      listed(next, whole),
      [...new Set([...more.keys(), ...after.keys()])].map((machineId) => ({
        key: moreKey(machineId),
        box: machineId,
        before: more.get(machineId)?.words ?? null,
        after: after.get(machineId)?.words ?? null,
      })),
      drawnNow
    );
    const base = {
      layered: relayed.layered,
      leave: relayed.leave,
      more: new Map(
        [...more].map(([machineId, line]) => [machineId, line.words])
      ),
      old,
      tab: shown,
    };
    const lines = relayed.lines.map((line) => ({ ...line, tab: shown }));
    const moving = motionOk.current;

    // The list's reflow, and every one around it, lets go of every place:
    // from here this owns them.
    reread(reflowsFrom(list ?? null));
    flushSync(() => {
      plan = { ...base, enter: relayed.enter };
      swap.swap(lines, dir, { keep: lines.length });
      apply();
    });

    let done = dur("--dur-panel");
    if (list && moving) {
      const driven = driveHeights(list, BOXES, before, relayed.lastOut);
      heights = driven.runs;
      const enter = waitForBoxes(driven.opened, relayed.enter);
      done = Math.max(
        driven.done,
        ...relayed.lastOut.values(),
        ...[...enter.values()].map(
          (at) => ListSwap.enterAt(at.i, at.notBefore) + IN_MS
        )
      );
      flushSync(() => {
        plan = { ...base, enter };
      });
    }

    swap.hold(moving ? done : 0);
    clearTimeout(settle);
    settle = setTimeout(
      () => {
        flushSync(() => {
          plan = null;
        });
        // Done: every box is at its natural height; a closed one lets go.
        for (const run of heights) {
          run.cancel();
        }
        heights = [];
        // Let go: the list and every box around it stand at their own
        // heights now, with no change to the DOM their reflows would hear.
        reread(reflowsFrom(listEl ?? null));
      },
      moving ? done : 0
    );
  }

  function choose(next: WorkTab): void {
    if (next === shown && !plan) {
      workTab.set(next);
      return;
    }
    relay(next === "finished" ? 1 : -1, next, workTab.shownWhole(next), () => {
      shown = next;
      workTab.set(next);
    });
  }

  /**
   * → opens the tree of the row with focus, ← folds it; ← on a row that is
   * not open goes up to its parent, the way a tree view walks.
   */
  const arrowKeys: Attachment<HTMLElement> = (node) => {
    node.addEventListener("keydown", onkey);
    return () => node.removeEventListener("keydown", onkey);
  };
  function onkey(event: KeyboardEvent): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    const id = (event.target as Element).closest<HTMLElement>("[data-key]")
      ?.dataset.key;
    const line = id ? shapeOf(shown, id) : undefined;
    if (!(id && line)) {
      return;
    }
    const parent = line.descendants.length > 0;
    const open = event.key === "ArrowRight";
    if (parent && openTrees.has(id, "home") !== open) {
      event.preventDefault();
      openTrees.set(id, open, "home");
    } else if (!open && line.parent) {
      event.preventDefault();
      listEl
        ?.querySelector<HTMLElement>(
          `[data-key="${CSS.escape(line.parent)}"] [data-rail-row]`
        )
        ?.focus();
    }
  }

  /** Shows one machine's group in full, or back to its first few. */
  function fold(machineId: string): void {
    const whole = new Set(workTab.shownWhole(shown));
    const all = !whole.has(machineId);
    if (all) {
      whole.add(machineId);
    } else {
      whole.delete(machineId);
    }
    relay(all ? 1 : -1, shown, whole, () =>
      workTab.setShownWhole(shown, machineId, all)
    );
  }

  const enterAnim = (key: string): string => {
    const at = plan?.enter.get(key);
    return at ? `animation:${swap.rowAnim(at.i, at.notBefore)}` : "";
  };
  /**
   * A header's motion: arriving with a new machine, leaving with a gone
   * one, or, gone before it ever arrived (a switch mid-change), unseen.
   */
  const headStyle = (kind: "stay" | "new" | "gone", id: string): string => {
    const key = `head:${id}`;
    if (kind !== "gone") {
      return enterAnim(key);
    }
    return plan?.leave.has(key) ? leaveAnim(key) : "opacity:0";
  };
  const leaveAnim = (key: string): string => {
    const at = plan?.leave.get(key);
    return at === undefined ? "" : `animation:${swap.leaveAnim(at)}`;
  };

  /** A working row's line: its project, then what it is doing now. */
  function workingLine(row: InstanceRow): string {
    const tool = cawco.currentToolOf(row.id);
    const doing = tool ? `${tool.name} ${tool.glance}`.trim() : "";
    return [projectOf(row.machineId, row.cwd), doing]
      .filter(Boolean)
      .join(" · ");
  }
  /** A finished row's line: its project, and why, if it failed. */
  function finishedLine(row: InstanceRow): string {
    const why = isFailed(row)
      ? `failed${row.lastError ? `: ${row.lastError}` : ""}`
      : "";
    return [projectOf(row.machineId, row.cwd), why].filter(Boolean).join(" · ");
  }
  /** The row's meta line, naming its machine when it is not its group's. */
  function metaLine(row: InstanceRow, tab: WorkTab, group: string): string {
    const said = tab === "working" ? workingLine(row) : finishedLine(row);
    return row.machineId === group
      ? said
      : `${machineName(row.machineId)} · ${said}`;
  }
  function age(row: InstanceRow, tab: WorkTab): string {
    if (tab === "working") {
      const since = cawco.turnSince(row.id);
      return since ? span(clock.now - since) : "";
    }
    return span(clock.now - lastAt(row));
  }
</script>

{#snippet header(group: Group, style: string)}
  {@const finished = shown === 'finished' ? finishedOn(group.machineId) : []}
  <!-- Where these run, said once for the rows under it. -->
  <h3 class="machine" data-key="head:{group.machineId}" {style}>
    <OsMark class="size-3.5" os={group.os} />
    <span>{group.name}</span>
    {#if finished.length > 0}
      <!-- Everything this machine has finished, failures too, off the list
           in one go. -->
      <button
        aria-label="Archive all finished on {group.name}"
        class="archive-all focus-inset touch-hit press-tint"
        onclick={() => archive(finished)}
        type="button"
      >
        <IconArchive aria-hidden="true" />Archive all
      </button>
    {/if}
  </h3>
{/snippet}

{#snippet sessionRow(row: InstanceRow, tab: WorkTab, group: string)}
  {@const context = shapeOf(tab, row.id)?.context ?? false}
  <!-- A context line is the parent of delegates listed here, not one of
       the tab's own: its state and name, quietly, and nothing else. -->
  <HomeRow
    active={current === row.id}
    {context}
    done={tab === 'finished'}
    fold={foldOf(tab, row.id)}
    href={conversationHref(row.id, cawco.instanceIndex)}
    instance={row}
    line={context ? '' : metaLine(row, tab, group)}
    machineId={row.machineId}
    onarchive={tab === 'finished' && home.archivable(row)
      ? () => archiveTree(row.id)
      : undefined}
    {stale}
    title={instanceTitle(row)}
    trail={context ? '' : age(row, tab)}
  />
{/snippet}

{#snippet treeNode(row: InstanceRow, rows: InstanceRow[], group: string)}
  {@const shape = shapeOf(shown, row.id)}
  {@const kids = under(shown, rows, row.id)}
  <!-- A row and, open, the rows under it: its box (`data-flip="box"`)
       takes their room at once and its edge travels to it, what is under
       it sliding with that edge (motion/rows); they open and fold on its
       rail (motion/branch). -->
  <li class="node" data-flip={plan ? undefined : 'box'}>
    <div class="line" data-key={row.id} style={enterAnim(row.id)}>
      {#if shape?.parent && shape.depth > 0}
        {@const above = shape.parent}
        <!-- The parent's column: a click on its rail folds it. -->
        <button
          aria-hidden="true"
          class="gutter"
          onclick={() => openTrees.set(above, false, 'home')}
          tabindex="-1"
          type="button"
        ></button>
      {/if}
      {@render sessionRow(row, shown, group)}
    </div>
    {#if kids.length > 0}
      <ul
        class="kit-nest branch"
        data-flip-anchor
        in:branch={TREE}
        out:branch={TREE}
        {@attach nestFrom('.session-mark')}
      >
        {#each kids as kid (kid.id)}
          {@render treeNode(kid, rows, group)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet leavingTree(line: Line, lines: Line[])}
  {@const kids = lines.filter(
    (other) => other.row && shapeOf(other.tab, other.key)?.parent === line.key
  )}
  <li class="node">
    <div class="line" style={leaveAnim(line.key)}>
      {@render sessionRow(line.row as InstanceRow, line.tab, line.machineId)}
    </div>
    {#if kids.length > 0}
      <ul class="kit-nest branch" {@attach nestFrom('.session-mark')}>
        {#each kids as kid (kid.key)}
          {@render leavingTree(kid, lines)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet leaving(lines: Line[], layer: boolean)}
  {@const keys = new Set(lines.map((line) => line.key))}
  <div
    aria-hidden="true"
    class={layer ? "leaving layer" : "leaving"}
    data-leaving
    data-reflow
    inert
  >
    <ul class="tree">
      {#each lines.filter((line) => line.row && !keys.has(shapeOf(line.tab, line.key)?.parent ?? '')) as line (line.key)}
        {@render leavingTree(line, lines)}
      {/each}
    </ul>
  </div>
{/snippet}

{#if home.working.length + home.finished.length > 0}
  <section aria-label="Sessions" class="work" data-flip="box">
    <div class="head">
      <!-- The session tabs' folder tabs, hosted: no shelf, the chosen
           sheet the only mark, the section's seam under the row. -->
      <Tabs
        class="work-tabs"
        onValueChange={(id: string) => choose(id as WorkTab)}
        value={workTab.current}
        variant="folder"
      >
        <TabsList aria-label="Sessions">
          {#each TABS as tab (tab.id)}
            {@const count = rowsOf(tab.id).length}
            <TabItem label={tab.label} value={tab.id}>
              {#snippet trail()}
                {#key count}
                  <span
                    class="num count"
                    data-failed={(tab.id === 'finished' && finishedFailed) ||
                      undefined}
                    data-flip="pop"
                    data-tab={tab.id}
                    >{count}</span
                  >
                {/key}
              {/snippet}
            </TabItem>
          {/each}
        </TabsList>
      </Tabs>
      <Tip label={rail.delegates ? 'Hide delegates' : 'Show delegates'}>
        {#snippet children(tip)}
          <!-- A switch with no count of its own, at a fixed size, so
               nothing in the header moves when it is pressed. On, its
               glyph turns solid in strong ink; off, the duotone, muted. -->
          <button
            {...tip}
            aria-label="Delegates"
            aria-pressed={rail.delegates}
            class="delegates focus-inset touch-hit"
            data-on={rail.delegates || undefined}
            onclick={() => rail.setDelegates(!rail.delegates)}
            type="button"
          >
            {#if rail.delegates}
              <StructureOn aria-hidden="true" />
            {:else}
              <Structure aria-hidden="true" />
            {/if}
          </button>
        {/snippet}
      </Tip>
    </div>
    <div
      class="list"
      bind:this={listEl}
      {@attach reflow()}
      {@attach highlight(ROW_PILL)}
      {@attach holdWhileInside('home:')}
      {@attach arrowKeys}
    >
      {#each drawn as entry (entry.group.machineId)}
        {@const id = entry.group.machineId}
        <div
          class="group"
          data-flip={plan ? undefined : 'box'}
          data-kind={entry.kind}
          data-machine={id}
          class:filled={entry.rows.length > 0 || entry.kind === 'gone'}
        >
          <hr class="kit-seam">
          {@render header(
            entry.group,
            headStyle(entry.kind, id)
          )}
          <div class="rows">
            {#if plan?.layered.has(id) && entry.gone.length}
              <!-- The rows this machine had, leaving in the places the new
                   ones take, each new one arriving as its place clears. -->
              {@render leaving(entry.gone, true)}
            {/if}
            <ul class="tree">
              {#each under(shown, entry.rows, null) as row (`${swap.gen}:${row.id}`)}
                {@render treeNode(row, entry.rows, id)}
              {/each}
            </ul>
            {#if !plan?.layered.has(id) && entry.gone.length}
              {@render leaving(entry.gone, false)}
            {/if}
          </div>
          <!-- The machine's last line: the rest of its trees, or back to
               its first few. It comes and goes in the relay like any other
               line, inside its machine's box. -->
          {#if entry.kind !== 'gone' && more.get(id)}
            {@const line = more.get(id) as More}
            <!-- A line of the list like the rows above it (`data-flip`): when
                 a tree over it opens or folds, it slides with them. -->
            <button
              class="more focus-inset touch-hit press-tint"
              data-flip={plan ? undefined : ''}
              data-key={moreKey(id)}
              data-rail-row
              onclick={() => fold(id)}
              style={enterAnim(moreKey(id))}
              type="button"
            >
              {line.words}
              {#if line.failed > 0}
                <span class="more-failed">· {line.failed} failed</span>
              {/if}
            </button>
          {:else if plan?.more.get(id)}
            <span aria-hidden="true" class="more" style={leaveAnim(moreKey(id))}
              >{plan.more.get(id)}</span
            >
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .work {
    display: flex;
    flex-direction: column;
  }
  /* The tabs on no shelf of their own (PaneTabs' hosted bar): the chosen
     sheet is the only mark, the section's seam runs under the row, and the
     delegates button stands at its end, centred on the tabs. */
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) 0 0;
    margin-bottom: var(--space-1);
    border-bottom: 1px solid var(--seam);
  }
  :global(.work-tabs[data-slot="tabs"]) {
    padding: 0;
    background: none;
  }
  /* The session tabs' sizes (PaneTabs): sized to their content plus --px.
     The chosen sheet stands off the rail in both themes (raised on the light
     rail, lit on the dark one), and hovering an unchosen tab is a lighter
     tint than choosing it. */
  :global(.work-tabs[data-slot="tabs"] .ff-tabs-list) {
    --px: 6px;
    --text: var(--text-label);
    --item: 32px;
    --sheet: light-dark(var(--surface-raised), var(--surface-hover));
    --tab-hover: color-mix(in oklch, var(--surface-fill) 50%, transparent);
  }
  /* An unchosen tab draws no card of its own: on the light rail its card was
     the darker shape, and read as the chosen one. */
  :global(.work-tabs[data-slot="tabs"] .ff-tabs-list .ff-tab::before) {
    background: none;
  }
  /* The count, washed in its tab's status ink (the usage tints' strength),
     on the chosen tab only; the other's is a plain numeral. */
  .count {
    --ink: var(--status-live-ink);
    --wash: var(--count-wash-live);
    display: inline-grid;
    place-items: center;
    min-inline-size: 18px;
    block-size: 18px;
    padding-inline: 3px;
    margin-inline-end: 2px;
    border-radius: var(--radius-xs);
    background: var(--wash);
    color: var(--ink);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .count[data-tab="finished"] {
    --ink: var(--status-done-ink);
    --wash: var(--count-wash-done);
  }
  /* Something listed as finished failed: the numeral says so. */
  .count[data-failed] {
    --ink: var(--status-fail-ink);
    --wash: var(--count-wash-fail);
  }
  :global(.ff-tab:not(.selected)) .count {
    background: none;
  }
  :global(.ff-tab:not(.selected)) .count:not([data-failed]) {
    color: var(--ink-muted);
  }
  /* The corner actions' icon button (Sidebar .head-action), at one size
     whatever it shows. Pressed, its glyph turns solid in strong ink: no
     fill, nothing that moves. */
  .delegates {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-block-end: 2px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  .delegates :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .delegates[data-on] {
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .delegates:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .list {
    display: flex;
    flex-direction: column;
    overflow-x: clip;
  }
  /* Every group keeps the room a seam would take; the seam itself is drawn
     in it, only after a group with rows, so groups coming and going never
     move one. */
  /* A flex column, so its header's margin stays inside it: closed to
     nothing, a group takes no room at all. */
  .group {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .group > :global(.kit-seam) {
    position: absolute;
    inset: 0 0 auto;
    opacity: 0;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .group.filled ~ .group.filled > :global(.kit-seam) {
    opacity: 1;
  }
  .rows {
    position: relative;
  }
  /* A machine's trees, and each parent's rows under it: lists of rows,
     --space-row apart. */
  .tree,
  .branch {
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* A delegate under its session (tree.ts): in a list of its own, set in
     under its parent's glyph and joined to it by the .kit-nest lines (down
     the rail, round the curve, out along the arm to the child's glyph, over
     the row's pill), placed as the sidebar's are (motion/branch `nestFrom`),
     so a tree nests alike in both. */
  .branch {
    --nest-gap: var(--space-row);
    padding-block-start: var(--space-row);
    padding-inline-start: var(--nest-pad);
  }
  .node,
  .line {
    position: relative;
  }
  /* A child's parent column: a click on the rail there folds the parent,
     and the rail brightens under the pointer to say so. It reaches from a
     step left of the rail to the row's own left edge. */
  .gutter {
    position: absolute;
    inset-block: 0;
    left: calc(var(--nest-x) - var(--nest-pad) - var(--space-2));
    z-index: 1;
    inline-size: calc(var(--nest-pad) - var(--nest-x) + var(--space-2));
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;

    &::before {
      content: "";
      position: absolute;
      inset-block: 0;
      left: calc(var(--space-2) - 1px);
      inline-size: 3px;
      border-radius: var(--radius-hair);
      background: var(--ink-strong);
      opacity: 0;
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .gutter:hover::before {
      opacity: 0.3;
    }
  }
  /* The old rows, out of the layout either way: the group's own height is
     only what stays, so the height drive holds it while they leave and then
     closes it. Its own reflow boundary (data-reflow): the list's reflow
     neither enters these copies nor ghosts them when they go. */
  .leaving {
    position: absolute;
    inset: 0 0 auto;
    pointer-events: none;
  }
  /* With no successor (a group that goes, "Show fewer"), where they stood:
     under what stays. Layered, over the rows' top, each old row in the
     place its successor takes. */
  .leaving:not(.layer) {
    top: 100%;
  }
  .rows:has([data-key]) > .leaving:not(.layer) {
    top: calc(100% + var(--space-row));
  }
  .machine {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: var(--space-2) 0 var(--space-1);
    padding: 0 var(--space-3);
    min-height: 22px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* "Archive all", at the header's end. */
  .archive-all {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    block-size: 22px;
    margin-inline: auto calc(var(--space-1) * -1);
    padding-inline: var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    font: var(--type-meta);
    cursor: pointer;
    transition: var(--transition-control);

    & :global(svg) {
      inline-size: 14px;
      block-size: 14px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .archive-all:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .more-failed {
    margin-inline-start: 0.3em;
    color: var(--status-fail-ink);
  }
  .more {
    display: flex;
    align-items: center;
    min-height: 28px;
    margin-top: 2px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: start;
    cursor: pointer;
  }
</style>
