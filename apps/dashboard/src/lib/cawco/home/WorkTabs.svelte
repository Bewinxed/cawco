<script lang="ts">
  /**
   * Working and Finished, as one switch over one list: the sidebar's and the
   * phone home's, reading one remembered choice (work-tab). The header is the
   * session tabs' own folder tabs (ui/fluid-tabs, hosted the way PaneTabs
   * hosts them in a bar: no shelf, the chosen sheet the only mark), each a
   * label and a count, the kit's badge in its tab's status pair.
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
   * opening and folding as every tree in the app does (motion/branch). A
   * parent lists its recent rows and folds the rest under one "N older" row
   * (older.ts, OlderRows), as a project does its sessions. Each
   * machine lists its first MORE_AT trees and its own "N
   * more", so every machine with rows keeps its header and its Archive all;
   * opening the rest (or closing them) is the same relay, the rows arriving
   * or leaving in place. A finished row, or a whole tree, can be archived
   * without opening it, and a machine's header archives all it finished.
   * With nothing changing, the list's own `reflow` carries live changes: a
   * row arriving, a held re-sort.
   *
   * Under the tab row there is always something. Until the first read is in
   * (`waiting`) the tabs stand, without counts, over rows that wait: the row
   * is where it will be when the list lands. Read, a tab with nothing in it
   * says so, and Working names the next thing to do; that claim waits on the
   * data and on a live hub, so a lost hub says only what was last known.
   * With nothing in either tab there is no switch at all: the home's own
   * empty state (Caw) stands then. The delegates button lists work other sessions started,
   * each under the session that started it; a parent the tab does not list
   * stands in as a quiet context line, not counted and taking no room.
   */
  import { flushSync, untrack } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { FoldMeasure } from "#lib/components/ui/fluid-tabs/fold-memory.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconPlus,
    IconStructure as Structure,
    IconStructureSolid as StructureOn,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { page } from "$app/state";
  import { type BoardRow, cawco, isFailed } from "../client.svelte";
  import { conversationHref } from "../links";
  import { nestFrom } from "../motion/branch.svelte";
  import { crossIn, crossOut, dur, motionOk } from "../motion/curves.svelte";
  import { echoBeat } from "../motion/echo.svelte";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { IN_MS, ListSwap } from "../motion/list-swap.svelte";
  import {
    boxHeights,
    driveHeights,
    onScreen,
    waitForBoxes,
  } from "../motion/relay-boxes";
  import { reflow, reflowsFrom, reread } from "../motion/rows.svelte";
  import OlderRows from "../OlderRows.svelte";
  import OsMark from "../OsMark.svelte";
  import { failedWords } from "../older";
  import { rail } from "../rail.svelte";
  import SessionRow, { ROW_PILL } from "../SessionRow.svelte";
  import { type TreeLine, tree } from "../tree";
  import { workspace } from "../workspace/workspace.svelte";
  import {
    archive,
    byMachine,
    clock,
    home,
    instanceTitle,
    isDelegate,
    lastAt,
    type MachineGroup,
    machineName,
    projectOfRow,
    span,
  } from "./home-state.svelte";
  import { type Arrival, planRelay, type RelayLine } from "./relay-plan";
  import SessionTree from "./SessionTree.svelte";
  import { TreeView } from "./tree-view.svelte";
  import { type WorkTab, workTab } from "./work-tab.svelte";

  let {
    stale,
    waiting,
    onstart,
    markedElsewhere,
    variant,
    relaying = $bindable(false),
  }: {
    /**
     * Where the tabs stand: the home page's, or the rail's. Each keeps its
     * own open trees (open-trees).
     */
    variant: "page" | "rail";
    /**
     * The open conversation's row is marked elsewhere on screen (the rail's
     * project tree draws it): the selection is one row, so this list leaves
     * it unmarked.
     */
    markedElsewhere?: (id: string) => boolean;
    /**
     * A change of the rows is in flight (`relay`): the list's heights are
     * driven here, frame by frame. The boxes around the list (this section,
     * the home) are no reflow's to move meanwhile: left `data-flip="box"`,
     * the rail's reflow heard them resize part-way through and ran its own
     * edge over them from the height it last knew. On the first change after
     * a load that was the height before the click, so the home shut to it
     * and opened again.
     */
    relaying?: boolean;
    /** The hub is not live: the rows are what was last known. */
    stale: boolean;
    /** The first read is not in: the tabs stand over rows that wait. */
    waiting: boolean;
    /** Opens the home's Start session dialog (a Working tab with no rows). */
    onstart: () => void;
  } = $props();

  /** The rows standing in for the list while it is read. */
  const WAITING_ROWS = [0, 1, 2];

  const current = $derived(
    page.url.pathname.startsWith("/session") ? workspace.activeSessionId : null
  );

  const TABS = [
    { id: "working", label: "Working" },
    { id: "finished", label: "Finished" },
  ] as const;
  /** The tabs' order, for the strip to draw its chosen tab from the first render. */
  const TAB_IDS = TABS.map((tab) => tab.id);
  /** Rows a tab lists before "N more". */
  const MORE_AT = 8;
  /** The boxes whose heights a change drives: each group, its "N more" line in it. */
  const BOXES = ":scope > .group";

  /** Every session a tab could list, delegates included. */
  const allOf = (tab: WorkTab): BoardRow[] =>
    tab === "working" ? home.working : home.finished;
  /**
   * A tab's own rows, by the Delegates switch: the home's one rule for it
   * (home-state `workingListed`, `finishedListed`), which Recent reads too,
   * so a session a tab leaves out is one Recent holds.
   */
  const rowsOf = (tab: WorkTab): BoardRow[] =>
    tab === "working" ? home.workingListed : home.finishedListed;
  /**
   * What a tab with no rows says of the delegates it leaves out: with the
   * Delegates switch off, a tab whose only rows are delegates of sessions it
   * does not list is empty, and "nothing is working" would be untrue.
   */
  const unlisted = (tab: WorkTab): string => {
    const count = allOf(tab).length;
    if (count === 1) {
      return `1 delegate ${tab === "working" ? "is working" : "has finished"}. Its session is not listed here.`;
    }
    return `${count} delegates ${tab === "working" ? "are working" : "have finished"}. Their sessions are not listed here.`;
  };
  /** A session the tab does not list, to stand in for a delegate's parent. */
  const known = (id: string): BoardRow | undefined =>
    cawco.instanceIndex.byId.get(id);
  /**
   * Each tab as its tree (tree.ts): every session followed by its
   * delegates, and each ancestor the tab does not list drawn as a context
   * line in its delegates' place, so none stands alone. Newest on top: the
   * rows come newest first, and Finished stands a tree at its latest member,
   * Working at its earliest (so two agents trading turns never swap).
   */
  const views = {
    working: new TreeView(
      () => tree(rowsOf("working"), { anchor: "last", context: known }),
      () => (variant === "rail" ? "rail-working" : "home-working")
    ),
    finished: new TreeView(
      () => tree(rowsOf("finished"), { anchor: "first", context: known }),
      () => (variant === "rail" ? "rail-finished" : "home-finished")
    ),
  };
  /**
   * Each tab's tree as the shared view answers it (tree-view): a row's place,
   * what its parent folds under "N older", the lines that are out. Working's
   * rows are all running, so none of them ever folds; Finished is where a
   * session's hundred delegates pile up. The rows in an older box (`boxed`)
   * are ones a change of the list neither relays nor counts.
   */
  const shapeOf = (tab: WorkTab, id: string) => views[tab].shapeOf(id);
  const olderOf = (tab: WorkTab, id: string) => views[tab].olderOf(id);
  const under = (
    tab: WorkTab,
    rows: BoardRow[],
    parent: string | null
  ): BoardRow[] => views[tab].under(rows, parent);
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
    for (const line of views.finished.lines) {
      if (line.depth === 0) {
        top = line.row.machineId;
      }
      if (top === machineId && !line.context && home.archivable(line.row)) {
        ids.push(line.row.id);
      }
    }
    return ids;
  }

  type Group = MachineGroup<BoardRow>;
  /** A line that is leaving: a machine's header, or one of its rows. */
  interface Line extends RelayLine<BoardRow> {
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
    const lines = views[tab].folded;
    const tops = byMachine(
      lines.filter((line) => line.depth === 0).map((line) => line.row)
    );
    const at = new Map(
      tops.map((group) => [
        group.machineId,
        { ...group, rows: [] as BoardRow[] },
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
    if (whole.has(group.machineId) || beyondCap(tab, group).length === 0) {
      return group;
    }
    let room = MORE_AT;
    const rows: BoardRow[] = [];
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

  /**
   * A machine's trees past its first MORE_AT; none when only one is, since
   * a "Show 1 more" line costs the height of the row it hides.
   */
  function beyondCap(tab: WorkTab, group: Group): TreeLine<BoardRow>[] {
    const hidden = (
      group.rows
        .map((row) => shapeOf(tab, row.id))
        .filter((line) => line?.depth === 0) as TreeLine<BoardRow>[]
    ).slice(MORE_AT);
    return hidden.length > 1 ? hidden : [];
  }

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
  /**
   * A tab's count: its top-level sessions, never their delegates, whatever
   * the Delegates switch shows (owner: "the working count shouldn't count
   * delegates").
   */
  const topOf = (tab: WorkTab): BoardRow[] =>
    allOf(tab).filter((row) => !isDelegate(row));
  /** Whether a top-level session listed as finished failed: its count says so. */
  const finishedFailed = $derived(topOf("finished").some(isFailed));
  /** A tab's count's status pair (DESIGN.md, Badge). */
  const pairOf = (tab: WorkTab): "live" | "done" | "fail" => {
    if (tab === "working") {
      return "live";
    }
    return finishedFailed ? "fail" : "done";
  };

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
      relaying = true;
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
        // The leaving lines go in this same task as everything else the
        // change lets go of, so the reflows around the list hear it once,
        // after they have read where it all stands (`reread`, below).
        flushSync(() => {
          plan = null;
          relaying = false;
          swap.release();
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

  /** A row's arrival in the swap, as an `animation` value; none when it does not move. */
  const enterAnim = (key: string): string | undefined => {
    const at = plan?.enter.get(key);
    return at ? swap.rowAnim(at.i, at.notBefore) : undefined;
  };
  /**
   * A header's motion: arriving with a new machine, leaving with a gone
   * one; gone before it ever arrived (a switch mid-change), it has none and
   * is unseen (`headUnseen`).
   */
  const headAnim = (
    kind: "stay" | "new" | "gone",
    id: string
  ): string | undefined => {
    const key = `head:${id}`;
    return kind === "gone" ? leaveAnim(key) : enterAnim(key);
  };
  const headUnseen = (kind: "stay" | "new" | "gone", id: string): boolean =>
    kind === "gone" && !plan?.leave.has(`head:${id}`);
  /**
   * A row's exit in the swap, as an `animation` value. A leaving row's
   * nesting line (the list item's pseudo-elements, which the row's own
   * animation does not reach) takes the same as `--leave`: left alone, the
   * rows went and their lines stood over the incoming list until the
   * leaving layer was taken down.
   */
  const leaveAnim = (key: string): string | undefined => {
    const at = plan?.leave.get(key);
    return at === undefined ? undefined : swap.leaveAnim(at);
  };

  /** A working row's line: its project, then what it is doing now. */
  function workingLine(row: BoardRow): string {
    const tool = cawco.currentToolOf(row.id);
    const doing = tool ? `${tool.name} ${tool.glance}`.trim() : "";
    return [projectOfRow(row), doing].filter(Boolean).join(" · ");
  }
  /** A finished row's line: its project, and why, if it failed. */
  function finishedLine(row: BoardRow): string {
    const why = isFailed(row)
      ? `failed${row.lastError ? `: ${row.lastError}` : ""}`
      : "";
    return [projectOfRow(row), why].filter(Boolean).join(" · ");
  }
  /** The row's meta line, naming its machine when it is not its group's. */
  function metaLine(row: BoardRow, tab: WorkTab, group: string): string {
    const said = tab === "working" ? workingLine(row) : finishedLine(row);
    return row.machineId === group
      ? said
      : `${machineName(row.machineId)} · ${said}`;
  }
  function age(row: BoardRow, tab: WorkTab): string {
    if (tab === "working") {
      const since = cawco.turnSince(row.id);
      return since ? span(clock.now - since) : "";
    }
    return formatAgeShort(lastAt(row), clock.now);
  }
</script>

{#snippet header(group: Group, anim: string | undefined, unseen: boolean)}
  {@const finished = shown === "finished" ? finishedOn(group.machineId) : []}
  <!-- Where these run, said once for the rows under it. -->
  <h3
    data-slot="machine"
    class="mark-line mx-0 mt-space-2 mb-space-1 flex min-h-space-6 items-center gap-space-1 px-space-3 py-0 type-meta text-ink-muted"
    data-key="head:{group.machineId}"
    style:animation={anim}
    style:opacity={unseen ? "0" : undefined}
  >
    <OsMark class="size-icon-md" os={group.os} />
    <span>{group.name}</span>
    {#if finished.length > 0}
      <!-- Everything this machine has finished, failures too, off the list
           in one go: "Archive all", at the header's end. -->
      <button
        aria-label="Archive all finished on {group.name}"
        class="select-none mark-line focus-inset touch-hit press-tint ms-auto -me-space-1 inline-flex h-space-6 items-center gap-space-1 rounded-xs border-none border-current bg-transparent px-space-1 type-meta text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
        data-box
        onclick={() => archive(finished)}
        type="button"
      >
        <IconArchive aria-hidden="true" class="size-icon-md" /><span
          >Archive all</span
        >
      </button>
    {/if}
  </h3>
{/snippet}

{#snippet sessionRow(row: BoardRow, tab: WorkTab, group: string)}
  {@const context = shapeOf(tab, row.id)?.context ?? false}
  <!-- A context line is the parent of delegates listed here, not one of
       the tab's own: its state and name, quietly, and nothing else. -->
  <SessionRow
    active={current === row.id && !markedElsewhere?.(row.id)}
    {context}
    done={tab === "finished"}
    fold={views[tab].foldOf(row.id)}
    href={conversationHref(row.id, cawco.instanceIndex)}
    instance={row}
    line={context ? "" : metaLine(row, tab, group)}
    machineId={row.machineId}
    onarchive={tab === "finished" && home.archivable(row)
      ? () => archiveTree(row.id)
      : undefined}
    {stale}
    title={instanceTitle(row)}
    trail={context ? "" : age(row, tab)}
  />
{/snippet}

{#snippet leavingTree(line: Line, lines: Line[])}
  {@const kids = lines.filter(
    (other) => other.row && shapeOf(other.tab, other.key)?.parent === line.key
  )}
  {@const older = olderOf(line.tab, line.key)}
  {@const leave = leaveAnim(line.key)}
  <!-- The row's nesting line is this item's own (app.css .kit-nest): it
       leaves on the row's exit, in the row's frames (`--leave`). -->
  <li
    data-tree-node
    class="relative in-data-leaving:before:animate-(--leave) in-data-leaving:after:animate-(--leave)"
    style:--leave={leave}
  >
    <div data-slot="tree-line" class="relative" style:animation={leave}>
      {@render sessionRow(line.row as BoardRow, line.tab, line.machineId)}
    </div>
    {#if kids.length > 0}
      <ul
        data-slot="tree-branch"
        data-nest
        class="kit-nest m-0 flex list-none flex-col gap-(--tree-gap) pt-(--tree-gap) pb-0 ps-(--nest-pad) pe-0"
        {@attach nestFrom("[data-tree-mark]")}
      >
        {#each kids as kid (kid.key)}
          {@render leavingTree(kid, lines)}
        {/each}
        {#if older}
          <!-- Its "N older" row leaves with the last row over it. -->
          <OlderRows
            count={older.count}
            failed={older.failed}
            id={line.key}
            list={views[line.tab].list}
            motion={leaveAnim(kids.at(-1)?.key ?? line.key)}
            still
            tall
          />
        {/if}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet leaving(lines: Line[], layer: boolean)}
  {@const keys = new Set(lines.map((line) => line.key))}
  <!-- The old rows, out of the layout either way: the group's own height is
       only what stays, so the height drive holds it while they leave and
       then closes it. Its own reflow boundary (data-reflow): the list's
       reflow neither enters these copies nor ghosts them when they go. With
       no successor (a group that goes, "Show fewer"), where they stood:
       under what stays. Layered, over the rows' top, each old row in the
       place its successor takes. -->
  <div
    data-layer={layer || undefined}
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 bottom-auto not-data-layer:top-full [[data-slot=work-tabs-rows]:has([data-key])>&]:not-data-layer:top-(--leave-top)"
    data-leaving
    data-reflow
    inert
    style:--leave-top="calc(100% + var(--tree-gap))"
  >
    <ul
      data-slot="work-tabs-session-tree"
      class="m-0 flex list-none flex-col gap-(--tree-gap) p-0"
    >
      {#each lines.filter((line) => line.row && !keys.has(shapeOf(line.tab, line.key)?.parent ?? "")) as line (line.key)}
        {@render leavingTree(line, lines)}
      {/each}
    </ul>
  </div>
{/snippet}

{#if waiting || home.working.length + home.finished.length > 0}
  <section
    aria-label="Sessions"
    class="@container flex flex-col"
    data-flip={plan ? undefined : "box"}
  >
    <!-- The tabs on no shelf of their own (PaneTabs' hosted bar): the chosen
         sheet is the only mark, the section's seam runs under the row, and
         the delegates button stands at its end, centred on the tabs, over
         the row's hairline (DESIGN.md Borders: `border-hairline` separates
         rows and regions, as the tab shelf's own line does). --tight is
         how far the row is under the rail at which three-digit counts stand
         whole at rest (`c-work-tabs-roomy-w`): none there and wider, up to
         `c-work-tabs-squeeze`. Read off the row's own width, not the desktop
         rail's (`--rail-w`), so the phone's sheet, which is its own width
         whatever the rail was dragged to, is told as it is. The header's own
         spacing gives that room back to the words, each part to its tight
         step together: the gap to the Delegates switch and the head's
         trailing pad (both to nothing at the full squeeze: the switch's
         28px box keeps its glyph clear of the tabs and the edge), a tab's
         inset, the room after a count. The room before a count stands at
         --space-1 at every width, so a count never touches its word. Past
         the tight steps the words give way and the counts and the switch
         stand (DESIGN.md Typography: "the name gives way first"; the
         artifact head's narrowest forms): the label ends in its ellipsis,
         the head never overflowing. -->
    <div
      data-slot="head"
      class="mb-space-1 flex items-end justify-between gap-(--head-gap) border-b border-b-border-hairline pt-space-1 pr-(--head-end) pb-0 pl-0"
      style:--head-gap="max(0px, calc(var(--space-2) - var(--tight) * 0.2121))"
      style:--head-end="max(0px, calc(var(--space-2) - var(--tight) * 0.2121))"
      style:--tight={"clamp(0px, calc(var(--c-work-tabs-roomy-w) - 100cqw - var(--space-4)), var(--c-work-tabs-squeeze))"}
      style:--count-start="var(--space-1)"
      style:--count-end="max(0px, var(--space-row) - var(--tight) * 0.06)"
    >
      <!-- The session tabs' folder tabs, hosted: no shelf, the chosen
           sheet the only mark, the section's seam under the row. -->
      <Tabs
        data-work-tabs
        boxes={(page.data as { foldBoxes?: Record<string, FoldMeasure> })
          .foldBoxes}
        fill="none"
        onValueChange={(id: string) => choose(id as WorkTab)}
        strip="work"
        value={workTab.current}
        values={TAB_IDS}
        variant="folder"
      >
        <TabsList aria-label="Sessions">
          {#each TABS as tab (tab.id)}
            {@const count = topOf(tab.id).length}
            <TabItem label={tab.label} value={tab.id}>
              {#snippet trail()}
                <!-- No count until it is read, and only above 0 (DESIGN.md,
                     The Earned Count Rule). -->
                {#if !waiting && count > 0}
                  {#key count}
                    <!-- The count is the kit's badge in its tab's status
                         pair (DESIGN.md, Badge), its numeral meta in tabular
                         figures: only its place in the tab is the tab's. A
                         press on the count is a press on its tab: it reaches
                         the hit. -->
                    <Badge
                      data-num
                      data-slot="count"
                      class="ms-(--count-start) me-(--count-end)"
                      data-flip="pop"
                      data-tab={tab.id}
                      size="count"
                      variant={pairOf(tab.id)}><span>{count}</span></Badge
                    >
                  {/key}
                {/if}
              {/snippet}
            </TabItem>
          {/each}
        </TabsList>
      </Tabs>
      <Tip label={rail.delegates ? "Hide delegates" : "Show delegates"}>
        {#snippet children(tip)}
          <!-- A switch with no count of its own, at a fixed size, so
               nothing in the header moves when it is pressed. On, its
               glyph turns solid in strong ink; off, the duotone, muted. -->
          <!-- The corner actions' icon button (Sidebar .head-action), at one
               size whatever it shows. Pressed, its glyph turns solid in
               strong ink: no fill, nothing that moves. -->
          <button
            {...tip}
            aria-label="Delegates"
            aria-pressed={rail.delegates}
            class="select-none focus-inset touch-hit mb-space-row inline-grid size-c-bar-item flex-none place-items-center rounded-sm border-none border-current bg-transparent text-ink-muted transition-[background-color,color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:text-ink-strong data-on:text-ink-strong"
            data-on={rail.delegates || undefined}
            onclick={() => rail.setDelegates(!rail.delegates)}
            type="button"
          >
            {#if rail.delegates}
              <StructureOn aria-hidden="true" class="size-icon-md" />
            {:else}
              <Structure aria-hidden="true" class="size-icon-md" />
            {/if}
          </button>
        {/snippet}
      </Tip>
    </div>
    {#if waiting}
      <!-- The list is being read: rows at a session row's height stand in
           its place, and leave as it cross-fades in over them. -->
      <div
        aria-busy="true"
        aria-label="Reading the fleet"
        class="flex flex-col gap-(--tree-gap)"
        role="status"
        out:crossOut
      >
        {#each WAITING_ROWS as row (row)}
          <Skeleton class="w-full" height="tabs" />
        {/each}
      </div>
    {:else}
      <!-- The list and, over its top, the line a tab with no rows says: one
           cell, as tall as the taller of the two. Changing to or from an
           empty tab, the panel goes from one height to the other in one
           move, never through nothing. -->
      <div class="grid" in:crossIn>
        <div
          data-slot="list"
          class="col-start-1 row-start-1 flex min-w-0 flex-col overflow-x-clip"
          bind:this={listEl}
          {@attach reflow()}
          {@attach highlight(ROW_PILL)}
          {@attach echoBeat()}
          {@attach holdWhileInside("home:")}
          {@attach views[shown].keys}
        >
          {#each drawn as entry (entry.group.machineId)}
            {@const id = entry.group.machineId}
            <!-- A flex column, so its header's margin stays inside it: closed
                 to nothing, a group takes no room at all. Every group keeps
                 the room a seam would take; the seam itself is drawn in it,
                 only after a group with rows, so groups coming and going
                 never move one. (`group` is the relay's box: the swap reads
                 it, `onScreen(list, ".group")`.) -->
            <div
              data-slot="group"
              class="group relative flex flex-col"
              data-filled={entry.rows.length > 0 ||
                entry.kind === "gone" ||
                undefined}
              data-flip={plan ? undefined : "box"}
              data-kind={entry.kind}
              data-machine={id}
            >
              <hr
                class="absolute inset-x-0 top-0 bottom-auto mx-(--seam-inset) h-px border-0 bg-border-hairline opacity-0 transition-[opacity] duration-(--dur-fade) ease-out [[data-slot=group][data-filled]~[data-slot=group][data-filled]>&]:opacity-100"
              />
              {@render header(
                entry.group,
                headAnim(entry.kind, id),
                headUnseen(entry.kind, id)
              )}
              <div data-slot="work-tabs-rows" class="relative">
                {#if plan?.layered.has(id) && entry.gone.length}
                  <!-- The rows this machine had, leaving in the places the new
                   ones take, each new one arriving as its place clears. -->
                  {@render leaving(entry.gone, true)}
                {/if}
                <!-- Each tree is the shared one (SessionTree), drawing this
                     tab's row; the relay gives each line its motion. -->
                {#snippet line(row: BoardRow)}
                  {@render sessionRow(row, shown, id)}
                {/snippet}
                <ul
                  data-slot="work-tabs-session-tree"
                  class="m-0 flex list-none flex-col gap-(--tree-gap) p-0"
                >
                  {#each under(shown, entry.rows, null) as row (`${swap.gen}:${row.id}`)}
                    <SessionTree
                      {current}
                      flip={!plan}
                      {line}
                      {row}
                      motionOf={enterAnim}
                      rows={entry.rows}
                      view={views[shown]}
                    />
                  {/each}
                </ul>
                {#if !plan?.layered.has(id) && entry.gone.length}
                  {@render leaving(entry.gone, false)}
                {/if}
              </div>
              <!-- The machine's last line: the rest of its trees, or back to
               its first few. It comes and goes in the relay like any other
               line, inside its machine's box. -->
              {#if entry.kind !== "gone" && more.get(id)}
                {@const line = more.get(id) as More}
                <!-- A line of the list like the rows above it (`data-flip`): when
                 a tree over it opens or folds, it slides with them. -->
                <button
                  data-slot="more"
                  class="select-none focus-inset touch-hit press-tint mt-space-row flex min-h-c-row-lead items-center rounded-sm border-none border-current bg-transparent px-space-3 py-0 text-start type-meta text-ink-muted"
                  data-flip={plan ? undefined : ""}
                  data-key={moreKey(id)}
                  data-rail-row
                  onclick={() => fold(id)}
                  style:animation={enterAnim(moreKey(id))}
                  type="button"
                >
                  {line.words}
                  {#if line.failed > 0}
                    <span class="ms-space-1 text-status-fail-ink"
                      >{failedWords(line.failed)}</span
                    >
                  {/if}
                </button>
              {:else if plan?.more.get(id)}
                <span
                  data-slot="more"
                  aria-hidden="true"
                  class="mt-space-row flex min-h-c-row-lead items-center rounded-sm border-none border-current bg-transparent px-space-3 py-0 text-start type-meta text-ink-muted"
                  style:animation={leaveAnim(moreKey(id))}
                  >{plan.more.get(id)}</span
                >
              {/if}
            </div>
          {/each}
        </div>
        {#if groups.length === 0}
          <!-- The tab is read and lists nothing. It fades in where the rows
             were as they leave, and out as rows arrive under it. Working
             names the next thing to do; with the hub lost nothing is
             claimed about now, only what was last known. -->
          <!-- A tab with nothing in it: its line on the rows' own text
               column, and under it, on Working, the one thing to do next. -->
          <div
            class="col-start-1 row-start-1 flex min-w-0 flex-col items-start gap-space-2 self-box-start px-space-3 py-space-2 type-meta text-ink-muted data-stale:opacity-55"
            data-stale={stale || undefined}
            transition:crossIn
          >
            {#if stale}
              <p class="m-0">None listed when the hub was last reached.</p>
            {:else if allOf(shown).length > 0}
              <!-- Not empty: only delegates, which the switch leaves out. -->
              <p class="m-0">{unlisted(shown)}</p>
              <Button
                onclick={() => rail.setDelegates(true)}
                size="xs"
                variant="outline"
              >
                Show delegates
              </Button>
            {:else if shown === "working"}
              <p class="m-0">Nothing is working right now.</p>
              <Button onclick={onstart} size="xs" variant="outline">
                <IconPlus />
                <span>Start session</span>
              </Button>
            {:else}
              <p class="m-0">Finished sessions land here.</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}
