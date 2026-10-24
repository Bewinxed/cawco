<script lang="ts">
  import { commonWords } from "@cawco/core";
  /**
   * The running-sessions tray: one tray that changes shape as a stop goes,
   * never a second dialog (Family, benji.org/family-values: trays that
   * "expand, contract, and adapt"). It stands in the page under whatever
   * asked for it, unfolding there (DESIGN.md, The Open Page Rule): no scrim,
   * nothing held, the page live around it. Pressing something else while it
   * stands breaks nothing: each stop is the hub's to confirm, and the end
   * the hub refuses while anything still runs is said here.
   *
   * It draws a job of stop-work.svelte.ts, which holds the work (The Work
   * Outlives Its Surface Rule): Cancel or Escape before the stop drops the
   * ask; after it, Stop waiting, Close or Escape puts the tray away and the
   * job parks on the project's row (StopParked), the stops still landing
   * and the end still running once none is left. The tray travels into
   * that line as it goes and comes back out of it on a press there. A
   * reload brings it back as it stood.
   *
   * With nothing running it is the plain question: the kind's end, its
   * ended word held in place, then gone.
   *
   * With sessions running it lists them as the rail nests them (each lead
   * with its delegates), and asks twice on one button: "Stop 3 and …", then
   * "Stop 3 mid-turn and …", its words growing the warning in place. The
   * second press stops them all in one request. A row turns Stopped only
   * when the hub says its machine confirmed the end (`project.stop`), never
   * at the ask; then its tile leaves the row and flies into the button's
   * icon slot, where a ring fills a share per landing while the row folds
   * shut behind it (delegates before their lead). The last landing makes
   * the ring whole, the kind's end runs ("Forgetting…"), and the ring
   * becomes the check ("Forgotten"), held where it was asked before the
   * page goes on. A failure keeps the state: the row says why, and Try
   * again stops what is left.
   *
   * A session whose machine is away cannot be stopped now: its row says
   * "Stops when <machine> is back" from the start. The second press has the
   * hub record its stop, which the machine's next register carries out; once
   * it is recorded (`deferred`) the ring counts it, and it neither flies nor
   * folds. A lead that keeps such a delegate stays with it.
   *
   * Caw off has a second way out beside the stop, "Let them finish": its
   * own request, and the tray closes.
   *
   * Each state has its own height (the body's morph): the list, one line
   * shorter armed, a row shorter per landing, the short "Stopped 3
   * sessions." at the end, a line taller for a failure.
   */
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconNeedsYou as Attention,
    IconCloudCross as Away,
    IconError as Failed,
    IconPauseCircle as Pause,
    IconRenew as Working,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { STOPPED_LABEL, STOPPING_LABEL } from "./activity";
  import { cawco } from "./client.svelte";
  import { frameObserver } from "./frame-observer";
  import CawFace from "./home/CawFace.svelte";
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
  import { sessionPlace } from "./session-names.svelte";
  import {
    type StopJob,
    type StopRow,
    stopShare,
    stopWork,
    wordsOf,
  } from "./stop-work.svelte";
  import TreeMark from "./TreeMark.svelte";

  let {
    class: className,
    job,
  }: {
    /** The host's indent for the tray (`--ask-indent`, `--ask-end`). */
    class?: string;
    job: StopJob;
  } = $props();

  /** This tray's own: its rows' tiles fly under it into the button, and its title is named by it. */
  const uid = $props.id();

  /** A tile copy in the button's slot, flying in from its row. */
  interface Arrival {
    fill: string;
    id: string;
  }

  const words = $derived(wordsOf(job));
  const rows = $derived(job.rows);
  const phase = $derived(job.phase);
  const total = $derived(job.total);
  const share = $derived(stopShare(job));
  let arrivals = $state<Arrival[]>([]);
  /** The press that armed it is still settling: no press carries through. */
  let inert = false;
  let now = $state(Date.now());
  /** The other way out is on its way to the hub. */
  let otherPending = $state(false);
  let tile = $state<HTMLElement | null>(null);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };
  // Its place left the page (a page navigated away, a row dropped): nothing
  // of this tray's own keeps running; the job goes on in the store.
  $effect(() => () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  });

  // While the stops land, the slow rows' seconds count.
  $effect(() => {
    if (phase !== "stopping") {
      return;
    }
    now = Date.now();
    const ticker = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(ticker);
  });

  // Taken off the page while its job still stands here (what holds it
  // closed: Caw's settings put away, the page left): the tray is put away
  // as Escape puts it, so stops under way park and are said where they
  // are parked, never left standing in a place no one can see.
  $effect(() => {
    const place = untrack(() => job.at);
    return () => {
      if (job.open && job.at === place) {
        stopWork.dismiss(job);
      }
    };
  });

  // Drawn and standing: its stopped rows fly into its button.
  $effect(() => {
    if (!job.open) {
      return;
    }
    return stopWork.attach(job, { fly: leaveRow });
  });

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

  /**
   * In view and in hand as it unfolds: the menu that asked hands focus back
   * to its trigger as it closes, so the focus moves here a frame later.
   * While it stands it keeps itself in view as its own size changes (it
   * opens on its list and grows to each stop as its machine confirms it),
   * so its foot never rests under what stands over the page's foot (the
   * scroller's scroll padding). Escape inside it puts it away and goes no
   * further (a popover it stands in stays open).
   */
  function unfoldHere(node: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      node.querySelector<HTMLElement>("[data-stop-cancel]")?.focus();
    });
    // Its size read in the delivery, and the scroll in the next frame
    // (frame-observer): nothing resizes inside the delivery.
    let height = -1;
    let measured = 0;
    const sized = frameObserver(
      () => {
        if (measured !== height && job.open) {
          height = measured;
          node.scrollIntoView({ block: "nearest" });
        }
      },
      {
        read: ([entry]) => {
          measured = entry?.borderBoxSize[0]?.blockSize ?? 0;
        },
      }
    );
    sized.observe(node);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        leave();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      node.removeEventListener("keydown", onEscape);
    };
  }

  /**
   * Puts the tray away. Stops under way are parked and go on: the tray
   * travels into the place they are parked (The One Object Rule).
   */
  function leave(): void {
    if (
      tile &&
      (phase === "stopping" || phase === "fail" || phase === "ending")
    ) {
      departBox(share, tile, false);
    }
    arrivals = [];
    stopWork.dismiss(job);
  }

  /* ── The presses ────────────────────────────────────────────────── */

  function press(): void {
    if (inert) {
      return;
    }
    if (phase === "list") {
      // A double-click never carries through the morph into the stop.
      inert = true;
      after(dur("--dur-panel"), () => {
        inert = false;
      });
    }
    stopWork.press(job);
  }

  /** The other way out: its request, then the tray closes; a refusal stays to be read. */
  async function takeOther(): Promise<void> {
    if (otherPending) {
      return;
    }
    otherPending = true;
    try {
      await stopWork.other(job);
    } finally {
      otherPending = false;
    }
  }

  /* ── A stopped row's flight ─────────────────────────────────────── */

  /** The last tile to leave a row, for the stagger between departures. */
  let lastLeft = Number.NEGATIVE_INFINITY;

  /**
   * The row's tile leaves for the button and the row folds shut behind it.
   * A lead waits for its delegates' tiles to leave first; a tile leaving
   * within a flight of the one before goes --dur-stagger after it.
   */
  function leaveRow(row: StopRow): void {
    if (row.departed || row.state !== "stopped" || !job.open) {
      return;
    }
    const kids = rows.filter((each) => each.s.parentId === row.s.id);
    if (kids.some((kid) => !(kid.departed || kid.arrived))) {
      return;
    }
    if (kids.some((kid) => !kid.departed)) {
      // A delegate stays (its machine is away): its lead stays with it,
      // counted, so the tree under it is never folded away.
      stopWork.arrive(job, row);
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
    const rowTile = node?.querySelector<HTMLElement>(
      ':scope > [data-slot="rin"] .tile'
    );
    const moving = motionOk.current && node && rowTile;
    if (moving) {
      departBox(`${uid}-stop:${row.s.id}`, rowTile, false);
      arrivals.push({ id: row.s.id, fill: fillOf(row.s) });
      fold(node, false, {
        ms: dur("--dur-panel"),
        easing: CURVE.inOut,
      })?.finished.then(
        () => gone(row),
        () => gone(row)
      );
      node
        .querySelector(':scope > [data-slot="rin"]')
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

  function gone(row: StopRow): void {
    row.gone = true;
  }

  /** The tile has landed: it fades into the ring, which takes its share. */
  function arrive(row: StopRow): void {
    arrivals = arrivals.filter((each) => each.id !== row.s.id);
    stopWork.arrive(job, row);
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
        return commonWords.tryAgain;
      case "done":
        return words.ended;
      case "ending":
      case "stopping":
        break;
    }
    return words.armed(total);
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

  const fillOf = (s: StopRow["s"]) =>
    `var(--mark-${markHue(sessionPlace(s.id))})`;

  /** What a row says it is doing, before and through its stop. */
  function statusOf(row: StopRow) {
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
  function markOf(row: StopRow) {
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
  function trailOf(row: StopRow): string {
    const waited = Math.floor((now - job.pressedAt) / 1000);
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
    {@const shownAs = row.view}
    {@const title =
      shownAs.title ??
      resolveSessionTitle({
        title: row.s.title,
        cwd: row.s.cwd,
        id: row.s.id,
      })}
    <li class="relative" data-row={row.s.id} {@attach item(row.s.id)}>
      <div
        data-slot="rin"
        class="min-w-0"
        style:--fault-end="var(--row-compact-pad-end)"
        style:--fault-indent={"calc(var(--row-compact-gap) * 2 + var(--mark-size, var(--space-5)))"}
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
          <span
            data-slot="title"
            class="m-0 min-w-0 flex-auto overflow-clip type-label text-balance text-ellipsis whitespace-nowrap text-ink-strong"
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
          <span
            class="mark-line inline-flex min-w-(--stat-min) flex-none items-center gap-space-1 text-size-label font-medium whitespace-nowrap text-ink-muted @max-stop-tray/stop-tray:min-w-c-stop-tray-status-w @max-stop-tray/stop-tray:group-data-away:order-1 @max-stop-tray/stop-tray:group-data-away:basis-full @max-stop-tray/stop-tray:group-data-away:min-w-0 @max-stop-tray/stop-tray:group-data-away:ps-(--stat-away-indent) @max-stop-tray/stop-tray:group-data-away:pb-space-1"
            data-stop-tray-tone={status.tone}
            data-box
            style:--stat-away-indent={"calc(var(--mark-size, var(--space-5)) + var(--row-compact-gap))"}
            style:--stat-min={"calc(var(--icon-md) + var(--space-1) + var(--c-stop-tray-status-w))"}
          >
            <span
              data-slot="glyph"
              class={[
                "inline-grid flex-none @max-stop-tray/stop-tray:hidden",
                status.tone === "working" && "text-status-live-glyph",
                status.tone === "attention" && "text-status-attn-glyph",
                status.tone === "failed" && "text-status-fail-glyph",
                status.tone === "quiet" && "text-status-idle-glyph",
              ]}
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
                    <Spinner aria-hidden="true" role="presentation" />
                  {/if}
                </span>
              {/key}
            </span>
            <span class={status.tone === "failed" ? "text-status-fail-ink" : ""}
              ><MorphText text={status.word} /></span
            >
          </span>
          <span
            data-slot="num"
            class="num w-c-stop-tray-trail-w flex-none type-meta text-end whitespace-nowrap text-ink-muted"
            >{trailOf(row)}</span
          >
        </div>
        <RowFault
          again={() => stopWork.stopOne(job, row.s.id)}
          reason={row.state === "failed" ? row.error : null}
        />
      </div>
      {#if kids.length > 0}
        <ul
          data-nest
          class="kit-nest m-0 list-none p-0"
          {@attach nestFrom("[data-tree-mark]")}
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
      class="absolute inset-0 grid place-items-center text-(--fill)"
      style:--fill={arrival.fill}
      style:--landed-icon="calc(var(--btn-icon) * 2 / 3)"
      out:intoRing
      {@attach land(() => `${uid}-stop:${arrival.id}`, { uniform: true })}
      ><Sprite aria-hidden="true" class="size-(--landed-icon)" /></span
    >
  {/each}
{/snippet}

{#if job.open}
  <!-- Unfolds under what asked for it, in the page's flow. -->
  <section
    aria-labelledby="{uid}-title"
    class={cn(
      "@container/stop-tray min-w-0 py-space-1 ps-(--ask-indent) pe-(--ask-end)",
      className
    )}
    data-stop-tray={job.projectId}
    data-stop-kind={job.kind}
    data-phase={phase}
    transition:unfold
    {@attach unfoldHere}
  >
    <div
      bind:this={tile}
      data-slot="tile"
      class="grid gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
      {@attach land(() => share)}
    >
      <div data-slot="head" class="flex min-w-0 gap-space-3">
        <!-- The caller's place in the tray's head: empty, it takes no room. -->
        <div
          aria-hidden="true"
          class="aspect-square flex-none self-stretch empty:hidden"
        >
          {#if job.kind === "caw-off"}
            <CawFace size={36} status="ready" />
          {/if}
        </div>
        <div data-slot="words" class="grid min-w-0 flex-auto gap-space-1">
          <p
            data-slot="title"
            class="m-0 min-w-0 flex-auto overflow-clip type-label text-balance text-ellipsis whitespace-nowrap text-ink-strong"
            id="{uid}-title"
          >
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
          <RowFault reason={job.refusal} />
        </div>
      </div>
      {#if rows.some((row) => !row.gone)}
        <ul
          data-slot="sessions"
          aria-label="Running sessions"
          class="list-none overflow-x-clip clip-margin-space-2"
          {@attach echoBeat()}
        >
          {@render branch(null)}
        </ul>
      {/if}
      <div data-slot="actions" class="flex flex-wrap justify-end gap-space-2">
        <Button
          data-stop-cancel
          label={cancelLabel}
          onclick={leave}
          size="sm"
          variant="ghost"
        />
        {#if words.other && (phase === "list" || phase === "armed")}
          <Button
            data-stop-other
            label={words.other(listed)}
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
          variant="destructive"
        />
      </div>
    </div>
  </section>
{/if}
