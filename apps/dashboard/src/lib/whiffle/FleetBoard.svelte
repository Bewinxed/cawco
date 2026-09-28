<script lang="ts">
  import type { SDKSessionInfo } from "@whiffle/core";
  /**
   * The fleet board — every session across every machine as one ledger table,
   * with the four counts that say whether the fleet needs you above it.
   * Built from the design source (mocks/v2-fleet.html · mocks/v5-*.html) on
   * shadcn-svelte primitives, token-dressed in the Quiet Ledger system: the
   * stat row is a shadcn Card recessed-well, the filter bar is ui/input +
   * ui/select, the status column is ui/badge, the eight-column ledger is
   * ui/table, and the ledger reveals more rows as it is scrolled.
   *
   * Live and stored sessions are the same kind of row here. A stored session
   * whose transcript is already running somewhere is dropped — the live row is
   * the same conversation, and it is the one that can still be spoken to.
   */
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import WorkflowStatus from "$lib/components/features/workflows/WorkflowStatus.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Card from "$lib/components/ui/card";
  import { EmptyState } from "$lib/components/ui/empty";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { Input } from "$lib/components/ui/input";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Table from "$lib/components/ui/table";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconAlert,
    IconChat,
    IconDownload,
    IconExternal,
    IconHistory,
    IconLaptop,
    IconMaximize,
    IconPlay,
    IconPlus,
    IconSearch,
  } from "$lib/icons";
  import { cn } from "$lib/utils";
  import { formatDistanceToNow } from "$lib/utils/time";
  import AttentionQueue from "$lib/whiffle/AttentionQueue.svelte";
  import LiveSessionRow from "$lib/whiffle/LiveSessionRow.svelte";
  import MachineCard from "$lib/whiffle/MachineCard.svelte";
  import { reflow, tableReflow } from "$lib/whiffle/motion/rows.svelte";
  import StatTile from "$lib/whiffle/StatTile.svelte";
  import NewSessionDialog from "$lib/whiffle/spawn/NewSessionDialog.svelte";
  import { workflowState } from "$lib/whiffle/workflow-state.svelte";
  import {
    type InstanceRow,
    isFailed,
    isResumable,
    isStale,
    reconnectNow,
    resumeSession,
    setPeeked,
    whiffle,
  } from "./client.svelte";
  import HarnessGlyph from "./HarnessGlyph.svelte";
  import { conversationHref, sessionTitle } from "./links";
  import { machineLabel } from "./machine";
  import { type MarkHue, markHue } from "./mark";

  let { active }: { active: boolean } = $props();

  const PAGE_SIZE = 12;

  type PillStatus = "live" | "attn" | "fail" | "idle";

  interface Row {
    at: number | undefined;
    contextPct: number | null;
    cost: number | null;
    cwd: string;
    harness: string;
    harnessLabel: string;
    href: string;
    // the mark draws the vendor glyph from `harness`; the hue tells sessions apart
    hue: MarkHue;
    instance: InstanceRow | null;
    key: string;
    machine: string;
    machineId: string;
    /**
     * Where "Last active" places the row: when its current turn began while
     * it works, else its last activity. A working session's pulses move `at`
     * every second; its turn start stays put, so it keeps its place.
     */
    rank: number;
    stateLabel: string;
    status: PillStatus;
    stored: SDKSessionInfo | null;
    title: string;
    turns: number | null;
  }

  function harnessLabelOf(harness: string): string {
    switch (harness) {
      case "claude":
        return "Claude Code";
      case "opencode":
        return "OpenCode";
      case "pi":
        return "pi";
      default:
        return harness;
    }
  }

  function liveState(instance: InstanceRow): {
    status: PillStatus;
    label: string;
  } {
    if (isFailed(instance)) {
      return { status: "fail", label: "Failed" };
    }
    switch (whiffle.activityOf(instance.id)) {
      case "blocked":
        return { status: "attn", label: "Needs you" };
      case "working":
        return { status: "live", label: "Working" };
      default:
        return { status: "idle", label: "Idle" };
    }
  }

  const rows = $derived.by<Row[]>(() => {
    const live = whiffle.runningInstances.map((instance): Row => {
      const stats = whiffle.statsOf(instance.id);
      const state = liveState(instance);
      const machine = whiffle.machines.find(
        (m) => m.machineId === instance.machineId
      );
      const harness = instance.harness ?? "claude";
      return {
        key: instance.id,
        title: instance.title ?? "untitled session",
        machineId: instance.machineId,
        machine: machine ? machineLabel(machine.hostname) : instance.machineId,
        harness,
        harnessLabel: harnessLabelOf(harness),
        hue: markHue(instance.cwd || instance.machineId),
        status: state.status,
        stateLabel: state.label,
        turns: stats.turns,
        contextPct: stats.contextPct,
        cost: stats.cost,
        at: whiffle.pulseAt(instance.id),
        rank:
          whiffle.turnSince(instance.id) ?? whiffle.pulseAt(instance.id) ?? 0,
        href: conversationHref(instance.id, whiffle.instanceIndex),
        instance,
        stored: null,
        cwd: instance.cwd,
      };
    });

    const running = new Set(
      live.map((row) => row.instance?.sessionId).filter(Boolean)
    );
    const stored = whiffle.machines.flatMap((machine) =>
      whiffle
        .catalogOf(machine.machineId)
        .filter((info) => !running.has(info.sessionId))
        .map(
          (info): Row => ({
            key: `${machine.machineId}:${info.sessionId}`,
            title: sessionTitle(info),
            machineId: machine.machineId,
            machine: machineLabel(machine.hostname),
            harness: info.harness,
            harnessLabel: harnessLabelOf(info.harness),
            hue: markHue(info.cwd || machine.machineId),
            status: "idle",
            stateLabel: "Idle",
            turns: null,
            contextPct: null,
            cost: null,
            at: info.lastModified,
            rank: info.lastModified,
            href: conversationHref(info.sessionId, whiffle.instanceIndex, {
              machineId: machine.machineId,
              cwd: info.cwd,
            }),
            instance: null,
            stored: info,
            cwd: info.cwd ?? "",
          })
        )
    );

    return [...live, ...stored];
  });

  const spend = $derived(
    whiffle.runningInstances.reduce(
      (sum, row) => sum + (whiffle.statsOf(row.id).cost ?? 0),
      0
    )
  );

  /** Listed rows with no live process — asleep or unreachable. Shown apart from
   *  the roster above (staleInstances' own doc comment): "never as live work",
   *  so it stays out of the Sessions stat and out of the live/idle/attn filters. */
  const notRunning = $derived(
    whiffle.listedInstances.filter((row) => isResumable(row) || isStale(row))
  );

  /* ---- filters ------------------------------------------------------- */

  let search = $state("");
  /**
   * What the list is filtered by: the field's text, 80ms after the last
   * keystroke, so a burst of typing reflows the table once rather than
   * once per letter.
   */
  let query = $state("");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function searchTyped() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = search;
      shown = PAGE_SIZE;
    }, 80);
  }
  $effect(() => () => clearTimeout(searchTimer));
  let showAllNotRunning = $state(false);

  /* Not running starts folded to one summary row; the choice is this
     browser's and survives a reload. */
  const NOT_RUNNING_OPEN = "whiffle.fleet.notRunningOpen";
  let notRunningOpen = $state(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(NOT_RUNNING_OPEN) === "true"
  );
  function toggleNotRunning() {
    notRunningOpen = !notRunningOpen;
    localStorage.setItem(NOT_RUNNING_OPEN, String(notRunningOpen));
  }
  /** When a not-running row last changed, as epoch ms (0 when unknown). */
  const rowTime = (row: (typeof notRunning)[number]) =>
    row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  /** The most recently active of the not-running rows, for the summary hint. */
  const latestNotRunning = $derived(
    notRunning.reduce<(typeof notRunning)[number] | undefined>(
      (best, row) => (!best || rowTime(row) > rowTime(best) ? row : best),
      undefined
    )
  );
  const latestTitle = $derived.by(() => {
    const row = latestNotRunning;
    if (!row) {
      return "";
    }
    const info = row.sessionId
      ? whiffle
          .catalogOf(row.machineId)
          .find((entry) => entry.sessionId === row.sessionId)
      : undefined;
    return info ? sessionTitle(info) : (row.title ?? "untitled session");
  });
  /** '' is "All machines"; otherwise a machineId. */
  let machineFilter = $state("");
  const STATES: { value: PillStatus | ""; label: string }[] = [
    { value: "", label: "All states" },
    { value: "live", label: "Working" },
    { value: "attn", label: "Needs you" },
    { value: "idle", label: "Idle" },
  ];
  let stateFilter = $state<PillStatus | "">("");
  const SORTS: { value: "recent" | "name"; label: string }[] = [
    { value: "recent", label: "Last active" },
    { value: "name", label: "Name (A–Z)" },
  ];
  let sortBy = $state<"recent" | "name">("recent");
  /**
   * How many rows are on screen. The whole catalogue is already in memory —
   * `SESSION_CATALOG_LIMIT` is 0, so every machine sends its entire list — so
   * this is a rendering window, not a fetch cursor. It grows as the reader
   * reaches the bottom and resets whenever the list underneath it changes.
   */
  let shown = $state(PAGE_SIZE);

  const machineName = $derived(
    machineFilter
      ? (rows.find((row) => row.machineId === machineFilter)?.machine ??
          machineFilter)
      : "All machines"
  );
  const stateName = $derived(
    STATES.find((s) => s.value === stateFilter)?.label ?? "All states"
  );
  /** The blocked list only means "nothing needs you" while the socket is live. */
  const hubLive = $derived(whiffle.hub === "connected");
  /** Why the count is unknown, short enough for one line of a phone's tile. */
  const hubNote = $derived(
    whiffle.hub === "unreachable" ? "hub unreachable" : "connecting"
  );

  /**
   * How much of the board has been read, top down: 0 nothing yet; 1 the
   * machines, the live sessions and the queue above the table, with the
   * socket up; 2 every online machine's stored sessions too, which the
   * table sorts in among the live ones by time. Each part stands only once
   * its read is back, over a placeholder of its own that goes when it
   * arrives, so nothing already drawn is pushed down on a cold load. It
   * only rises: a reconnect later does not take the board away.
   */
  const stageNow = () => {
    if (whiffle.hub === "unreachable") {
      return 2;
    }
    if (!(whiffle.fleetRead && workflowState.loaded && hubLive)) {
      return 0;
    }
    return whiffle.catalogsRead ? 2 : 1;
  };
  let stage = $state(untrack(stageNow));
  $effect(() => {
    const next = stageNow();
    if (next > stage) {
      stage = next;
    }
  });
  const sortName = $derived(
    SORTS.find((s) => s.value === sortBy)?.label ?? "Last active"
  );

  const filtered = $derived(
    rows.filter((row) => {
      const needle = query.trim().toLowerCase();
      if (needle && !row.title.toLowerCase().includes(needle)) {
        return false;
      }
      if (machineFilter && row.machineId !== machineFilter) {
        return false;
      }
      if (stateFilter && row.status !== stateFilter) {
        return false;
      }
      return true;
    })
  );

  const sorted = $derived(
    sortBy === "name"
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
      : [...filtered].sort((a, b) => b.rank - a.rank)
  );

  /* A live re-order (a session starts or stops working, arrives or goes)
     can land while rows are still sliding from the last one. A row sent
     back while it is still sliding jumps from where it was half drawn, and
     the page moves under the reader. So a live re-order that lands
     mid-slide waits for the slide to end and a frame at rest, then shows
     the order as it is by then;
     what the reader asks for (a search, a filter, a sort) shows at once. */
  const viewOf = () => `${query}|${machineFilter}|${stateFilter}|${sortBy}`;
  const keysOf = (list: Row[]) => list.map((row) => row.key).join("\n");
  /** The slides the table's rows are still running. */
  const sliding = () =>
    [
      ...(exitLayer?.parentElement?.querySelectorAll<HTMLElement>(
        "tbody tr[data-key]"
      ) ?? []),
    ].flatMap((row) => row.getAnimations());
  let listed = $state.raw(untrack(() => sorted));
  let view = untrack(viewOf);
  $effect(() => {
    const next = sorted;
    const asked = viewOf();
    if (asked !== view || keysOf(next) === keysOf(untrack(() => listed))) {
      view = asked;
      listed = next;
      return;
    }
    let current = true;
    // A slide a newer reflow cancels rejects `finished`: it is over all the
    // same. Then one frame is painted with the rows at rest before they move
    // again (the second rAF runs after it), also when the last slide ended a
    // moment ago: a move measured against a frame still drawn mid-slide
    // jumps, and Chromium counts it as a shift.
    const frame = () =>
      new Promise<number>((done) => requestAnimationFrame(done));
    Promise.allSettled(sliding().map((slide) => slide.finished))
      .then(frame)
      .then(frame)
      .then(() => {
        if (current) {
          listed = untrack(() => sorted);
        }
      });
    return () => {
      current = false;
    };
  });

  /* A filter, a search or a re-sort reflows the table: rows that leave close where
     they were, rows that arrive open, the rest slide, and the table's
     height follows, so nothing under the table jumps (motion/rows). A page
     the scroll brings in does not: its rows land below the reader, in the
     headroom under the board, already laid out. */
  let exitLayer = $state<HTMLElement | null>(null);
  let paging = false;
  const tableRows = tableReflow({
    layer: () => exitLayer,
    rows: "tbody tr[data-key]",
    enabled: () => active && !paging,
  });

  // The list is where the leaving rows are caught: it is recomputed as the
  // table starts to update, the one moment they are still on screen.
  const visible = $derived.by(() => {
    const next = listed.slice(0, shown);
    untrack(() => tableRows(next.map((row) => row.key)));
    paging = false;
    return next;
  });
  const more = $derived(listed.length > visible.length);

  /**
   * The sentinel is watched inside `.board` rather than the viewport — the
   * board is the scroller, so a viewport-rooted observer would never see the
   * bottom of a list that overflows it.
   */
  let boardEl = $state<HTMLElement | null>(null);
  let sentinelEl = $state<HTMLElement | null>(null);
  /** A page of headroom, so the next block is already there by the time the
   *  last row is read rather than arriving after a visible stop. */
  const HEADROOM = 400;

  $effect(() => {
    // `from` captures the count this observer was built against, which is what
    // makes it depend on `shown` and re-arm after every growth. An
    // IntersectionObserver reports CROSSINGS, not states, and only a frame
    // after it is built, so a sentinel already in range is paged here, in the
    // same update: the table the board first draws, and the one each page
    // leaves, already reaches past the board by the headroom, and no page
    // lands under the foot just after it is painted. Each page re-runs this
    // until the sentinel is out of range; from there the observer carries it.
    const from = shown;
    // Not while the board is put away. It keeps its layout there
    // (`visibility: hidden`, so measurements survive), so the sentinel is
    // still intersecting and an unguarded observer would quietly page the
    // whole catalogue in behind a surface nobody is looking at.
    if (!(active && more && boardEl && sentinelEl)) {
      return;
    }
    const nextPage = () => {
      paging = true;
      shown = from + PAGE_SIZE;
    };
    const room = boardEl.getBoundingClientRect();
    const mark = sentinelEl.getBoundingClientRect();
    if (
      mark.top <= room.bottom + HEADROOM &&
      mark.bottom >= room.top - HEADROOM
    ) {
      nextPage();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          nextPage();
        }
      },
      { root: boardEl, rootMargin: `${HEADROOM}px 0px` }
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  });

  /* ---- actions ------------------------------------------------------- */

  let spawnOpen = $state(false);
  let spawnPrefill = $state<{ machineId?: string; cwd?: string } | undefined>(
    undefined
  );

  // "Spawn here" from anywhere else in the app arrives as a query on the board's
  // own URL. It is consumed once and cleared, so a reload is not a second spawn.
  $effect(() => {
    if (!active) {
      return;
    }
    const machineId = page.url.searchParams.get("machine");
    if (!machineId) {
      return;
    }
    spawnPrefill = {
      machineId,
      cwd: page.url.searchParams.get("cwd") ?? undefined,
    };
    spawnOpen = true;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the panel is already open, the URL cleanup is a courtesy
    void goto("/session", { replaceState: true });
  });

  function startSession() {
    spawnPrefill = undefined;
    spawnOpen = true;
  }

  function resume(row: Row) {
    const sessionId = row.instance?.sessionId ?? row.stored?.sessionId;
    if (!sessionId) {
      return;
    }
    const id = resumeSession({
      machineId: row.machineId,
      cwd: row.cwd,
      sessionId,
      harness: row.harness as never,
    });
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the session is already resuming, navigation doesn't need to be awaited
    void goto(conversationHref(id, whiffle.instanceIndex));
  }

  function exportCsv() {
    const head = [
      "Session",
      "Machine",
      "Harness",
      "Turns",
      "Context",
      "Last activity",
      "State",
    ];
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const body = filtered.map((row) =>
      [
        row.title,
        row.machine,
        row.harnessLabel,
        row.turns === null ? "" : String(row.turns),
        row.contextPct === null ? "" : `${Math.round(row.contextPct)}%`,
        row.at ? new Date(row.at).toISOString() : "",
        row.stateLabel,
      ]
        .map(cell)
        .join(",")
    );
    const blob = new Blob([[head.map(cell).join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fleet-sessions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ---- cells --------------------------------------------------------- */

  const contextClass = (pct: number | null): string => {
    if (pct === null) {
      return "";
    }
    if (pct >= 90) {
      return "bad";
    }
    return pct >= 70 ? "warn" : "";
  };

  // The machine-convergence list: a raised card at zero padding, each row
  // drawing its own top hairline.
  const machinesPanelClass =
    "gap-0 overflow-hidden rounded-[var(--radius-lg)] border-0 bg-[var(--surface-raised)] p-0 shadow-[var(--shadow-tile)] mt-[var(--space-8)]";

  // The status column, dressed on ui/badge: a light tint carries the meaning,
  // deepened ink carries the legibility. Idle carries no fill — absence is idle.
  const pillBase =
    "h-[var(--c-pill-h)] gap-[var(--c-pill-gap)] rounded-[var(--radius-pill)] border-transparent px-[10px] [font-size:var(--c-pill-fs)] [font-weight:var(--weight-strong)] whitespace-nowrap";
  const pillTint: Record<PillStatus, string> = {
    live: "bg-[var(--status-live-bg)] text-[var(--status-live-ink)]",
    attn: "bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]",
    fail: "bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]",
    idle: "bg-transparent px-0 text-[var(--ink-muted)]",
  };

  /** The conversation a row opens: the id its link carries. */
  const QUERY_OR_HASH = /[?#]/;
  const sessionOf = (href: string) =>
    href.split("/session/")[1]?.split(QUERY_OR_HASH)[0] ?? "";
</script>

<div class="board" bind:this={boardEl}>
  <!-- What live data moves here (a machine's badges, the queue, the table's
       height, the not-running card) arrives, leaves and slides in place: the
       cards are `data-flip="box"`, so their edges travel too (motion/rows). -->
  <div class="inner" {@attach reflow()}>
    <div class="head">
      <p>Every agent across your machines, and what needs you.</p>
      <Button onclick={startSession}>
        <IconPlus />
        Start session
      </Button>
    </div>

    <div class="stats">
      <StatTile
        label="Sessions"
        value={String(whiffle.runningInstances.length)}
      />

      <!-- Needs you is not a readout. It names this surface's job, so it is the
           control that reaches it (DESIGN.md §Open questions): pressing it
           filters the board down to exactly the sessions it counts.

           And it never says "0" on a guess. whiffle.blocked is only true when
           the socket is live; while the hub is connecting or unreachable an
           empty list means "not read yet", and printing 0 there is a false
           all-clear — the one failure the Switch interview names by hand. -->
      <button
        aria-label={hubLive
          ? `Needs you: ${whiffle.blockedCount}. Show sessions and workflow runs that need you.`
          : `Needs you: unknown while ${hubNote}. Show only sessions that need you.`}
        aria-pressed={stateFilter === 'attn'}
        class="attn-tile"
        onclick={() => {
          stateFilter = stateFilter === 'attn' ? '' : 'attn';
          shown = PAGE_SIZE;
        }}
        type="button"
      >
        <!-- The unit's line stays when the count is live, empty, so the tile
             and its row stand at one height across the connect. -->
        <StatTile
          label="Needs you"
          unit={hubLive ? '' : hubNote}
          value={hubLive ? String(whiffle.blockedCount) : '—'}
        />
      </button>

      <StatTile
        label="Machines"
        unit="of {whiffle.machines.length}"
        value={String(whiffle.onlineMachines.length)}
      />
      <StatTile label="Spend today" value={`$${spend.toFixed(2)}`} />
    </div>

    <!-- Every machine's convergence with the rest of the fleet (leaf C2 —
         .unlazy-liveness/gates/c2.md): the data was always in this frame,
         the Mac's 21-day silence is what happens when nothing renders it.
         Shown above the queue for the same reason the queue sits above the
         roster — this is a fact about the fleet, not about one session. -->
    {#if stage >= 1}
      {#if whiffle.machines.length > 0}
        <!-- MachineCard's badges carry tooltips (Tooltip.Root needs an ancestor
           Provider or it throws on mount — see tools/+page.svelte's own note);
           the board otherwise never needed one, so it is scoped to here. -->
        <Tooltip.Provider>
          <Card.Root class={machinesPanelClass} data-flip="box">
            <ul class="machine-list">
              {#each whiffle.machines as machine (machine.machineId)}
                <MachineCard hubBuild={whiffle.hubBuild} {machine} />
              {/each}
            </ul>
          </Card.Root>
        </Tooltip.Provider>
      {/if}

      <!-- JOURNEY §1 block 3. Everything parked on a human sits above the roster,
         longest wait first, with the answer one tap away — the roster below is
         for choosing a session, this is for unblocking one. It renders itself
         away when nothing is waiting. -->
      <div class="queue">
        <AttentionQueue />
        {#each Object.values(workflowState.runs).filter((run) => run.status === 'waiting') as run (run.id)}
          <a
            class="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] p-3"
            data-flip
            href="/workflows/{run.workflowId}/runs/{run.id}"
            ><span
              >{workflowState.workflows.find((entry) => entry.id === run.workflowId)?.name ?? 'Workflow'}
              · run {run.id.slice(0, 8)}</span
            ><WorkflowStatus status={run.status} /></a
          >
        {/each}
      </div>
    {:else}
      {@render pending(true)}
    {/if}

    {#if stage >= 2}
      <div class="panel" data-flip="box">
        <!-- Only for a load that never read the fleet. Once it has, an outage
             keeps the last-known table here, under the reconnect banner that
             says the hub is gone: swapping the table out and back moved the
             page twice for a state the banner already names. -->
        {#if whiffle.hub === 'unreachable' && !whiffle.fleetRead}
          <EmptyState
            class="px-[var(--space-5)]"
            data-flip
            icon={IconAlert}
            line="Nothing on the fleet can be read until the connection is back."
            title="Can't reach the hub"
          >
            {#snippet action()}
              <Button onclick={() => reconnectNow()} variant="outline"
                >Retry</Button
              >
            {/snippet}
          </EmptyState>
        {:else if whiffle.machines.length === 0}
          <EmptyState
            class="px-[var(--space-5)]"
            data-flip
            icon={IconLaptop}
            title="No machines yet"
          >
            {#snippet line()}
              Run <code>whiffle</code> on a machine and it joins this board by
              itself.
            {/snippet}
          </EmptyState>
        {:else if rows.length === 0}
          <EmptyState
            class="px-[var(--space-5)]"
            data-flip
            icon={IconChat}
            line="Nothing has been started on the {whiffle.onlineMachines.length === 1 ? 'machine' : `${whiffle.onlineMachines.length} machines`} online."
            title="No sessions running"
          >
            {#snippet action()}
              <Button onclick={startSession}>
                <IconPlus />
                Start session
              </Button>
            {/snippet}
          </EmptyState>
        {:else}
          <div class="bar" data-flip>
            <!-- A label, so its touch area around the 36px field focuses it. -->
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: the kit Input renders the native <input> this label wraps -->
            <label class="search touch-hit">
              <span class="lead"><IconSearch /></span>
              <Input
                aria-label="Search sessions"
                class="search-input"
                oninput={searchTyped}
                placeholder="Search sessions…"
                bind:value={search}
              />
            </label>

            <Select.Root
              onValueChange={(v) => {
              machineFilter = v === 'all' ? '' : v;
              shown = PAGE_SIZE;
            }}
              type="single"
              value={machineFilter || 'all'}
            >
              <Select.Trigger class="min-w-[168px]"
                >{machineName}</Select.Trigger
              >
              <Select.Content>
                <Select.Item label="All machines" value="all"
                  >All machines</Select.Item
                >
                {#each whiffle.machines as m (m.machineId)}
                  <Select.Item
                    label={machineLabel(m.hostname)}
                    value={m.machineId}
                  >
                    {machineLabel(m.hostname)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>

            <Select.Root
              onValueChange={(v) => {
              stateFilter = (v === 'all' ? '' : v) as PillStatus | '';
              shown = PAGE_SIZE;
            }}
              type="single"
              value={stateFilter || 'all'}
            >
              <Select.Trigger class="min-w-[140px]">{stateName}</Select.Trigger>
              <Select.Content>
                {#each STATES as s (s.label)}
                  <Select.Item label={s.label} value={s.value || 'all'}
                    >{s.label}</Select.Item
                  >
                {/each}
              </Select.Content>
            </Select.Root>

            <Select.Root
              onValueChange={(v) => {
              sortBy = v as 'recent' | 'name';
            }}
              type="single"
              value={sortBy}
            >
              <Select.Trigger class="min-w-[150px]">{sortName}</Select.Trigger>
              <Select.Content>
                {#each SORTS as s (s.value)}
                  <Select.Item label={s.label} value={s.value}
                    >{s.label}</Select.Item
                  >
                {/each}
              </Select.Content>
            </Select.Root>

            <Button
              class="ml-auto max-[900px]:ml-0"
              onclick={exportCsv}
              variant="outline"
            >
              <IconDownload />
              Export CSV
            </Button>
          </div>

          <div class="tbl" data-flip>
            <div aria-hidden="true" class="exits" bind:this={exitLayer}></div>
            <Table.Root class="live" ghostRows="tbody tr">
              <Table.Header>
                <Table.Row>
                  <Table.Head class="c-name">Session</Table.Head>
                  <Table.Head class="c-mach">Machine</Table.Head>
                  <Table.Head class="c-harn">Harness</Table.Head>
                  <Table.Head class="num c-turns">Turns</Table.Head>
                  <Table.Head class="num c-ctx">Context</Table.Head>
                  <Table.Head class="c-when">Last activity</Table.Head>
                  <Table.Head class="c-state">State</Table.Head>
                  <Table.Head class="c-act">Action</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each visible as row (row.key)}
                  <!-- A session that changes state re-sorts; it slides to its new place
                     rather than swapping rows under the reader's eye. A row a
                     filter brings back opens as the rows below make room. -->
                  <tr
                    class="border-b transition-colors"
                    data-flip-anchor
                    data-key={row.key}
                    data-share="pane:{sessionOf(row.href)}"
                    data-slot="table-row"
                  >
                    <Table.Cell class="c-name">
                      <div class="nm">
                        <span aria-hidden="true" class="mark m{row.hue}">
                          <HarnessGlyph harness={row.harness} />
                        </span>
                        <a
                          class="touch-hit pointer-hit pressable"
                          href={row.href}
                          ><span class="nm-title">{row.title}</span></a
                        >
                      </div>
                    </Table.Cell>
                    <Table.Cell class="mut c-mach">{row.machine}</Table.Cell>
                    <Table.Cell class="mut c-harn"
                      >{row.harnessLabel}</Table.Cell
                    >
                    <Table.Cell class="num c-turns"
                      >{row.turns ?? '—'}</Table.Cell
                    >
                    <Table.Cell
                      class={cn('num c-ctx', contextClass(row.contextPct))}
                    >
                      {row.contextPct === null ? '—' : `${Math.round(row.contextPct)}%`}
                    </Table.Cell>
                    <Table.Cell class="c-when">
                      <span class="when">
                        <IconHistory />
                        {row.at ? formatDistanceToNow(new Date(row.at)) : '—'}
                      </span>
                    </Table.Cell>
                    <!-- A session changing state pops its new chip in over the
                         old; on a phone the cell sits after the name and
                         slides as its width changes (motion/rows). -->
                    <Table.Cell class="c-state" data-flip>
                      {#key row.stateLabel}
                        <Badge
                          class={cn(pillBase, pillTint[row.status])}
                          data-flip="pop"
                          >{row.stateLabel}</Badge
                        >
                      {/key}
                    </Table.Cell>
                    <Table.Cell class="c-act">
                      <div class="act">
                        <Button
                          aria-label="Open {row.title}"
                          href={row.href}
                          size="icon-sm"
                          variant="outline"
                        >
                          <IconExternal />
                        </Button>
                        {#if row.instance}
                          {@const instance = row.instance}
                          <Button
                            aria-label="Peek {row.title}"
                            onclick={() => setPeeked(instance.id)}
                            size="icon-sm"
                            variant="outline"
                          >
                            <IconMaximize />
                          </Button>
                        {/if}
                        {#if row.stored || (row.instance && isResumable(row.instance))}
                          <Button
                            aria-label="Resume {row.title}"
                            onclick={() => resume(row)}
                            size="icon-sm"
                            variant="outline"
                          >
                            <IconPlay />
                          </Button>
                        {/if}
                      </div>
                    </Table.Cell>
                  </tr>
                {/each}
              </Table.Body>
            </Table.Root>
            <!-- The scroll target. It sits after the table but inside the
               scroller, so reaching it means the last row has been reached. It
               is kept in the tree even when the list is fully shown: removing it
               would tear down the observer, and the next filter that widens the
               list would have nothing left to watch. It is inside the table's
               box, so while that box morphs to a new height it is clipped with
               the rows and does not read as reached before they are laid out. -->
            <div class="sentinel" bind:this={sentinelEl}>
              {#if more}
                <span class="sr-only" role="status">Loading more sessions</span>
              {/if}
            </div>
          </div>

          <div class="foot" data-flip>
            Showing {visible.length} of {filtered.length}
          </div>
        {/if}
      </div>

      <!-- Asleep and unreachable rows never reach the roster above (it is
         `runningInstances` only, by design — see the Sessions stat), so a
         sleeping or unknown session would otherwise be absent from the whole
         board. Shown apart, never folded into live work or its counts. -->
      {#if notRunning.length > 0}
        {@const CAP = 20}
        {@const capped = showAllNotRunning ? notRunning : notRunning.slice(0, CAP)}
        <div class="not-running" data-flip="box">
          <div class="nr-head">
            <span class="nr-count"
              >Not running ·
              {#key notRunning.length}
                <span data-flip="pop">{notRunning.length}</span>
              {/key}</span
            >
            {#if latestNotRunning}
              <span class="nr-hint">
                {latestTitle}
                {#if rowTime(latestNotRunning) > 0}
                  · {formatDistanceToNow(new Date(rowTime(latestNotRunning)))}
                {/if}
              </span>
            {/if}
            <Button
              aria-expanded={notRunningOpen}
              class="ml-auto"
              onclick={toggleNotRunning}
              size="sm"
              variant="outline"
            >
              {notRunningOpen ? 'Hide' : 'Show'}
            </Button>
          </div>
          {#if notRunningOpen}
            <div
              class="not-running-rows"
              data-flip
              {@attach highlight({ rows: "a" })}
            >
              {#each capped as row (row.id)}
                <div class="nr-row" data-flip>
                  <LiveSessionRow instance={row} />
                </div>
              {/each}
            </div>
            {#if !showAllNotRunning && notRunning.length > CAP}
              <button
                class="show-all"
                data-flip
                onclick={() => {
                showAllNotRunning = true;
              }}
                type="button"
              >
                Show all {notRunning.length} sessions
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    {:else if stage === 1}
      {@render pending(false)}
    {/if}
  </div>
</div>

{#snippet pending(machines: boolean)}
  <!-- Where the parts still being read will stand: the machines and the
       table while nothing is back, the table alone once the machines are. -->
  <div aria-busy="true" aria-label="Loading the fleet" data-flip role="status">
    {#if machines}
      <Skeleton
        class="mt-[var(--space-8)] h-[88px] w-full rounded-[var(--radius-lg)]"
      />
    {/if}
    <div class="panel pending-table">
      <Skeleton class="h-9 w-[237px] max-w-full" />
      {#each [0, 1, 2, 3, 4, 5, 6, 7] as row (row)}
        <Skeleton class="h-10 w-full" />
      {/each}
    </div>
  </div>
{/snippet}

<NewSessionDialog
  onclose={() => {
    spawnOpen = false;
  }}
  open={spawnOpen}
  prefill={spawnPrefill}
/>

<style>
  .board {
    flex: 1 1 auto;
    min-width: 0;
    overflow: auto;
    background: var(--surface-recess);
  }
  .inner {
    padding: 0 var(--space-6) var(--space-7) var(--space-7);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6) 0 var(--space-5);
  }
  .head p {
    margin-right: auto;
    min-width: 0;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-4);
  }

  /* The Needs-you tile is a real button wrapping the same card, so it keeps
     the grid cell's geometry and picks up keyboard focus for free. */
  .attn-tile {
    display: block;
    height: 100%;
    text-align: left;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: var(--radius-lg);
    @media (prefers-reduced-motion: no-preference) {
      transition: transform 160ms var(--ease-out);
    }
  }
  .attn-tile:active {
    transform: scale(var(--press-scale));
  }
  .attn-tile :global(.st-card) {
    transition: var(--transition-control);
  }
  .attn-tile:hover :global(.st-card) {
    background: var(--surface-hover);
  }
  .attn-tile[aria-pressed="true"] :global(.st-card) {
    background: var(--status-attn-bg);
  }
  .attn-tile[aria-pressed="true"] :global(.st-value) {
    color: var(--status-attn-ink);
  }

  /* The wrapper is layout-transparent, so an empty queue leaves no gap behind:
     the spacing belongs to the card, which only exists when something waits. */
  .queue {
    display: contents;
  }
  .queue > :global(*) {
    margin-top: var(--space-8);
  }

  .pending-table {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .panel {
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    margin-top: var(--space-8);
    padding: var(--space-3);
    box-shadow: var(--shadow-tile);
  }

  .machine-list {
    display: flex;
    flex-direction: column;
  }

  /* Asleep/unreachable rows, kept in their own well rather than the roster's
     table — that roster is `runningInstances` by design (the Sessions stat
     above it counts the same set), so this is a second, clearly separate
     surface rather than a state this board's live table can also carry. */
  .not-running {
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    margin-top: var(--space-8);
    padding: var(--space-3);
    box-shadow: var(--shadow-tile);
  }
  .nr-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: 0 var(--space-2) 0 1rem;
  }
  .nr-count {
    flex: none;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .nr-hint {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The list mounts on Show; rows fade in, nothing animates height. */
  .nr-row {
    animation: nr-in var(--dur-exit) var(--ease-out) both;
  }
  @keyframes nr-in {
    from {
      opacity: 0;
    }
  }

  .not-running-rows {
    display: flex;
    flex-direction: column;
    margin-top: var(--space-2);
  }
  .show-all {
    padding: var(--space-3) var(--space-4);
    font: var(--type-label);
    color: var(--ink-muted);
    background: none;
    border: 1px dashed var(--border-hairline);
    border-radius: var(--radius-sm);
    cursor: pointer;
    margin-top: var(--space-2);
  }
  .show-all:hover {
    color: var(--ink-strong);
    border-color: var(--border-control);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
  }
  .search {
    position: relative;
    display: block;
    width: 237px;
  }
  .search .lead {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    pointer-events: none;
  }
  .search .lead :global(svg) {
    width: 16px;
    height: 16px;
  }
  .search :global(.search-input) {
    padding-left: calc(var(--space-3) + 16px + var(--space-2));
  }

  /* The table's box: the layer rows fold away in (motion/rows) sits at its
     corner, and its height morphs as rows come and go. */
  .tbl {
    position: relative;
  }
  /* The table never outgrows its panel (fixed layout, below), so its box
     does not scroll sideways; left to the kit's overflow-x it would clip
     the rows sliding in from past its new end. While the table's height
     morphs, .tbl clips at the height it is drawn at. */
  .tbl :global([data-slot="table-container"]) {
    overflow: visible;
  }
  .exits {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
  }

  /* ui/table, dressed as the ledger grid */
  .tbl :global([data-slot="table-head"]) {
    height: var(--space-8);
    padding: 0 var(--space-3);
    background: var(--surface-recess);
    text-align: left;
    white-space: nowrap;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
    vertical-align: middle;
  }
  .tbl :global([data-slot="table-head"]:first-child) {
    border-radius: var(--radius-xs) 0 0 var(--radius-xs);
  }
  .tbl :global([data-slot="table-head"]:last-child) {
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  }
  /* Fixed layout: the name column takes what the fixed columns leave and
     truncates, so the table never outgrows its panel. */
  .tbl :global(table.live) {
    table-layout: fixed;
    width: 100%;
    /* Separate borders: each cell draws its own hairline, so the rule
       travels with its row when the row slides. Collapsed borders are
       drawn by the table and stay behind. */
    border-collapse: separate;
    border-spacing: 0;
  }
  .tbl :global(.c-name) {
    width: 100%;
    max-width: 0;
  }
  .tbl :global(.c-mach) {
    width: 140px;
  }
  .tbl :global(.c-harn) {
    width: 110px;
  }
  .tbl :global(.c-turns) {
    width: 64px;
  }
  .tbl :global(.c-ctx) {
    width: 76px;
  }
  .tbl :global(.c-when) {
    width: 132px;
  }
  .tbl :global(.c-state) {
    width: 124px;
  }
  .tbl :global(.c-act) {
    width: 124px;
  }
  .tbl :global(.c-mach),
  .tbl :global(.c-harn) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tbl :global([data-slot="table-header"] tr),
  .tbl :global([data-slot="table-row"]) {
    border-bottom: 0;
  }
  .tbl :global(tbody [data-slot="table-cell"]) {
    height: 44px;
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--border-hairline);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-strong);
    vertical-align: middle;
  }
  .tbl :global(tbody tr:last-child [data-slot="table-cell"]) {
    border-bottom: 0;
  }
  .tbl :global(.num) {
    font-variant-numeric: tabular-nums;
  }
  .tbl :global(.mut) {
    color: var(--ink-muted);
  }
  .tbl :global(.warn) {
    color: var(--data-warn);
  }
  .tbl :global(.bad) {
    color: var(--data-bad);
  }

  .mark {
    width: var(--c-mark);
    height: var(--c-mark);
    border-radius: var(--radius-xs);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  /* biome-ignore lint/style/noDescendingSpecificity: never matches the same element as .search .lead :global(svg) — different subtree */
  .mark :global(svg) {
    width: var(--c-mark-glyph);
    height: var(--c-mark-glyph);
    display: block;
    color: var(--mark-glyph);
  }
  .mark.m2 {
    background-color: var(--mark-2);
  }
  .mark.m3 {
    background-color: var(--mark-3);
  }
  .mark.m4 {
    background-color: var(--mark-4);
  }
  .mark.m5 {
    background-color: var(--mark-5);
  }
  .mark.m6 {
    background-color: var(--mark-6);
  }
  .mark.m7 {
    background-color: var(--mark-7);
  }
  .mark.m8 {
    background-color: var(--mark-8);
  }

  .nm {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  /* The title span carries the ellipsis, so the link itself does not clip
     its touch area. */
  .nm a {
    display: flex;
    min-width: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .nm-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm a:hover {
    text-decoration: underline;
  }
  .when {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  /* biome-ignore lint/style/noDescendingSpecificity: never matches the same element as .search .lead :global(svg) — different subtree */
  .when :global(svg) {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
  }
  /* 30px buttons: on a coarse pointer the gap opens to 14px, so each touch
     area reaches 44px before meeting its neighbour's. */
  .act {
    --hit-gap-x: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-2);

    @media (pointer: coarse) {
      --hit-gap-x: 14px;
      gap: 14px;
    }
  }

  .sentinel {
    height: 1px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 55px;
    padding: 0 var(--space-3);
    border-top: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  @media (max-width: 900px) {
    .inner {
      padding: 0 var(--space-4) var(--space-8);
    }
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .bar {
      flex-wrap: wrap;
    }
    .search {
      width: 100%;
    }
  }
  /* Phones: each session is a stacked row — name with its state chip on the
     first line, where and when beneath, actions at the end. */
  @media (max-width: 639px) {
    .tbl :global(table.live),
    .tbl :global(table.live tbody) {
      display: block;
    }
    .tbl :global(table.live thead) {
      display: none;
    }
    .tbl :global(table.live tbody tr) {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
    }
    .tbl :global(table.live tbody tr:last-child) {
      border-bottom: 0;
    }
    .tbl :global(table.live tbody [data-slot="table-cell"]) {
      display: block;
      width: auto;
      max-width: none;
      height: auto;
      padding: 0;
      border: 0;
    }
    .tbl :global(table.live tbody .c-name) {
      flex: 1 1 0;
      min-width: 0;
    }
    .tbl :global(table.live tbody .c-state) {
      flex: 0 0 auto;
    }
    .tbl :global(table.live tbody .c-mach) {
      flex-basis: 100%;
      order: 1;
      padding-left: calc(var(--c-mark) + var(--space-3));
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
    }
    .tbl :global(table.live tbody .c-harn),
    .tbl :global(table.live tbody .c-turns),
    .tbl :global(table.live tbody .c-ctx) {
      display: none;
    }
    .tbl :global(table.live tbody .c-when) {
      order: 2;
      padding-left: calc(var(--c-mark) + var(--space-3));
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
    }
    .tbl :global(table.live tbody .c-act) {
      order: 3;
      margin-left: auto;
    }
  }
</style>
