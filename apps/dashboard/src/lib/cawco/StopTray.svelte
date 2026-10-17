<script lang="ts" module>
  import type { RunningSession } from "./client.svelte";
  import { failureWords } from "./hub-read";

  /** Where a tray stands. */
  export type StopPhase =
    "none" | "list" | "armed" | "stopping" | "fail" | "ending" | "done";

  /** What a tray says in each state; its caller's words (WORDS.md). */
  export interface StopWords {
    /** The second press: "Stop 3 mid-turn and forget". */
    armed: (n: number) => string;
    /** The confirm's word once it has run. */
    ended: string;
    /** The confirm's word while the stops land and the tray's own end runs. */
    ending: string;
    /** The line under the title, in each state; `done` is what the stops did. */
    line: (phase: StopPhase, n: number, done: string) => string;
    /** The tray closed part-way: "Stopped 1 of 3; site kept." */
    partway: (stopped: number, total: number) => string;
    /** The plain question's confirm, with nothing running: "Forget". */
    plain: string;
    /** The first press: "Stop 3 and forget". */
    stop: (n: number) => string;
    title: string;
  }

  /** A listed session, and how its row reads: its title and where it opens. */
  export interface StopRowView {
    href?: string;
    title?: string;
  }

  export type StopSession = RunningSession;
</script>

