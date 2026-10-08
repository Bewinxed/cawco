<script lang="ts">
  /**
   * Forget a project: one tray that changes shape as the forget goes, never
   * a second dialog (Family, benji.org/family-values: trays that "expand,
   * contract, and adapt"). Mounted once in the shell (forget.svelte.ts), it
   * flies out of whatever asked for it: the project head's `⋯` or a folder's
   * menu item, both departing under `forget:<id>`.
   *
   * With nothing running it is the plain question: Forget, the delete, gone.
   *
   * With sessions running it lists them as the rail nests them (each lead
   * with its delegates), and asks twice on one button: "Stop 3 and forget",
   * then "Stop 3 mid-turn and forget", its words growing the warning in
   * place. The second press stops them all in one request. A row turns
   * Stopped only when the hub says its machine confirmed the end
   * (`project.stop`), never at the ask; then its tile leaves the row and
   * flies into the button's icon slot, where a ring fills a share per
   * landing while the row folds shut behind it (delegates before their
   * lead). The last landing makes the ring whole, the delete runs
   * ("Forgetting…"), and the ring becomes the check ("Forgotten"). The hub
   * refuses the delete while anything of the project runs, so a failure keeps
   * the project: the row says why, and Try again stops what is left.
   *
   * Each state has its own height (the body's morph): the list, one line
   * shorter armed, a row shorter per landing, the short "Stopped 3
   * sessions." at the end, a line taller for a failure.
   */
  import type { TransitionConfig } from "svelte/transition";
  import { route } from "#lib/cawco/motion/route.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import Pause from "~icons/solar/pause-circle-bold-duotone";
  import Working from "~icons/solar/refresh-circle-bold-duotone";
  import {
    cawco,
    deleteProject,
    onProjectStop,
    projectRunning,
    type RunningSession,
    readProjects,
    stopProjectSessions,
  } from "./client.svelte";
  import { forgetHost } from "./forget.svelte";
  import { span } from "./home/home-state.svelte";
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
  import { fold, unfold } from "./motion/fold.svelte";
  import { departBox, land } from "./motion/share.svelte";
  import TreeMark from "./TreeMark.svelte";
  import { toast } from "./toasts";

  type Phase =
    | "none"
    | "list"
    | "armed"
    | "stopping"
    | "fail"
    | "forgetting"
    | "done";

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
    s: RunningSession;
    state: "running" | "stopping" | "stopped" | "failed";
  }

  /** A tile copy in the button's slot, flying in from its row. */
  interface Arrival {
    fill: string;
    id: string;
  }

  const project = $derived(forgetHost.project);
  /** The tray is up: its sessions were read. */
  let shown = $state(false);
  let phase = $state<Phase>("list");
  let rows = $state<Row[]>([]);
  let arrivals = $state<Arrival[]>([]);
  /** How many were listed when the stop was pressed: the ring's whole. */
  let total = $state(0);
  /** The delete itself was refused: the hub's words. */
  let refusal = $state<string | null>(null);
  /** The press that armed it is still settling: no press carries through. */
  let inert = false;
  /** When the stop was pressed (Date.now()), for a slow row's seconds. */
  let pressedAt = $state(0);
  let now = $state(Date.now());

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
  const left = $derived(total - stopped);
  const arrivedCount = $derived(rows.filter((row) => row.arrived).length);
  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  /* ── Opening ─────────────────────────────────────────────────────── */

  /**
   * Which forget the work in flight belongs to: a delete that returns after
   * its tray was closed (and maybe another opened) touches nothing.
   */
  let generation = 0;

  /** Everything still running for this forget stops: timers, the clock, the frames. */
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

  const asRows = (sessions: RunningSession[]): Row[] =>
    sessions.map((s) => ({
      s,
      state: "running",
      at: null,
      departed: false,
      arrived: false,
      gone: false,
      error: null,
    }));

  // A forget asked for: read what runs, then the tray flies out of its opener.
  $effect(() => {
    const asked = project;
    if (!asked) {
      return;
    }
    let live = true;
    reset();
    projectRunning(asked.id).then(
      (sessions) => {
        if (!live) {
          return;
        }
        rows = asRows(sessions);
        phase = sessions.length > 0 ? "list" : "none";
        shown = true;
      },
      (error: unknown) => {
        if (!live) {
          return;
        }
        toast.error(error instanceof Error ? error.message : String(error));
        forgetHost.close();
      }
    );
    return () => {
      live = false;
    };
  });

  /** Closes the tray; a sweep left part-way says what it left. */
  function leave(): void {
    if (phase === "stopping" || phase === "fail") {
      toast(
        `Stopped ${stopped} of ${total}; ${project?.name ?? "the project"} kept.`
      );
    }
    quiet();
    // The tray leaves as it is (--dur-exit), then the host lets it go.
    shown = false;
    const asked = project;
    setTimeout(() => {
      if (forgetHost.project === asked) {
        forgetHost.close();
      }
    }, dur("--dur-exit"));
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
      forget();
    }
  }

  /** Stops `ids` in one request; each row turns as the hub reports it. */
  function stop(ids: string[]): void {
    const asked = project;
    if (!asked) {
      return;
    }
    phase = "stopping";
    refusal = null;
    pressedAt = Date.now();
    now = pressedAt;
    clearInterval(ticker);
    ticker = setInterval(() => {
      now = Date.now();
    }, 1000);
    for (const row of rows) {
      if (ids.includes(row.s.id)) {
        row.state = "stopping";
        row.error = null;
      }
    }
    unhear ??= onProjectStop((frame) => {
      if (frame.projectId === asked.id) {
        heard(frame.instanceId, frame.outcome, frame.error ?? null);
      }
    });
    stopProjectSessions(asked.id, ids).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      for (const id of ids) {
        heard(id, "failed", reason);
      }
    });
  }

  /** The failed rows again; a refused delete reads what still runs and stops it. */
  async function retry(): Promise<void> {
    const failedIds = rows
      .filter((row) => row.state === "failed")
      .map((row) => row.s.id);
    if (failedIds.length > 0) {
      stop(failedIds);
      return;
    }
    const asked = project;
    if (!asked) {
      return;
    }
    const mine = generation;
    let sessions: RunningSession[];
    try {
      sessions = await projectRunning(asked.id);
    } catch (error) {
      if (mine === generation) {
        refusal = error instanceof Error ? error.message : String(error);
      }
      return;
    }
    if (mine !== generation) {
      return;
    }
    const known = new Set(rows.map((row) => row.s.id));
    rows = [
      ...rows.filter((row) => !row.gone),
      ...asRows(sessions.filter((s) => !known.has(s.id))),
    ];
    const fresh = sessions.map((s) => s.id);
    if (fresh.length === 0) {
      forget();
      return;
    }
    total += fresh.filter((id) => !known.has(id)).length;
    stop(fresh);
  }

  /* ── Each stop, as the hub reports it ───────────────────────────── */

  function heard(
    id: string,
    outcome: "stopped" | "failed",
    error: string | null
  ): void {
    const row = rows.find((each) => each.s.id === id);
    if (!row || row.state === "stopped") {
      return;
    }
    if (outcome === "failed") {
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
    if (kids.some((kid) => !kid.departed)) {
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
      departBox(`forget-stop:${row.s.id}`, tile, false);
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
    row.arrived = true;
    arrivals = arrivals.filter((each) => each.id !== row.s.id);
    const parent = rows.find((each) => each.s.id === row.s.parentId);
    if (parent) {
      after(dur("--dur-stagger"), () => leaveRow(parent));
    }
    if (rows.every((each) => each.arrived)) {
      // The ring is whole; a beat, then the delete.
      after(dur("--dur-control"), forget);
    }
  }

  /* ── The delete ──────────────────────────────────────────────────── */

  async function forget(): Promise<void> {
    const asked = project;
    if (!asked) {
      return;
    }
    clearInterval(ticker);
    phase = "forgetting";
    const started = performance.now();
    const mine = generation;
    try {
      await deleteProject(asked.id);
    } catch (error) {
      if (mine !== generation) {
        return;
      }
      refusal = error instanceof Error ? error.message : String(error);
      phase = rows.length > 0 ? "fail" : "none";
      if (phase === "none") {
        toast.error(refusal);
      }
      return;
    }
    // "Forgetting…" is read before "Forgotten": a delete quicker than the
    // label's morph waits for the morph to land.
    const morphing =
      rows.length > 0 ? dur("--dur-morph") - (performance.now() - started) : 0;
    if (morphing > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, morphing));
    }
    if (mine === generation) {
      phase = "done";
    }
    // The project is gone whether or not its tray is still up: the reader is
    // taken off its page before the list drops it, so the page never stands
    // on a project that is gone.
    if (page.url.pathname === `/project/${asked.id}`) {
      await goto(route.spoke, { replace: true });
    }
    await readProjects();
    if (mine !== generation) {
      return;
    }
    if (rows.length === 0) {
      // The plain question closes as the delete lands.
      leave();
      return;
    }
    after(dur("--dur-hold"), leave);
  }

  /* ── What each part says ─────────────────────────────────────────── */

  const name = $derived(project?.name ?? "");
  const description = $derived.by(() => {
    switch (phase) {
      case "none":
        return "The grouping is removed. The checkout and its sessions stay on disk.";
      case "list":
        return `${listed} running ${plural(listed, "session stops", "sessions stop")} first. The checkout and its sessions stay on disk.`;
      case "armed":
      case "stopping":
        return "Transcripts and the checkout stay on disk.";
      case "fail":
        return refusal ?? `${name} is kept until every session is stopped.`;
      default:
        return `Stopped ${total} ${plural(total, "session", "sessions")}.`;
    }
  });
  const confirmLabel = $derived.by(() => {
    switch (phase) {
      case "none":
        return "Forget";
      case "list":
        return `Stop ${listed} and forget`;
      case "armed":
        return `Stop ${listed} mid-turn and forget`;
      case "fail":
        return "Try again";
      case "done":
        return "Forgotten";
      default:
        return `Stop ${total} mid-turn and forget`;
    }
  });
  // The count winds down as stops land, and holds at the last one while its
  // tile is still on its way: "Forgetting…" is next.
  const pendingLabel = $derived(
    phase === "stopping" ? `Stopping ${Math.max(left, 1)}…` : "Forgetting…"
  );
  const pending = $derived(phase === "stopping" || phase === "forgetting");
  const cancelLabel = $derived.by(() => {
    if (phase === "stopping") {
      return "Stop waiting";
    }
    return phase === "fail" || phase === "forgetting" || phase === "done"
      ? "Close"
      : "Cancel";
  });
  /** The ring's share: only a forget with sessions to stop counts. */
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
      return { word: "Stopping…", icon: null, tone: "busy" } as const;
    }
    if (row.state === "stopped") {
      return { word: "Stopped", icon: Pause, tone: "quiet" } as const;
    }
    if (row.state === "failed") {
      return { word: "Couldn't stop", icon: Failed, tone: "failed" } as const;
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

{#snippet branch(
  parentId: string | null
)}
  {#each rows.filter(
    (row) => row.s.parentId === parentId && !row.gone
  ) as row (row.s.id)}
    {@const status = statusOf(row)}
    {@const kids = rows.filter(
      (each) => each.s.parentId === row.s.id && !each.gone
    )}
    {@const Sprite = sessionSprite(row.s.id)}
    <li data-row={row.s.id} {@attach item(row.s.id)}>
      <div class="rin">
        <div class="row">
          <TreeMark
            count={kids.length}
            faceAlways
            fill={fillOf(row.s)}
            noun="delegate"
            status={markOf(row)}
          >
            {#snippet face()}
              <Sprite aria-hidden="true" class="session-mark-glyph" />
            {/snippet}
          </TreeMark>
          <span class="title"
            ><span class="sr-only">{status.word}: </span>
            {resolveSessionTitle({
              title: row.s.title,
              cwd: row.s.cwd,
              id: row.s.id,
            })}</span
          >
          <span class="stat {status.tone}">
            <span class="glyph">
              {#key status.word}
                <span class="mark" in:glyphIn out:glyphOut>
                  {#if status.icon}
                    <status.icon aria-hidden="true" />
                  {:else}
                    <Spinner aria-hidden="true" role="presentation" />
                  {/if}
                </span>
              {/key}
            </span>
            <span class="word"><MorphText text={status.word} /></span>
          </span>
          <span class="trail num">{trailOf(row)}</span>
        </div>
        {#if row.state === "failed" && row.error}
          <p class="err" transition:unfold>{row.error}</p>
        {/if}
      </div>
      {#if kids.length > 0}
        <ul class="kit-nest" {@attach nestFrom(".tree-mark")}>
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
      class="landed"
      style:--fill={arrival.fill}
      out:intoRing
      {@attach land(() => `forget-stop:${arrival.id}`, { uniform: true })}
      ><Sprite aria-hidden="true" /></span
    >
  {/each}
{/snippet}

{#if project}
  <AlertDialog.Root
    bind:open={
      () => shown,
      (value) => {
    if (!value) {
      leave();
    }
  }
    }
  >
    <!-- Opens out of what asked for it: the head's ⋯, or the folder's menu item. -->
    <AlertDialog.Content
      {@attach land(() => `forget:${project.id}`, { uniform: true })}
    >
      <div class="head">
        <!-- Caw's place in the tray's head: empty, it takes no room. -->
        <div aria-hidden="true" class="caw-slot"></div>
        <AlertDialog.Header class="place-items-start text-left">
          <AlertDialog.Title>Forget {name}?</AlertDialog.Title>
          <!-- As wide as the head, whatever its words: sized to them, it
               followed the morph's own box and narrowed mid-morph. -->
          <!-- Its words say each state ("Stopped 3 sessions."), so they are
               announced as they change. -->
          <AlertDialog.Description aria-live="polite" class="w-full">
            <MorphText text={description} wrap />
          </AlertDialog.Description>
        </AlertDialog.Header>
      </div>
      {#if rows.some((row) => !row.gone)}
        <ul aria-label="Running sessions" class="sessions">
          {@render branch(null)}
        </ul>
      {/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel>
          {#snippet child({
            props,
          })}
            <Button {...props} label={cancelLabel} variant="outline" />
          {/snippet}
        </AlertDialog.Cancel>
        <Button
          arrivals={landed}
          data-forget-confirm
          failed={phase === "fail"}
          label={confirmLabel}
          onclick={press}
          {pending}
          {pendingLabel}
          {progress}
        />
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

<style>
  /* Caw's slot leads the head, as tall as the title and its line; empty, it
     is not drawn at all. */
  .head {
    display: flex;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .caw-slot {
    flex: none;
    align-self: stretch;
    aspect-ratio: 1;
  }
  .caw-slot:empty {
    display: none;
  }
  .head > :global([data-slot="alert-dialog-header"]) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  /* The rows: the rail's compact session row, nested as the rail nests
     delegates, and nothing to press. */
  .sessions,
  .sessions :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sessions {
    /* The status dot and the echo stand out of the tile: room for them. */
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    padding: var(--space-1) var(--space-2);
    overflow-x: clip;
  }
  .sessions :global(li) {
    position: relative;
  }
  .rin {
    min-inline-size: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--row-compact-gap);
    min-block-size: var(--row-compact-h);
    padding: 0 var(--row-compact-pad-end) 0 var(--row-compact-gap);
    color: var(--ink-strong);
  }
  .title {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stat {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    /* As wide as its longest word ("Couldn't stop"), so the title beside it
       holds still as the word changes. */
    min-inline-size: calc(16px + var(--space-1) + 13ch);
    color: var(--ink-muted);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    white-space: nowrap;
  }
  .glyph {
    display: inline-grid;
    flex: none;
  }
  .mark {
    grid-area: 1 / 1;
    display: inline-flex;
  }
  .stat :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .working .glyph {
    color: var(--status-live-glyph);
  }
  .attention .glyph {
    color: var(--status-attn-glyph);
  }
  .failed .glyph {
    color: var(--status-fail-glyph);
  }
  .failed .word {
    color: var(--status-fail-ink);
  }
  .quiet .glyph {
    color: var(--status-idle-glyph);
  }
  .trail {
    flex: none;
    inline-size: 3ch;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    text-align: end;
    white-space: nowrap;
  }
  /* Why it could not be stopped, under the row, from where its title starts. */
  .err {
    margin: 0;
    padding: var(--space-row) var(--row-compact-pad-end) var(--space-row)
      calc(var(--row-compact-gap) * 2 + var(--mark-size, 18px));
    font: var(--type-meta);
    color: var(--status-fail-ink);
    overflow-wrap: anywhere;
  }
  /* A phone: the word alone says the status. */
  @media (max-width: 639px) {
    .glyph {
      display: none;
    }
    .stat {
      min-inline-size: 13ch;
    }
  }

  /* A row's tile, landed in the button's slot: the tile at the slot's size. */
  .landed {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);
    color: var(--mark-glyph);

    /* The sprite at the share of the tile it has on a row (12 of 18px). */
    & :global(svg) {
      inline-size: calc(var(--btn-icon) * 2 / 3);
      block-size: calc(var(--btn-icon) * 2 / 3);
    }
  }
</style>
