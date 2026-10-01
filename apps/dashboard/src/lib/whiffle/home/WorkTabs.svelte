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
   * A tab lists its first MORE_AT rows and "N more"; opening the rest (or
   * closing them) is the same relay, the rows arriving or leaving in place.
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
  import Structure from "~icons/solar/structure-bold-duotone";
  import { type InstanceRow, isFailed, whiffle } from "../client.svelte";
  import { conversationHref } from "../links";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { IN_MS, ListSwap } from "../motion/list-swap.svelte";
  import {
    boxHeights,
    driveHeights,
    onScreen,
    waitForBoxes,
  } from "../motion/relay-boxes";
  import { REFLOW_REREAD, reflow } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { rail } from "../rail.svelte";
  import { tree } from "../tree";
  import { workspace } from "../workspace/workspace.svelte";
  import HomeRow, { ROW_PILL } from "./HomeRow.svelte";
  import {
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
  /** Past this a delegate's indent eats its name; deeper ones stop moving in. */
  const MAX_DEPTH = 2;

  /**
   * Where a row's glyph sits in its line, and how tall a line is: the
   * nesting lines hang off these (measured once a row is drawn).
   */
  const glyphs: Attachment<HTMLElement> = (node) => {
    const measure = (): boolean => {
      const line = node.querySelector<HTMLElement>(
        "[data-key]:not(.nested):has(.project-mark)"
      );
      const mark = line?.querySelector<HTMLElement>(".project-mark");
      if (!(line && mark)) {
        return false;
      }
      const m = mark.getBoundingClientRect();
      const l = line.getBoundingClientRect();
      node.style.setProperty(
        "--glyph-x",
        `${Math.round(m.left + m.width / 2 - l.left)}px`
      );
      node.style.setProperty(
        "--glyph-y",
        `${Math.round(m.top + m.height / 2 - l.top)}px`
      );
      node.style.setProperty("--row-h", `${Math.round(l.height)}px`);
      return true;
    };
    if (measure()) {
      return;
    }
    const watch = new MutationObserver(() => {
      if (measure()) {
        watch.disconnect();
      }
    });
    watch.observe(node, { childList: true, subtree: true });
    return () => watch.disconnect();
  };
  /** The boxes whose heights a change drives: each group, and the "N more" row's. */
  const BOXES = ":scope > .group, :scope > .more-slot";

  /**
   * A delegate that needs the operator: blocked on a question or a
   * permission, or failed. It is listed whatever the Delegates button says,
   * so a needs-you is never missed.
   */
  const needsYou = (row: InstanceRow): boolean =>
    isFailed(row) || whiffle.activityOf(row.id) === "blocked";
  /** Every session a tab could list, delegates included. */
  const allOf = (tab: WorkTab): InstanceRow[] =>
    tab === "working" ? home.working : home.finished;
  /**
   * A tab's own rows. Other delegates only when the Delegates button is
   * on: work another session started is listed on request.
   */
  const rowsOf = (tab: WorkTab): InstanceRow[] =>
    rail.delegates
      ? allOf(tab)
      : allOf(tab).filter((row) => !row.parentInstanceId || needsYou(row));
  /** A session the tab does not list, to stand in for a delegate's parent. */
  const known = (id: string): InstanceRow | undefined =>
    whiffle.instanceIndex.byId.get(id);
  /**
   * Each tab as its tree (tree.ts): every session followed by its
   * delegates, and a parent the tab does not list drawn as a context line
   * in its delegates' place, so none stands alone.
   */
  const trees = $derived({
    working: tree(rowsOf("working"), undefined, known),
    finished: tree(rowsOf("finished"), undefined, known),
  });
  /** Every row's place in its tab's tree: depth, last sibling, rails through it. */
  const shapes = $derived({
    working: new Map(trees.working.map((line) => [line.row.id, line])),
    finished: new Map(trees.finished.map((line) => [line.row.id, line])),
  });
  const shapeOf = (tab: WorkTab, id: string) => shapes[tab].get(id);

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
    /** The "N more" row's words before the change, while it fades. */
    more: string | null;
    /** The groups drawn before the change, as they were drawn. */
    old: Group[];
    /** The tab the leaving rows came from. */
    tab: WorkTab;
  }

  /** The machines' order, the one every list keeps (`byMachine`). */
  const place = (id: string): number => {
    const at = whiffle.machines.findIndex((m) => m.machineId === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  /**
   * A tab's rows by machine, each session followed by its delegates (tree.ts)
   * under the machine its top-level session runs on, so a delegate on
   * another machine still hangs under the session that started it.
   */
  function grouped(tab: WorkTab): Group[] {
    const lines = trees[tab];
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
   * A nested row's lines (the .kit-nest elbow, drawn from its own wrapper
   * since the list is flat): its depth, its place in the stagger, and a
   * straight rail for each ancestor whose line runs on past it.
   */
  function nestStyle(tab: WorkTab, id: string, i: number): string {
    const line = shapeOf(tab, id);
    if (!line || line.depth === 0) {
      return "";
    }
    const rails = line.through.map(
      (depth) =>
        `linear-gradient(var(--nest-ink), var(--nest-ink)) no-repeat calc(var(--glyph-x) + ${depth - 1} * var(--nest-step) - 0.5px) 0 / 1px 100%`
    );
    return [
      `--nest-d: ${Math.min(line.depth, MAX_DEPTH)}`,
      `--nest-i: ${i}`,
      rails.length ? `background: ${rails.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
  }

  /**
   * A tab's groups as listed: all of them, or its first MORE_AT rows. A
   * context line takes no room; it is listed with the first of its
   * delegates that is.
   */
  function listed(tab: WorkTab, all: boolean): Group[] {
    const groups = grouped(tab);
    if (all) {
      return groups;
    }
    let room = MORE_AT;
    const out: Group[] = [];
    for (const group of groups) {
      const rows: InstanceRow[] = [];
      let waiting: InstanceRow[] = [];
      for (const row of group.rows) {
        if (room === 0) {
          break;
        }
        if (shapeOf(tab, row.id)?.context) {
          waiting.push(row);
          continue;
        }
        rows.push(...waiting, row);
        waiting = [];
        room -= 1;
      }
      if (rows.length > 0) {
        out.push({ ...group, rows });
      }
    }
    return out;
  }

  /** The tab whose rows are drawn; it follows the choice in the click. */
  let shown = $state<WorkTab>(untrack(() => workTab.current));
  const groups = $derived(listed(shown, workTab.showsAll(shown)));
  /** The words on the row under the list: "N more", "Show fewer", or none. */
  function moreOf(tab: WorkTab, all: boolean): string | null {
    const total = rowsOf(tab).length;
    if (total <= MORE_AT) {
      return null;
    }
    return all ? "Show fewer" : `Show ${total - MORE_AT} more`;
  }
  const more = $derived(moreOf(shown, workTab.showsAll(shown)));
  /** The delegates the button is keeping out of the tab shown. */
  const hiddenCount = $derived(allOf(shown).length - rowsOf(shown).length);

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
   * (the tab, how many rows), and every line, header and height moves from
   * what is drawn this frame to what that state draws.
   */
  function relay(dir: number, next: WorkTab, all: boolean, apply: () => void) {
    const list = listEl;
    const before = list ? boxHeights(list, BOXES) : new Map<string, number>();
    // Mid-change, only what is on screen this frame is drawn: a line not
    // yet arrived, or still below its opening box, has nothing to leave.
    const seen = plan && list ? onScreen(list, ".group, .more-slot") : null;
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

    const relayed = planRelay(
      old,
      listed(next, all),
      { before: more, after: moreOf(next, all) },
      drawnNow
    );
    const base = {
      layered: relayed.layered,
      leave: relayed.leave,
      more,
      old,
      tab: shown,
    };
    const lines = relayed.lines.map((line) => ({ ...line, tab: shown }));
    const moving = motionOk.current;

    // The list's reflow lets go of every place: from here this owns them.
    list?.dispatchEvent(new Event(REFLOW_REREAD));
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
        listEl?.dispatchEvent(new Event(REFLOW_REREAD));
      },
      moving ? done : 0
    );
  }

  function choose(next: WorkTab): void {
    if (next === shown && !plan) {
      workTab.set(next);
      return;
    }
    relay(next === "finished" ? 1 : -1, next, workTab.showsAll(next), () => {
      shown = next;
      workTab.set(next);
    });
  }

  function fold(): void {
    const all = !workTab.showsAll(shown);
    relay(all ? 1 : -1, shown, all, () => workTab.setShowsAll(shown, all));
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
    const tool = whiffle.currentToolOf(row.id);
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
      const since = whiffle.turnSince(row.id);
      return since ? span(clock.now - since) : "";
    }
    return span(clock.now - lastAt(row));
  }
</script>

{#snippet header(group: Group, style: string)}
  <!-- Where these run, said once for the rows under it. -->
  <h3 class="machine" data-key="head:{group.machineId}" {style}>
    <OsMark class="size-3.5" os={group.os} />
    <span>{group.name}</span>
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
    href={conversationHref(row.id, whiffle.instanceIndex)}
    instance={row}
    line={context ? '' : metaLine(row, tab, group)}
    machineId={row.machineId}
    {stale}
    title={instanceTitle(row)}
    trail={context ? '' : age(row, tab)}
  />
{/snippet}

{#snippet leaving(lines: Line[], layer: boolean)}
  <div
    aria-hidden="true"
    class={layer ? "leaving layer" : "leaving"}
    data-leaving
    inert
  >
    {#each lines.filter((line) => line.row) as line, i (line.key)}
      {@const shape = shapeOf(line.tab, line.key)}
      <div
        data-first={shape?.first || undefined}
        data-last={shape?.last || undefined}
        style={[leaveAnim(line.key), nestStyle(line.tab, line.key, i)].join('; ')}
        class:nested={(shape?.depth ?? 0) > 0}
      >
        {#if (shape?.depth ?? 0) > 0}
          <span aria-hidden="true" class="tip"></span>
        {/if}
        {@render sessionRow(line.row as InstanceRow, line.tab, line.machineId)}
      </div>
    {/each}
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
                  <span class="num count" data-flip="pop" data-tab={tab.id}
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
          <button
            {...tip}
            aria-label={hiddenCount > 0
              ? `Show delegates, ${hiddenCount} hidden`
              : 'Show delegates'}
            aria-pressed={rail.delegates}
            class="delegates focus-inset touch-hit"
            data-on={rail.delegates || undefined}
            onclick={() => rail.setDelegates(!rail.delegates)}
            type="button"
          >
            <Structure aria-hidden="true" />
            {#if hiddenCount > 0}
              <!-- How many the button is keeping out, in the tab's ink. -->
              {#key hiddenCount}
                <span
                  aria-hidden="true"
                  class="num count"
                  data-flip="pop"
                  data-tab={shown}
                  >{hiddenCount}</span
                >
              {/key}
            {/if}
          </button>
        {/snippet}
      </Tip>
    </div>
    <div
      class="list"
      bind:this={listEl}
      {@attach reflow()}
      {@attach glyphs}
      {@attach highlight(ROW_PILL)}
      {@attach holdWhileInside('home:')}
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
            {#each entry.rows as row, i (`${swap.gen}:${row.id}`)}
              {@const shape = shapeOf(shown, row.id)}
              <div
                data-first={shape?.first || undefined}
                data-flip={plan ? undefined : ''}
                data-key={row.id}
                data-last={shape?.last || undefined}
                style={[enterAnim(row.id), nestStyle(shown, row.id, i)].join('; ')}
                class:nested={(shape?.depth ?? 0) > 0}
              >
                {#if (shape?.depth ?? 0) > 0}
                  <span aria-hidden="true" class="tip"></span>
                {/if}
                {@render sessionRow(row, shown, id)}
              </div>
            {/each}
            {#if !plan?.layered.has(id) && entry.gone.length}
              {@render leaving(entry.gone, false)}
            {/if}
          </div>
        </div>
      {/each}
      <!-- The list's last line: the rest of the tab, or back to its first
           few. It comes and goes in the relay like any other line. -->
      <div
        class="more-slot"
        data-kind={more ? 'stay' : 'gone'}
        data-machine="more"
      >
        {#if more}
          <button
            class="more focus-inset touch-hit press-tint"
            data-key="more"
            data-rail-row
            onclick={fold}
            style={enterAnim('more')}
            type="button"
          >
            {more}
          </button>
        {:else if plan?.more}
          <span aria-hidden="true" class="more" style={leaveAnim('more')}
            >{plan.more}</span
          >
        {/if}
      </div>
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
  /* The session tabs' sizes (PaneTabs): sized to their content plus --px. */
  :global(.work-tabs[data-slot="tabs"] .ff-tabs-list) {
    --px: 10px;
    --text: var(--text-label);
    --item: 32px;
    --sheet: var(--surface-hover);
    --tab-hover: var(--surface-hover);
  }
  /* The count, washed in its tab's status ink (the usage tints' strength). */
  .count {
    --ink: var(--status-live-ink);
    display: inline-grid;
    place-items: center;
    min-inline-size: 20px;
    block-size: 18px;
    padding-inline: 5px;
    margin-inline-end: 8px;
    border-radius: var(--radius-xs);
    background: light-dark(
      color-mix(in oklch, var(--ink) 6%, transparent),
      color-mix(in oklch, var(--ink) 10%, transparent)
    );
    color: var(--ink);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .count[data-tab="finished"] {
    --ink: var(--status-done-ink);
  }
  /* The corner actions' icon button (Sidebar .head-action), its pressed
     state their selected tint. */
  .delegates {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-inline-size: 28px;
    block-size: 28px;
    padding-inline: 6px;
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
    flex: none;
    inline-size: 16px;
    block-size: 16px;
  }
  /* The hidden delegates' count, the tab counts' badge at its own end. */
  .delegates .count {
    margin-inline-end: 0;
  }
  .delegates[data-on] {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  @media (hover: hover) and (pointer: fine) {
    .delegates:not([data-on]):hover {
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
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* A delegate under its session (tree.ts): moved in a step per depth, and
     joined to its parent's glyph by the .kit-nest lines — down the rail,
     round the corner, out along the arm to a tip just short of the row, so
     the row's pill never covers a line. */
  .list {
    --nest-step: 32px;
  }
  .nested {
    position: relative;
    padding-left: calc(var(--nest-d) * var(--nest-step));
  }
  .nested::before,
  .nested:not([data-last])::after {
    content: "";
    position: absolute;
    left: calc(var(--glyph-x) + (var(--nest-d) - 1) * var(--nest-step) - 0.5px);
    border: 0 solid var(--nest-ink);
    pointer-events: none;
  }
  .nested::before {
    top: -2px;
    width: calc(var(--nest-step) - var(--glyph-x) - 3px);
    height: calc(var(--glyph-y) + 2px);
    border-left-width: 1px;
    border-bottom-width: 1px;
    border-bottom-left-radius: 6px;
  }
  /* The first delegate's elbow starts at its parent's glyph, a row up. */
  .nested[data-first]::before {
    top: calc(var(--glyph-y) + 9px - var(--row-h) - 2px);
    height: calc(var(--row-h) - 9px + 2px);
  }
  .nested:not([data-last])::after {
    top: var(--glyph-y);
    bottom: -2px;
    border-left-width: 1px;
  }
  .tip {
    position: absolute;
    left: calc(var(--nest-d) * var(--nest-step) - 9px);
    top: calc(var(--glyph-y) - 2.5px);
    inline-size: 5px;
    block-size: 5px;
    border-top: 1px solid var(--nest-ink);
    border-right: 1px solid var(--nest-ink);
    rotate: 45deg;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .nested::before {
      animation: nest-elbow var(--dur-panel) var(--ease-out) both;
      animation-delay: calc(var(--nest-i, 0) * 40ms);
    }
    .nested::after {
      animation: nest-rail var(--dur-panel) var(--ease-out) both;
      animation-delay: calc(var(--nest-i, 0) * 40ms + var(--dur-panel) / 2);
    }
    .tip {
      animation: nest-tip var(--dur-fade) var(--ease-out) both;
      animation-delay: calc(var(--nest-i, 0) * 40ms + var(--dur-panel));
    }
  }
  .leaving {
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }
  /* Over the rows' top: each old row in the place its successor takes. */
  .leaving.layer {
    position: absolute;
    inset: 0 0 auto;
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
  .more-slot {
    display: flex;
    flex-direction: column;
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