<script lang="ts">
  /**
   * The running-sessions tray: one tray that changes shape as a stop goes,
   * never a second dialog (Family, benji.org/family-values: trays that
   * "expand, contract, and adapt"). It stands in the page under whatever
   * asked for it, unfolding there (DESIGN.md, The Open Page Rule): no scrim,
   * nothing held, the page live around it. Pressing something else while it
   * stands breaks nothing: each stop is the hub's to confirm, and the end
   * the hub refuses while anything still runs is said here. Cancel or
   * Escape puts it away.
   *
   * With nothing running it is the plain question: the caller's end, its
   * ended word held in place, then gone.
   *
   * With sessions running it lists them as the rail nests them (each lead
   * with its delegates), and asks twice on one button: "Stop 3 and …", then
   * "Stop 3 mid-turn and …", its words growing the warning in place. The
   * second press stops them all in one request (`stop`). A row turns Stopped
   * only when the hub says its machine confirmed the end (`project.stop`),
   * never at the ask; then its tile leaves the row and flies into the
   * button's icon slot, where a ring fills a share per landing while the row
   * folds shut behind it (delegates before their lead). The last landing
   * makes the ring whole, the caller's end runs (`end`, "Forgetting…"), and
   * the ring becomes the check ("Forgotten"), held where it was asked before
   * the caller goes on (`ended`). A failure keeps the state: the
   * row says why, and Try again stops what is left (`reread` reads what
   * still runs when no row failed but the end was refused).
   *
   * A session whose machine is away cannot be stopped now: its row says
   * "Stops when <machine> is back" from the start. The second press has the
   * hub record its stop, which the machine's next register carries out; once
   * it is recorded (`deferred`) the ring counts it, and it neither flies nor
   * folds. A lead that keeps such a delegate stays with it.
   *
   * `other` is a second way out beside the stop (Caw off's "Let them
   * finish"): it runs its own request, and the tray closes.
   *
   * Each state has its own height (the body's morph): the list, one line
   * shorter armed, a row shorter per landing, the short "Stopped 3
   * sessions." at the end, a line taller for a failure.
   */
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { cn } from "#lib/utils.js";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Away from "~icons/solar/cloud-cross-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import Pause from "~icons/solar/pause-circle-bold-duotone";
  import Working from "~icons/solar/refresh-circle-bold-duotone";
  import { STOPPED_LABEL, STOPPING_LABEL } from "./activity";
  import { cawco, onProjectStop } from "./client.svelte";
  import { machineName, span } from "./home/home-state.svelte";
  import { resolveSessionTitle } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import { nestFrom } from "./motion/branch.svelte";
  import {
    CURVE,
    dur,
    easeOut,
    motionOk,
    popScale,
  } from "./motion/curves.svelte";
  import { echoBeat } from "./motion/echo.svelte";
  import { fold, unfold } from "./motion/fold.svelte";
  import { departBox, land } from "./motion/share.svelte";
  import RowFault from "./RowFault.svelte";
  import TreeMark from "./TreeMark.svelte";
  import { toast } from "./toasts";

  let {
    class: className,
    projectId,
    sessions,
    words,
    stop: request,
    end,
    ended,
    reread,
    other,
    view,
    head,
    onclose,
  }: {
    /** The host's indent for the tray (`--ask-indent`, `--ask-end`). */
    class?: string;
    projectId: string;
    /** What runs, as the hub listed it as the tray opened; null while it is read. */
    sessions: RunningSession[] | null;
    words: StopWords;
    /**
     * Asks the hub to stop `ids`; each one's end arrives as `project.stop`.
     * It may answer the ids the hub says had already ended: stopped now.
     */
    stop: (ids: string[]) => Promise<string[] | undefined>;
    /** The caller's own end, once nothing it stops still runs; throws its refusal. */
    end: () => Promise<void>;
    /** After the end, while the check stands: what the caller does next. */
    ended?: () => Promise<void>;
    /** What still runs, when the end was refused with no row failed. */
    reread?: () => Promise<RunningSession[]>;
    /** A second way out: its button's words, and what it does before the tray closes. */
    other?: { label: string; run: () => Promise<void> };
    /** A row's title and link, where the caller names them. */
    view?: (session: RunningSession) => StopRowView;
    /** What leads the head, beside the title (Caw's slot). */
    head?: Snippet;
    /** The tray has left: the caller lets it go. */
    onclose: () => void;
  } = $props();

  /** This tray's own: its rows' tiles fly under it into the button, and its title is named by it. */
  const uid = $props.id();

  /** One listed session and how far its stop has got. */
  interface Row {
    /** Its tile has landed in the button: it counts toward the ring. */
    arrived: boolean;
    /** The hub confirmed its end (performance.now()), or null. */
    at: number | null;
    /** Its tile has left the row: the row is folding shut, or shut. */
    departed: boolean;
    error: string | null;
    /** The row has folded shut and is drawn no more. */
    gone: boolean;
    /** Its machine is away and the hub has recorded its stop for when it is back. */
    owed: boolean;
    s: RunningSession;
    /** `away`: its machine is not connected; it stops when it is back. */
    state: "running" | "away" | "stopping" | "stopped" | "failed";
  }

  /** A tile copy in the button's slot, flying in from its row. */
  interface Arrival {
    fill: string;
    id: string;
  }

  /** The tray is up: its sessions were read. */
  let shown = $state(false);
  let phase = $state<StopPhase>("list");
  let rows = $state<Row[]>([]);
  let arrivals = $state<Arrival[]>([]);
  /** How many were listed when the stop was pressed: the ring's whole. */
  let total = $state(0);
  /** The end itself was refused: the hub's words. */
  let refusal = $state<string | null>(null);
  /** The press that armed it is still settling: no press carries through. */
  let inert = false;
  /** When the stop was pressed (Date.now()), for a slow row's seconds. */
  let pressedAt = $state(0);
  let now = $state(Date.now());
  /** The other way out is on its way to the hub. */
  let otherPending = $state(false);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };
  let unhear: (() => void) | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;

  /** Each row's element and its tile, for its fold and its flight. */
  const items = new Map<string, HTMLElement>();
  const item = (id: string) => (node: HTMLElement) => {
    items.set(id, node);
    return () => {
      if (items.get(id) === node) {
        items.delete(id);
      }
    };
  };

  const listed = $derived(rows.length);
  const stopped = $derived(
    rows.filter((row) => row.state === "stopped").length
  );
  /** Left to stop: neither stopped nor recorded for its machine's return. */
  const left = $derived(
    total -
      stopped -
      rows.filter((row) => row.owed && row.state === "away").length
  );
  const arrivedCount = $derived(rows.filter((row) => row.arrived).length);
  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  /* ── Opening ─────────────────────────────────────────────────────── */

  /**
   * Which tray the work in flight belongs to: an end that returns after its
   * tray was closed (and maybe another opened) touches nothing.
   */
  let generation = 0;

  /** Everything still running for this tray stops: timers, the clock, the frames. */
  function quiet(): void {
    generation += 1;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    clearInterval(ticker);
    ticker = undefined;
    unhear?.();
    unhear = null;
  }

  function reset(): void {
    quiet();
    rows = [];
    arrivals = [];
    total = 0;
    refusal = null;
    inert = false;
  }

  const asRows = (listedNow: RunningSession[]): Row[] =>
    listedNow.map((s) => ({
      s,
      state: s.offline ? "away" : "running",
      owed: false,
      at: null,
      departed: false,
      arrived: false,
      gone: false,
      error: null,
    }));

  // What runs was read: the tray flies out of its opener.
  $effect(() => {
    const read = sessions;
    if (!read) {
      return;
    }
    reset();
    rows = asRows(read);
    phase = read.length > 0 ? "list" : "none";
    shown = true;
  });

  // Its place left the page (a page navigated away, a row dropped): nothing
  // of this tray keeps running.
  $effect(() => () => quiet());

  /**
   * In view and in hand as it unfolds: the menu that asked hands focus back
   * to its trigger as it closes, so the focus moves here a frame later.
   * Escape inside it puts it away and goes no further (a popover it stands
   * in stays open).
   */
  function unfoldHere(node: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest" });
      node.querySelector<HTMLElement>("[data-stop-cancel]")?.focus();
    });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        leave();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", onEscape);
    };
  }

  /** Closes the tray; a sweep left part-way says what it left. */
  function leave(): void {
    if (phase === "stopping" || phase === "fail") {
      toast(words.partway(stopped, total));
    }
    quiet();
    // The tray folds away as it is (--dur-exit), then the caller lets it go.
    shown = false;
    setTimeout(onclose, dur("--dur-exit"));
  }

  /* ── The two presses ────────────────────────────────────────────── */

  function press(): void {
    if (inert) {
      return;
    }
    if (phase === "list") {
      phase = "armed";
      // A double-click never carries through the morph into the stop.
      inert = true;
      after(dur("--dur-panel"), () => {
        inert = false;
      });
    } else if (phase === "armed") {
      total = rows.length;
      stop(rows.map((row) => row.s.id));
    } else if (phase === "fail") {
      retry();
    } else if (phase === "none") {
      finish();
    }
  }

  /** The other way out: its request, then the tray closes; a refusal stays to be read. */
  async function takeOther(): Promise<void> {
    if (!other || otherPending) {
      return;
    }
    otherPending = true;
    try {
      await other.run();
      leave();
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      otherPending = false;
    }
  }

  /** Stops `ids` in one request; each row turns as the hub reports it. */
  function stop(ids: string[]): void {
    phase = "stopping";
    refusal = null;
    pressedAt = Date.now();
    now = pressedAt;
    clearInterval(ticker);
    ticker = setInterval(() => {
      now = Date.now();
    }, 1000);
    for (const row of rows) {
      // A row whose machine is away keeps saying so; the hub records its stop.
      if (ids.includes(row.s.id) && row.state !== "away") {
        row.state = "stopping";
        row.error = null;
      }
    }
    unhear ??= onProjectStop((frame) => {
      if (frame.projectId === projectId) {
        heard(frame.instanceId, frame.outcome, frame.error ?? null);
      }
    });
    request(ids).then(
      (already) => {
        for (const id of already ?? []) {
          heard(id, "stopped", null);
        }
      },
      (error: unknown) => {
        const reason = failureWords(error);
        for (const id of ids) {
          heard(id, "failed", reason);
        }
      }
    );
  }

  /** The failed rows again; a refused end reads what still runs and stops it. */
  async function retry(): Promise<void> {
    const failedIds = rows
      .filter((row) => row.state === "failed")
      .map((row) => row.s.id);
    if (failedIds.length > 0) {
      stop(failedIds);
      return;
    }
    if (!reread) {
      finish();
      return;
    }
    const mine = generation;
    let again: RunningSession[];
    try {
      again = await reread();
    } catch (error) {
      if (mine === generation) {
        refusal = failureWords(error);
      }
      return;
    }
    if (mine !== generation) {
      return;
    }
    const known = new Set(rows.map((row) => row.s.id));
    rows = [
      ...rows.filter((row) => !row.gone),
      ...asRows(again.filter((s) => !known.has(s.id))),
    ];
    const fresh = again.map((s) => s.id);
    if (fresh.length === 0) {
      finish();
      return;
    }
    total += fresh.filter((id) => !known.has(id)).length;
    stop(fresh);
  }

  /* ── Each stop, as the hub reports it ───────────────────────────── */

  function heard(
    id: string,
    outcome: "stopped" | "failed" | "deferred",
    error: string | null
  ): void {
    const row = rows.find((each) => each.s.id === id);
    if (!row || row.state === "stopped") {
      return;
    }
    if (outcome === "deferred") {
      // Its machine is away (or went away before it answered): the stop is
      // recorded for its return. Counted now; it stays where it is.
      row.state = "away";
      row.owed = true;
      row.error = null;
      arrive(row);
    } else if (outcome === "failed") {
      if (row.state === "stopping") {
        row.state = "failed";
        row.error = error;
      }
    } else {
      row.state = "stopped";
      row.error = null;
      row.at = performance.now();
      // Its word and glyph turn first; its tile leaves after the fade.
      after(dur("--dur-fade"), () => leaveRow(row));
    }
    settle();
  }

  /** Nothing is still stopping and something failed: offer Try again. */
  function settle(): void {
    if (
      phase === "stopping" &&
      !rows.some((row) => row.state === "stopping") &&
      rows.some((row) => row.state === "failed")
    ) {
      phase = "fail";
    }
  }

  /** The last tile to leave a row, for the stagger between departures. */
  let lastLeft = Number.NEGATIVE_INFINITY;

  /**
   * The row's tile leaves for the button and the row folds shut behind it.
   * A lead waits for its delegates' tiles to leave first; a tile leaving
   * within a flight of the one before goes --dur-stagger after it.
   */
  function leaveRow(row: Row): void {
    if (row.departed || row.state !== "stopped" || !shown) {
      return;
    }
    const kids = rows.filter((each) => each.s.parentId === row.s.id);
    if (kids.some((kid) => !(kid.departed || kid.arrived))) {
      return;
    }
    if (kids.some((kid) => !kid.departed)) {
      // A delegate stays (its machine is away): its lead stays with it,
      // counted, so the tree under it is never folded away.
      arrive(row);
      return;
    }
    const at = performance.now();
    const due = lastLeft + dur("--dur-stagger");
    if (at - lastLeft < dur("--dur-panel") && due > at) {
      after(due - at, () => leaveRow(row));
      return;
    }
    lastLeft = at;
    row.departed = true;
    const node = items.get(row.s.id);
    const tile = node?.querySelector<HTMLElement>(":scope > .rin .tile");
    const moving = motionOk.current && node && tile;
    if (moving) {
      departBox(`${uid}-stop:${row.s.id}`, tile, false);
      arrivals.push({ id: row.s.id, fill: fillOf(row.s) });
      fold(node, false, {
        ms: dur("--dur-panel"),
        easing: CURVE.inOut,
      })?.finished.then(
        () => gone(row),
        () => gone(row)
      );
      node
        .querySelector(":scope > .rin")
        ?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: dur("--dur-exit"),
          easing: CURVE.out,
          fill: "forwards",
        });
      after(dur("--dur-panel"), () => arrive(row));
    } else {
      // Less motion: no flight; the row fades shut with its tile.
      if (node) {
        fold(node, false, {
          ms: dur("--dur-exit"),
          easing: CURVE.out,
          fade: true,
        })?.finished.then(
          () => gone(row),
          () => gone(row)
        );
      } else {
        gone(row);
      }
      arrive(row);
    }
  }

  function gone(row: Row): void {
    row.gone = true;
  }

  /** The tile has landed: it fades into the ring, which takes its share. */
  function arrive(row: Row): void {
    arrivals = arrivals.filter((each) => each.id !== row.s.id);
    // Counted already: it was away, and its machine came back and stopped it.
    if (row.arrived) {
      return;
    }
    row.arrived = true;
    const parent = rows.find((each) => each.s.id === row.s.parentId);
    if (parent) {
      after(dur("--dur-stagger"), () => leaveRow(parent));
    }
    if (rows.every((each) => each.arrived)) {
      // The ring is whole; a beat, then the end.
      after(dur("--dur-control"), finish);
    }
  }

  /* ── The end ─────────────────────────────────────────────────────── */

  async function finish(): Promise<void> {
    if (phase === "ending" || phase === "done") {
      return;
    }
    clearInterval(ticker);
    phase = "ending";
    const started = performance.now();
    const mine = generation;
    try {
      await end();
    } catch (error) {
      if (mine !== generation) {
        return;
      }
      refusal = failureWords(error);
      phase = rows.length > 0 ? "fail" : "none";
      return;
    }
    // The ending word is read before the ended one: an end quicker than the
    // label's morph waits for the morph to land.
    const morphing =
      rows.length > 0 ? dur("--dur-morph") - (performance.now() - started) : 0;
    if (morphing > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, morphing));
    }
    // The ended word ("Forgotten") is said where the question was asked and
    // held there before the caller goes on (a forgotten project's page
    // leaves for home), so the end is seen in place, not inferred from the
    // page changing under the reader. A tray put away meanwhile still lets
    // the caller go on: the end has happened.
    if (mine === generation) {
      phase = "done";
      await new Promise<void>((resolve) =>
        setTimeout(resolve, dur("--dur-hold"))
      );
    }
    await ended?.();
    if (mine === generation) {
      leave();
    }
  }

  /* ── What each part says ─────────────────────────────────────────── */

  const description = $derived(
    words.line(phase, phase === "list" ? listed : total, done())
  );

  /** What the stops did: "Stopped 2 sessions. 1 stops when obelisk is back." */
  function done(): string {
    const away = rows.filter((row) => row.state === "away");
    const endedLine = `Stopped ${stopped} ${plural(stopped, "session", "sessions")}.`;
    if (away.length === 0) {
      return endedLine;
    }
    const machines = [
      ...new Set(away.map((row) => machineName(row.s.machineId))),
    ];
    const back =
      machines.length === 1
        ? `when ${machines[0]} is back`
        : "when their machines are back";
    const later = `${away.length} ${plural(away.length, "stops", "stop")} ${back}.`;
    return stopped > 0 ? `${endedLine} ${later}` : later;
  }
  const confirmLabel = $derived.by(() => {
    switch (phase) {
      case "none":
        return words.plain;
      case "list":
        return words.stop(listed);
      case "armed":
        return words.armed(listed);
      case "fail":
        return "Try again";
      case "done":
        return words.ended;
      default:
        return words.armed(total);
    }
  });
  // The count winds down as stops land, and holds at the last one while its
  // tile is still on its way: the ending word is next.
  const pendingLabel = $derived(
    phase === "stopping" ? `Stopping ${Math.max(left, 1)}…` : words.ending
  );
  const pending = $derived(phase === "stopping" || phase === "ending");
  const cancelLabel = $derived.by(() => {
    if (phase === "stopping") {
      return "Stop waiting";
    }
    return phase === "fail" || phase === "ending" || phase === "done"
      ? "Close"
      : "Cancel";
  });
  /** The ring's share: only a tray with sessions to stop counts. */
  const progress = $derived.by(() => {
    if (rows.length === 0) {
      return;
    }
    return total > 0 ? arrivedCount / total : 0;
  });

  /* ── A row ───────────────────────────────────────────────────────── */

  const fillOf = (s: RunningSession) => `var(--mark-${markHue(s.cwd)})`;

  /** What a row says it is doing, before and through its stop. */
  function statusOf(row: Row) {
    if (row.state === "stopping") {
      return { word: STOPPING_LABEL, icon: null, tone: "busy" } as const;
    }
    if (row.state === "stopped") {
      return { word: STOPPED_LABEL, icon: Pause, tone: "quiet" } as const;
    }
    if (row.state === "failed") {
      return { word: "Couldn't stop", icon: Failed, tone: "failed" } as const;
    }
    if (row.state === "away") {
      return {
        word: `Stops when ${machineName(row.s.machineId)} is back`,
        icon: Away,
        tone: "quiet",
      } as const;
    }
    const activity = cawco.activityOf(row.s.id);
    if (activity === "blocked") {
      return { word: "Needs you", icon: Attention, tone: "attention" } as const;
    }
    if (activity === "working") {
      return { word: "Working", icon: Working, tone: "working" } as const;
    }
    return { word: "Idle", icon: Pause, tone: "quiet" } as const;
  }

  /** The mark's own status: an echo or a dot while it runs, the fail dot after. */
  function markOf(row: Row) {
    if (row.state === "failed") {
      return "fail" as const;
    }
    if (row.state !== "running") {
      return;
    }
    const activity = cawco.activityOf(row.s.id);
    if (activity === "blocked") {
      return "attn" as const;
    }
    return activity === "working" ? ("live" as const) : undefined;
  }

  /** Its trail: how long its turn has run, or, stopping past 5s, the seconds waited. */
  function trailOf(row: Row): string {
    const waited = Math.floor((now - pressedAt) / 1000);
    if (row.state === "stopping" && waited >= 5) {
      return `${waited}s`;
    }
    const since = cawco.turnSince(row.s.id);
    return row.state === "running" && since ? span(Date.now() - since) : "";
  }

  /** A new glyph comes up from the pop scale as the old one fades (SessionStatus). */
  function glyphIn(_node: Element): TransitionConfig {
    const scale = motionOk.current ? popScale() : 1;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
    };
  }
  function glyphOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /** A landed tile fades into the ring. */
  function intoRing(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
</script>

{#snippet branch(parentId: string | null)}
  {#each rows.filter((row) => row.s.parentId === parentId && !row.gone) as row (row.s.id)}
    {@const status = statusOf(row)}
    {@const kids = rows.filter(
      (each) => each.s.parentId === row.s.id && !each.gone
    )}
    {@const Sprite = sessionSprite(row.s.id)}
    {@const shownAs = view?.(row.s) ?? {}}
    {@const title =
      shownAs.title ??
      resolveSessionTitle({
        title: row.s.title,
        cwd: row.s.cwd,
        id: row.s.id,
      })}
    <li class="relative" data-row={row.s.id} {@attach item(row.s.id)}>
      <div
        class="min-w-0"
        style:--fault-end="var(--row-compact-pad-end)"
        style:--fault-indent="calc(var(--row-compact-gap) * 2 + var(--mark-size, 18px))"
      >
        <div
          data-slot="row"
          class="mark-line group flex min-h-(--row-compact-h) items-center gap-(--row-compact-gap) py-0 pr-(--row-compact-pad-end) pl-(--row-compact-gap) text-ink-strong @max-stop-tray/stop-tray:data-away:flex-wrap"
          data-away={row.state === "away" || undefined}
        >
          <TreeMark
            count={kids.length}
            faceAlways
            fill={fillOf(row.s)}
            noun="delegate"
            status={markOf(row)}
          >
            {#snippet face()}
              <Sprite aria-hidden="true" class="size-icon-sm" />
            {/snippet}
          </TreeMark>
          <span data-slot="title" class="m-0 min-w-0 flex-auto overflow-clip type-label text-balance text-ellipsis whitespace-nowrap text-ink-strong"
            ><span class="sr-only">{status.word}: </span>
            {#if shownAs.href}
              <a
                class="text-inherit no-underline hover:underline hover:underline-offset-3"
                href={shownAs.href}>{title}</a
              >
            {:else}
              {title}
            {/if}</span
          >
          <!-- literal: 16px, 13ch -->
          <span
            class="mark-line inline-flex min-w-(--stat-min) flex-none items-center gap-space-1 text-size-label font-medium whitespace-nowrap text-ink-muted @max-stop-tray/stop-tray:min-w-(--stat-min-narrow) @max-stop-tray/stop-tray:group-data-away:order-1 @max-stop-tray/stop-tray:group-data-away:basis-full @max-stop-tray/stop-tray:group-data-away:min-w-0 @max-stop-tray/stop-tray:group-data-away:ps-(--stat-away-indent) @max-stop-tray/stop-tray:group-data-away:pb-space-1"
            data-stop-tray-tone={status.tone}
            data-box
            style:--stat-away-indent="calc(var(--mark-size, 18px) + var(--row-compact-gap))"
            style:--stat-min="calc(16px + var(--space-1) + 13ch)"
            style:--stat-min-narrow="13ch"
          >
            <span
              data-slot="glyph"
              class="inline-grid flex-none @max-stop-tray/stop-tray:hidden {status.tone === 'working' ? 'text-status-live-glyph' : status.tone === 'attention' ? 'text-status-attn-glyph' : status.tone === 'failed' ? 'text-status-fail-glyph' : status.tone === 'quiet' ? 'text-status-idle-glyph' : ''}"
              data-box
            >
              {#key status.word}
                <span
                  data-slot="mark"
                  class="col-start-1 row-start-1 inline-flex"
                  in:glyphIn
                  out:glyphOut
                >
                  {#if status.icon}
                    <status.icon aria-hidden="true" class="size-icon-md" />
                  {:else}
                    <Spinner
                      aria-hidden="true"
                      class="size-icon-md"
                      role="presentation"
                    />
                  {/if}
                </span>
              {/key}
            </span>
            <span class={status.tone === "failed" ? "text-status-fail-ink" : ""}
              ><MorphText text={status.word} /></span
            >
          </span>
          <!-- literal: 3ch -->
          <span
            data-slot="num"
            class="num w-(--trail-w) flex-none type-meta text-end whitespace-nowrap text-ink-muted"
            style:--trail-w="3ch">{trailOf(row)}</span
          >
        </div>
        <RowFault
          again={() => stop([row.s.id])}
          reason={row.state === "failed" ? row.error : null}
        />
      </div>
      {#if kids.length > 0}
        <ul
          class="kit-nest m-0 list-none p-0"
          {@attach nestFrom(".tree-mark")}
        >
          {@render branch(row.s.id)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

{#snippet landed()}
  {#each arrivals as arrival (arrival.id)}
    {@const Sprite = sessionSprite(arrival.id)}
    <span
      class="absolute inset-0 grid place-items-center rounded-xs bg-(--fill) bg-mark-overlay text-mark-glyph"
      style:--fill={arrival.fill}
      style:--landed-icon="calc(var(--btn-icon) * 2 / 3)"
      out:intoRing
      {@attach land(() => `${uid}-stop:${arrival.id}`, { uniform: true })}
      ><Sprite aria-hidden="true" class="size-(--landed-icon)" /></span
    >
  {/each}
{/snippet}

{#if shown}
  <!-- Unfolds under what asked for it, in the page's flow. -->
  <section
    aria-labelledby="{uid}-title"
    class={cn(
      "@container/stop-tray min-w-0 py-space-1 ps-(--ask-indent) pe-(--ask-end)",
      className
    )}
    data-stop-tray={projectId}
    transition:unfold
    {@attach unfoldHere}
  >
    <div
      data-slot="tile"
      class="grid gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
    >
      <div data-slot="head" class="flex min-w-0 gap-space-3">
        <!-- The caller's place in the tray's head: empty, it takes no room. -->
        <div
          aria-hidden="true"
          class="aspect-square flex-none self-stretch empty:hidden"
        >{@render head?.()}</div>
        <div data-slot="words" class="grid min-w-0 flex-auto gap-space-1">
          <p data-slot="title" class="m-0 min-w-0 flex-auto overflow-clip type-label text-balance text-ellipsis whitespace-nowrap text-ink-strong" id="{uid}-title">
            {words.title}
          </p>
          <!-- As wide as the head, whatever its words: sized to them, it
               followed the morph's own box and narrowed mid-morph. Its
               words say each state ("Stopped 3 sessions."), so they are
               announced as they change. -->
          <p aria-live="polite" class="m-0 type-meta text-ink-muted">
            <MorphText text={description} wrap />
          </p>
          <!-- The end, or the other way out, refused: the hub's words, where
               the question is; the confirm (Try again) or the other button
               goes on from here. -->
          <RowFault reason={refusal} />
        </div>
      </div>
      {#if rows.some((row) => !row.gone)}
        <ul
          data-slot="sessions"
          aria-label="Running sessions"
          class="mx-(--pull-x) my-(--pull-y) list-none overflow-x-clip px-space-2 py-space-1"
          style:--pull-x="calc(-1 * var(--space-2))"
          style:--pull-y="calc(-1 * var(--space-1))"
          {@attach echoBeat()}
        >
          {@render branch(null)}
        </ul>
      {/if}
      <div
        data-slot="actions"
        class="flex flex-wrap justify-end gap-space-2"
      >
        <Button
          data-stop-cancel
          label={cancelLabel}
          onclick={leave}
          size="sm"
          variant="ghost"
        />
        {#if other && (phase === "list" || phase === "armed")}
          <Button
            data-stop-other
            label={other.label}
            onclick={takeOther}
            pending={otherPending}
            size="sm"
            variant="outline"
          />
        {/if}
        <Button
          arrivals={landed}
          data-stop-confirm
          failed={phase === "fail"}
          label={confirmLabel}
          onclick={press}
          {pending}
          {pendingLabel}
          {progress}
          size="sm"
        />
      </div>
    </div>
  </section>
{/if}
