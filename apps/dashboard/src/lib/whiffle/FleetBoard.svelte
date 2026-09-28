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
  import { TextMorph } from "torph/svelte";
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import WorkflowStatus from "$lib/components/features/workflows/WorkflowStatus.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import PendingContent from "$lib/components/ui/button/pending-content.svelte";
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
    IconServer,
    IconWarningTriangle,
  } from "$lib/icons";
  import { cn } from "$lib/utils";
  import { formatDistanceToNow } from "$lib/utils/time";
  import AttentionQueue from "$lib/whiffle/AttentionQueue.svelte";
  import { addMachine } from "$lib/whiffle/join/join.svelte";
  import LiveSessionRow from "$lib/whiffle/LiveSessionRow.svelte";
  import MachineCard from "$lib/whiffle/MachineCard.svelte";
  import {
    CURVE,
    crossIn,
    crossOut,
    dur,
  } from "$lib/whiffle/motion/curves.svelte";
  import { reflow, tableReflow } from "$lib/whiffle/motion/rows.svelte";
  import { handOver } from "$lib/whiffle/motion/share.svelte";
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
  import ErrorText from "./ErrorText.svelte";
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

  /* The filters live in the board's address (?q=&state=&machine=&sort=), so
     a reload or a way back lands on the same board. They are read from it
     once, as the board is made, and written back as they change, in place
     (replaceState): typing a search adds no history. */
  const inUrl = untrack(() => page.url.searchParams);
  let search = $state(inUrl.get("q") ?? "");
  /**
   * What the list is filtered by: the field's text, 80ms after the last
   * keystroke, so a burst of typing reflows the table once rather than
   * once per letter.
   */
  let query = $state(untrack(() => search));
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
  let machineFilter = $state(inUrl.get("machine") ?? "");
  const STATES: { value: PillStatus | ""; label: string }[] = [
    { value: "", label: "All states" },
    { value: "live", label: "Working" },
    { value: "attn", label: "Needs you" },
    { value: "idle", label: "Idle" },
  ];
  let stateFilter = $state<PillStatus | "">(
    STATES.find((entry) => entry.value === inUrl.get("state"))?.value ?? ""
  );
  const SORTS: { value: "recent" | "name"; label: string }[] = [
    { value: "recent", label: "Last active" },
    { value: "name", label: "Name (A–Z)" },
  ];
  let sortBy = $state<"recent" | "name">(
    SORTS.find((entry) => entry.value === inUrl.get("sort"))?.value ?? "recent"
  );

  $effect(() => {
    const next = new URLSearchParams();
    if (query) {
      next.set("q", query);
    }
    if (stateFilter) {
      next.set("state", stateFilter);
    }
    if (machineFilter) {
      next.set("machine", machineFilter);
    }
    if (sortBy !== "recent") {
      next.set("sort", sortBy);
    }
    if (!active) {
      return;
    }
    untrack(() => {
      const url = new URL(page.url);
      if (url.pathname !== "/session" || url.search === withQuery(next)) {
        return;
      }
      url.search = next.toString();
      replaceState(url, page.state);
    });
  });
  const withQuery = (params: URLSearchParams) =>
    params.size > 0 ? `?${params}` : "";

  /** Every filter back to all, and the search emptied. */
  function clearFilters() {
    clearTimeout(searchTimer);
    search = "";
    query = "";
    machineFilter = "";
    stateFilter = "";
    shown = PAGE_SIZE;
  }
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
   * Whether the board has had its first full read: the machines, the live
   * sessions, the queue and every online machine's stored sessions, with
   * the socket up (or the hub known to be unreachable). Until then a
   * skeleton stands at the board's final size, and the board replaces it
   * all at once, cross-fading in place, so nothing drawn is pushed down on
   * a cold load. It only rises: a reconnect later does not take the board
   * away.
   */
  const readNow = () =>
    whiffle.hub === "unreachable" ||
    (whiffle.fleetRead &&
      workflowState.loaded &&
      hubLive &&
      whiffle.catalogsRead);
  let ready = $state(untrack(readNow));
  $effect(() => {
    if (readNow()) {
      ready = true;
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

  /* A filter, a search, a re-sort or the next page reflows the table: rows
     that leave close where they were, rows that arrive open (a page the
     scroll brings in fades in at the end, below the reader), the rest
     slide, and the table's height follows, so nothing under the table
     jumps (motion/rows). */
  let exitLayer = $state<HTMLElement | null>(null);
  const tableRows = tableReflow({
    layer: () => exitLayer,
    rows: "tbody tr[data-key]",
    enabled: () => active,
  });

  // The list is where the leaving rows are caught: it is recomputed as the
  // table starts to update, the one moment they are still on screen.
  const visible = $derived.by(() => {
    const next = listed.slice(0, shown);
    untrack(() => tableRows(next.map((row) => row.key)));
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

  // "Spawn here" from anywhere else in the app arrives as `?spawn=<machine>`
  // on the board's own URL (`machine` is the board's filter). It is consumed
  // once and cleared, so a reload is not a second spawn.
  $effect(() => {
    if (!active) {
      return;
    }
    const machineId = page.url.searchParams.get("spawn");
    if (!machineId) {
      return;
    }
    spawnPrefill = {
      machineId,
      cwd: page.url.searchParams.get("cwd") ?? undefined,
    };
    spawnOpen = true;
    const url = new URL(page.url);
    url.searchParams.delete("spawn");
    url.searchParams.delete("cwd");
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the panel is already open, the URL cleanup is a courtesy
    void goto(url, { replaceState: true });
  });

  function startSession() {
    spawnPrefill = undefined;
    spawnOpen = true;
  }

  /** The row whose resume is running, and why a row's last resume failed. */
  let resuming = $state<string | null>(null);
  let resumeFailed = $state<Record<string, string>>({});

  /**
   * Resumes the row's session and opens it: the button spins until its tab
   * is up, and the row flies into that tab (the row departed on the click,
   * as `pane:<its id>`; the new session's tab lands it). A failure is said
   * on the row.
   */
  async function resume(row: Row) {
    const sessionId = row.instance?.sessionId ?? row.stored?.sessionId;
    if (!sessionId) {
      return;
    }
    resuming = row.key;
    resumeFailed = Object.fromEntries(
      Object.entries(resumeFailed).filter(([key]) => key !== row.key)
    );
    try {
      const id = resumeSession({
        machineId: row.machineId,
        cwd: row.cwd,
        sessionId,
        harness: row.harness as never,
      });
      handOver(`pane:${sessionOf(row.href)}`, `session:${id}`);
      await goto(conversationHref(id, whiffle.instanceIndex));
    } catch (error) {
      resumeFailed = {
        ...resumeFailed,
        [row.key]: error instanceof Error ? error.message : String(error),
      };
    } finally {
      resuming = null;
    }
  }

  /** The export button spins for the frame the file is made in, then holds
   *  its check for --dur-hold (the kit's pending mechanism). */
  let exporting = $state(false);
  async function exportCsv() {
    exporting = true;
    await new Promise((done) => requestAnimationFrame(done));
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
    exporting = false;
  }

  /* ---- cells --------------------------------------------------------- */

  /**
   * TextMorph draws its text only in the browser, so the server draws the
   * words as plain text and the morph takes over once the board is live.
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });

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
  <!-- The reflow starts with the board: the first read replaces the
       skeleton in one cross-fade, not as rows arriving. -->
  <div class="inner" {@attach ready ? reflow() : undefined}>
    <div class="head">
      <p>Every agent across your machines, and what needs you.</p>
      <Button onclick={() => addMachine.show()} variant="outline">
        <IconServer />
        Add machine
      </Button>
      <Button onclick={startSession}>
        <IconPlus />
        Start session
      </Button>
    </div>

    {#if ready}
      <div class="loaded" in:crossIn>
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
              line="The board can't read the fleet until the hub answers. Check that the hub is running, then retry."
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
              line="Your machines and the agents running on them show here. Add one to start a session on it."
              title="No machines yet"
            >
              {#snippet action()}
                <Button onclick={() => addMachine.show()}>
                  <IconServer />
                  Add machine
                </Button>
              {/snippet}
            </EmptyState>
          {:else if rows.length === 0}
            <EmptyState
              class="px-[var(--space-5)]"
              data-flip
              icon={IconChat}
              line="None of the {whiffle.onlineMachines.length === 1 ? 'machine' : `${whiffle.onlineMachines.length} machines`} online has a session yet. Start one and it shows here."
              title="No sessions yet"
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
                <Select.Trigger class="min-w-[140px]"
                  >{stateName}</Select.Trigger
                >
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
                <Select.Trigger class="min-w-[150px]"
                  >{sortName}</Select.Trigger
                >
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
                icon={IconDownload}
                label="Export CSV"
                onclick={exportCsv}
                pending={exporting}
                variant="outline"
              />
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
                          <a class="touch-hit pointer-hit" href={row.href}
                            ><span class="nm-title">{row.title}</span></a
                          >
                          {#if resumeFailed[row.key]}
                            <span class="nm-failed" data-flip="pop">
                              <ErrorText
                                message={resumeFailed[row.key]}
                                title="Couldn't resume {row.title}"
                                ><IconWarningTriangle />
                                <span class="truncate"
                                  >Couldn't resume:
                                  {resumeFailed[row.key]}</span
                                ></ErrorText
                              >
                            </span>
                          {/if}
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
                        {#if morphMs}
                          <TextMorph
                            as="span"
                            duration={morphMs}
                            ease={CURVE.out}
                            text={row.contextPct === null ? '—' : `${Math.round(row.contextPct)}%`}
                          />
                        {:else}
                          {row.contextPct === null ? '—' : `${Math.round(row.contextPct)}%`}
                        {/if}
                      </Table.Cell>
                      <Table.Cell class="c-when">
                        <span class="when">
                          <IconHistory />
                          {row.at ? formatDistanceToNow(new Date(row.at)) : '—'}
                        </span>
                      </Table.Cell>
                      <!-- A session changing state keeps its chip: the tint turns and
                           the words morph, the width following them. -->
                      <Table.Cell class="c-state" data-flip>
                        <Badge
                          class={cn(pillBase, pillTint[row.status])}
                          data-status={row.status}
                        >
                          {#if morphMs}
                            <TextMorph
                              as="span"
                              duration={morphMs}
                              ease={CURVE.out}
                              text={row.stateLabel}
                            />
                          {:else}
                            {row.stateLabel}
                          {/if}
                        </Badge>
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
                              class="[--btn-icon:16px]"
                              onclick={() => resume(row)}
                              pending={resuming === row.key}
                              size="icon-sm"
                              variant="outline"
                            >
                              <PendingContent
                                failed={row.key in resumeFailed}
                                icon={IconPlay}
                                pending={resuming === row.key}
                              />
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
                  <span class="sr-only" role="status"
                    >Loading more sessions</span
                  >
                {/if}
              </div>
            </div>
            {#if filtered.length === 0}
              <!-- Sessions exist, but the search and filters leave none. -->
              <EmptyState
                class="px-[var(--space-5)]"
                data-flip
                icon={IconSearch}
                line="No session matches the search and filters. Clear them to see every session."
                title="No sessions match"
              >
                {#snippet action()}
                  <Button onclick={clearFilters} variant="outline"
                    >Clear filters</Button
                  >
                {/snippet}
              </EmptyState>
            {/if}

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
                {#if morphMs}
                  <TextMorph
                    as="span"
                    class="num"
                    duration={morphMs}
                    ease={CURVE.out}
                    text={String(notRunning.length)}
                  />
                {:else}
                  <span class="num">{notRunning.length}</span>
                {/if}</span
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
                label={notRunningOpen ? 'Hide' : 'Show'}
                onclick={toggleNotRunning}
                size="sm"
                variant="outline"
              />
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
      </div>
    {:else}
      {@render skeleton()}
    {/if}
  </div>
</div>

{#snippet skeleton()}
  <!-- Where the board will stand, at its size, until its first read is back:
       the four figures, two machine rows and a page of table rows. It leaves
       pinned where it stands (crossOut) as the board cross-fades in over it. -->
  <div
    aria-busy="true"
    aria-label="Loading the fleet"
    role="status"
    out:crossOut
  >
    <div class="stats">
      {#each [0, 1, 2, 3] as tile (tile)}
        <Skeleton
          class="h-[113px] rounded-[var(--radius-lg)] max-[900px]:h-[112px]"
        />
      {/each}
    </div>
    <div class="sk-machines">
      {#each [0, 1] as machine (machine)}
        <div class="sk-machine"><Skeleton class="h-6 w-[180px]" /></div>
      {/each}
    </div>
    <div class="panel">
      <div class="bar">
        <Skeleton class="h-9 w-[237px] max-[900px]:w-full" />
        <Skeleton class="h-9 w-[168px]" />
        <Skeleton class="h-9 w-[140px]" />
        <Skeleton class="h-9 w-[150px]" />
        <Skeleton class="ml-auto h-9 w-[124px] max-[900px]:ml-0" />
      </div>
      <div class="sk-head"></div>
      {#each Array.from({ length: PAGE_SIZE }, (_, i) => i) as row (row)}
        <div class="sk-row"><Skeleton class="h-4 w-full max-w-[420px]" /></div>
      {/each}
      <div class="sk-foot"><Skeleton class="h-4 w-[120px]" /></div>
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
  /* Positioned from the start: the skeleton is pinned in it as it leaves. */
  .inner {
    /* A phone's two-line row, which its skeleton rows stand at. */
    --phone-row: 83px;
    position: relative;
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
  /* Two actions leave a phone no room for the line beside them: it takes its
     own row and the actions sit under it. */
  @media (max-width: 639px) {
    .head {
      flex-wrap: wrap;
    }
    .head p {
      flex-basis: 100%;
    }
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
  /* A card, so the press is the tint .press-tint gives (app.css), drawn on
     the card inside, since the button itself paints nothing. After the hover
     and chosen fills so it wins over both. */
  .attn-tile:active :global(.st-card) {
    background-color: var(--surface-fill);
  }

  /* The wrapper is layout-transparent, so an empty queue leaves no gap behind:
     the spacing belongs to the card, which only exists when something waits. */
  .queue {
    display: contents;
  }
  .queue > :global(*) {
    margin-top: var(--space-8);
  }

  /* The skeleton's parts, each the size of what it stands for. */
  .sk-machines {
    margin-top: var(--space-8);
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .sk-machine {
    padding: var(--space-3) var(--space-4);
  }
  .sk-machine + .sk-machine {
    border-top: 1px solid var(--border-hairline);
  }
  .sk-head {
    height: var(--space-8);
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
  }
  .sk-row {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: 44px;
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--border-hairline);
  }
  .sk-foot {
    display: flex;
    align-items: center;
    height: 55px;
    padding: 0 var(--space-3);
    border-top: 1px solid var(--border-hairline);
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
  /* A context share crossing a band turns colour rather than cutting. */
  .tbl :global(.c-ctx) {
    transition: color var(--dur-panel) var(--ease-out);
  }
  /* A state chip changing turns its tint (idle carries none) as its words
     morph. */
  .tbl :global(.c-state [data-slot="badge"]) {
    transition:
      background-color var(--dur-panel) var(--ease-out),
      color var(--dur-panel) var(--ease-out),
      padding var(--dur-panel) var(--ease-out);
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
  /* A resume that failed, said on its row; the line opens the whole error. */
  .nm-failed {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    font: var(--type-meta);
    color: var(--destructive);
  }
  .nm-failed :global(button) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  /* biome-ignore lint/style/noDescendingSpecificity: never matches the same element as .search .lead :global(svg) — different subtree */
  .nm-failed :global(svg) {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
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
  /* Phones: each session is a two-line card row: its title across the row,
     then machine · state · age, with its actions at the end. Nothing is
     wider than the phone, so nothing scrolls sideways. */
  @media (max-width: 639px) {
    .tbl :global(table.live),
    .tbl :global(table.live tbody) {
      display: block;
    }
    .tbl :global(table.live thead) {
      display: none;
    }
    /* The second line keeps to one line: the machine's name gives way
       (ellipsis) before anything wraps. */
    .tbl :global(table.live tbody tr) {
      display: grid;
      grid-template-columns: minmax(0, max-content) max-content max-content 1fr;
      align-items: center;
      gap: var(--space-1) var(--space-2);
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
      grid-row: 1;
      grid-column: 1 / -1;
      min-width: 0;
    }
    .tbl :global(table.live tbody .c-mach) {
      grid-row: 2;
      grid-column: 1;
      min-width: 0;
      padding-left: calc(var(--c-mark) + var(--space-3));
    }
    .tbl :global(table.live tbody .c-state),
    .tbl :global(table.live tbody .c-when) {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      grid-row: 2;
    }
    .tbl :global(table.live tbody .c-state) {
      grid-column: 2;
    }
    .tbl :global(table.live tbody .c-when) {
      grid-column: 3;
    }
    .tbl :global(table.live tbody .c-state::before),
    .tbl :global(table.live tbody .c-when::before) {
      content: "·";
      color: var(--ink-muted);
    }
    .tbl :global(table.live tbody .c-harn),
    .tbl :global(table.live tbody .c-turns),
    .tbl :global(table.live tbody .c-ctx) {
      display: none;
    }
    .tbl :global(table.live tbody .c-act) {
      grid-row: 2;
      grid-column: 4;
      justify-self: end;
    }
    .sk-head {
      display: none;
    }
    .sk-row {
      height: var(--phone-row);
    }
  }
</style>
