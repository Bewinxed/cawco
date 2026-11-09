<script lang="ts">
  import type { Activity } from "@cawco/core/activity";
  import { commonWords } from "@cawco/core/words/common";
  import type { EndWords } from "@cawco/core/words/project-ends";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  /**
   * A forget's or a delete's tray (Caw off's is CawOffTray, each row
   * checked to stop): one tray that changes shape as a stop goes,
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
   * A delete asks one more thing before its press: "Also delete its files
   * on disk", a checkbox under its words. Checked, the checkouts it removes
   * stand listed, each its machine and path; unchecked, it says what it
   * leaves (its sessions' transcripts, which a machine may list again as
   * sessions with no project). Once pressed, the box holds what was chosen.
   *
   * With sessions running it lists them as the rail nests them (each lead
   * with its delegates) on one button, "Stop 3 and …", whose press stops
   * them all in one request. Only when that would cut a turn short (a row
   * Working or Needs you, `midTurn`) does the first press arm instead,
   * "Stop 3 mid-turn and …", its words growing the warning in place, and
   * the second one stops. A row turns Stopped only
   * when the hub says its machine confirmed the end (`project.stop`), never
   * at the ask; then its tile leaves the row and flies into the button's
   * icon slot, where a ring fills a share per landing while the row folds
   * shut behind it (delegates before the session that started them). The last landing makes
   * the ring whole, the kind's end runs ("Forgetting…"), and the ring
   * becomes the check ("Forgotten"), held where it was asked before the
   * page goes on. A failure keeps the state: the row says why, and Try
   * again stops what is left.
   *
   * A session whose machine is away cannot be stopped now: its row says
   * "Stops when <machine> is back" from the start. The second press has the
   * hub record its stop, which the machine's next register carries out; once
   * it is recorded (`deferred`) the ring counts it, and it neither flies nor
   * folds. A session that keeps such a delegate stays with it.
   *
   * Each state has its own height (the body's morph): the list, one line
   * shorter armed, a row shorter per landing, the short "Stopped 3
   * sessions." at the end, a line taller for a failure.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconNeedsYou as Attention,
    IconCloudCross as Away,
    IconError as Failed,
    IconArchive,
    IconDeleteForGood,
    IconPause as Pause,
    IconRenew as Working,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { CURVE, dur, motionOk } from "../platform/motion/curves.svelte";
  import { echoBeat } from "../platform/motion/echo.svelte";
  import { fold, unfold } from "../platform/motion/fold.svelte";
  import { glyphIn, glyphOut } from "../platform/motion/glyph";
  import { departBox, land } from "../platform/motion/share.svelte";
  import { STOPPED_LABEL, STOPPING_LABEL } from "./activity";
  import FromDiskBox from "./FromDiskBox.svelte";
  import { resolveSessionTitle } from "./links";
  import { sessionSprite } from "./mark";
  import RowFault from "./RowFault.svelte";
  import type { StopJob, StopRow } from "./stop-work.svelte";
  import TreeLine from "./TreeLine.svelte";
  import TreeMark from "./TreeMark.svelte";
  import { flatTree, lineAttrs } from "./tree-lines";

  let {
    class: className,
    job,
    words,
    share,
    activityOf,
    nameOf,
    fillOf,
    trailOf,
    onconfirm,
    oncancel,
    onkeep,
    onfromdisk,
    onstopone,
    onarrive,
    ondepart,
    ongone,
    ...rest
  }: {
    /** The host's indent for the tray (`--ask-indent`, `--ask-end`). */
    class?: string;
    /** The end as it stands: read here, changed only through the events below. */
    job: StopJob;
    /** Its end's words (`endWordsOf`). */
    words: EndWords;
    /** The key it travels under, into its parked place and back (`stopShare`). */
    share: string;
    /** What each row's turn is doing. */
    activityOf: (id: string) => Activity;
    /** A machine's name by its id. */
    nameOf: (machineId: string) => string;
    /** A row's mark colour, a `var(--mark-N)`. */
    fillOf: (row: StopRow) => string;
    /** A row's trailing figure: its turn's age, or how long its stop has waited. */
    trailOf: (row: StopRow) => string;
    /** The confirm, pressed. */
    onconfirm: () => void;
    /** Cancel before the press, Close once done, or Escape: the tray goes (stops under way park). */
    oncancel: () => void;
    /** Keep project, while the stops land or after a refusal: the end does not run. */
    onkeep: () => void;
    /** Delete's files box, changed. */
    onfromdisk: (on: boolean) => void;
    /** A failed row's Try again. */
    onstopone: (id: string) => void;
    /** A stopped row's tile landed in the button (or, without its flight, was counted). */
    onarrive: (row: StopRow) => void;
    /** A stopped row's tile left it. */
    ondepart: (row: StopRow) => void;
    /** A stopped row folded shut. */
    ongone: (row: StopRow) => void;
    /** Its attachments (where it stands, its place to park): on its section. */
    [key: symbol]: unknown;
  } = $props();

  /** This tray's own: its rows' tiles fly under it into the button, and its title is named by it. */
  const uid = $props.id();

  /** A tile copy in the button's slot, flying in from its row. */
  interface Arrival {
    fill: string;
    id: string;
  }

  const rows = $derived(job.rows);
  const phase = $derived(job.phase);
  const total = $derived(job.total);
  /** The rows a stop now would cut mid-turn (stop-work `midTurn`). */
  const cut = $derived(
    rows.filter(
      (row) => row.state === "running" && activityOf(row.s.id) !== "idle"
    ).length
  );
  let arrivals = $state<Arrival[]>([]);
  /** The press that armed it is still settling: no press carries through. */
  let inert = false;
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
   * Puts the tray away. Stops under way are parked and go on: the tray
   * travels into the place they are parked (The One Object Rule).
   */
  export function leave(): void {
    if (
      tile &&
      (phase === "stopping" || phase === "fail" || phase === "ending")
    ) {
      departBox(share, tile, false);
    }
    arrivals = [];
    oncancel();
  }

  /* ── The presses ────────────────────────────────────────────────── */

  function press(): void {
    if (inert) {
      return;
    }
    if (phase === "list" && cut > 0) {
      // A double-click never carries through the arming morph into the stop.
      inert = true;
      after(dur("--duration-panel"), () => {
        inert = false;
      });
    }
    onconfirm();
  }

  /* ── A stopped row's flight ─────────────────────────────────────── */

  /** The last tile to leave a row, for the stagger between departures. */
  let lastLeft = Number.NEGATIVE_INFINITY;

  /**
   * The row's tile leaves for the button and the row folds shut behind it.
   * A session waits for its delegates' tiles to leave first; a tile leaving
   * within a flight of the one before goes --duration-stagger after it.
   */
  export function fly(row: StopRow): void {
    if (row.departed || row.state !== "stopped" || !job.open) {
      return;
    }
    const kids = rows.filter((each) => each.s.parentId === row.s.id);
    if (kids.some((kid) => !(kid.departed || kid.arrived))) {
      return;
    }
    if (kids.some((kid) => !kid.departed)) {
      // A delegate stays (its machine is away): its parent stays with it,
      // counted, so the tree under it is never folded away.
      onarrive(row);
      return;
    }
    const at = performance.now();
    const due = lastLeft + dur("--duration-stagger");
    if (at - lastLeft < dur("--duration-panel") && due > at) {
      after(due - at, () => fly(row));
      return;
    }
    lastLeft = at;
    ondepart(row);
    const node = items.get(row.s.id);
    const rowTile = node?.querySelector<HTMLElement>(
      ':scope > [data-slot="rin"] .tile'
    );
    const moving = motionOk.current && node && rowTile;
    if (moving) {
      departBox(`${uid}-stop:${row.s.id}`, rowTile, false);
      arrivals.push({ id: row.s.id, fill: fillOf(row) });
      fold(node, false, {
        ms: dur("--duration-panel"),
        easing: CURVE.inOut,
      })?.finished.then(
        () => gone(row),
        () => gone(row)
      );
      node
        .querySelector(':scope > [data-slot="rin"]')
        ?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: dur("--duration-exit"),
          easing: CURVE.out,
          fill: "forwards",
        });
      after(dur("--duration-panel"), () => arrive(row));
    } else {
      // Less motion: no flight; the row fades shut with its tile.
      if (node) {
        fold(node, false, {
          ms: dur("--duration-exit"),
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
    ongone(row);
  }

  /** The tile has landed: it fades into the ring, which takes its share. */
  function arrive(row: StopRow): void {
    arrivals = arrivals.filter((each) => each.id !== row.s.id);
    onarrive(row);
  }

  /* ── What each part says ─────────────────────────────────────────── */

  const description = $derived(
    words.line(
      phase,
      phase === "list" || phase === "armed" ? listed : total,
      cut,
      done()
    )
  );
  /** A delete's box can still change: its press has not gone. */
  const choosing = $derived(
    phase === "none" || phase === "list" || phase === "armed"
  );

  /** What the stops did: "Stopped 2 sessions. 1 stops when obelisk is back."; nothing when none ran. */
  function done(): string {
    if (rows.length === 0) {
      return "";
    }
    const away = rows.filter((row) => row.state === "away");
    const endedLine = `Stopped ${stopped} ${plural(stopped, "session", "sessions")}.`;
    if (away.length === 0) {
      return endedLine;
    }
    const machines = [...new Set(away.map((row) => nameOf(row.s.machineId)))];
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
      case "armed": {
        // A turn that ended while armed leaves nothing to warn of.
        return cut > 0 ? words.armed(listed, cut) : words.stop(listed);
      }
      case "fail":
        return commonWords.tryAgain;
      case "done":
        return words.ended;
      case "ending":
      case "stopping":
        break;
    }
    // While the stops land and the end runs: what was pressed.
    return total > 0 ? words.stop(total) : words.plain;
  });
  // The count winds down as stops land, and holds at the last one while its
  // tile is still on its way: the ending word is next.
  const pendingLabel = $derived(
    phase === "stopping" ? `Stopping ${Math.max(left, 1)}…` : words.ending
  );
  const pending = $derived(phase === "stopping" || phase === "ending");
  /**
   * The button in Cancel's place says what it does: before the press it
   * drops the ask; while the stops land or after a refusal it ends the
   * attempt and keeps the project; while the end itself runs nothing can
   * call it back, so it is not there; once done it closes.
   */
  const cancelLabel = $derived.by(() => {
    switch (phase) {
      case "stopping":
      case "fail":
        return words.keep;
      case "done":
        return projectEndWords.close;
      case "ending":
        return null;
      case "none":
      case "list":
      case "armed":
        return projectEndWords.cancel;
    }
  });
  const cancelPress = () =>
    phase === "stopping" || phase === "fail" ? onkeep() : leave();

  /** A row's place in the tree: under its lead when its lead is listed, else a root of its own. */
  const rootOf = (row: StopRow): string | null =>
    row.s.parentId !== null && rows.some((each) => each.s.id === row.s.parentId)
      ? row.s.parentId
      : null;
  /** The rows still listed under `parentId`: a lead's own, or the roots. */
  const shownUnder = (parentId: string | null) =>
    rows.filter((row) => rootOf(row) === parentId && !row.gone);
  /** The rows as one flat tree on the nesting lines (tree-lines.ts). */
  const tree = $derived(
    flatTree(
      shownUnder(null),
      (row) => shownUnder(row.s.id),
      (row) => row.s.id
    )
  );
  /** The ring's share: only a tray with sessions to stop counts. */
  const progress = $derived.by(() => {
    if (rows.length === 0) {
      return;
    }
    return total > 0 ? arrivedCount / total : 0;
  });

  /* ── A row ───────────────────────────────────────────────────────── */

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
        word: `Stops when ${nameOf(row.s.machineId)} is back`,
        icon: Away,
        tone: "quiet",
      } as const;
    }
    const activity = activityOf(row.s.id);
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
    const activity = activityOf(row.s.id);
    if (activity === "blocked") {
      return "attn" as const;
    }
    return activity === "working" ? ("live" as const) : undefined;
  }

  /** The rows' columns: mark and title, status, trailing figure. */
  const TRAY_COLS = "minmax(0, 1fr) max-content max-content";

  /** A landed tile fades into the ring, as an old glyph fades. */
  const intoRing = glyphOut;
</script>

{#snippet branch()}
  {#each tree as entry (entry.key)}
    {@const { line, node: row } = entry}
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
    <!-- Away, on a narrow tray, its status takes a second line: its mark
         stands at the top of a first line as tall as the mark, and its
         lines meet it there. -->
    <li
      class="kit-tree-row col-span-full grid grid-cols-subgrid @max-stop-tray/stop-tray:has-data-away:kit-tree-on-mark"
      {...lineAttrs(line)}
      data-row={row.s.id}
      style:--line-depth={line.depth}
      {@attach item(row.s.id)}
    >
      <TreeLine {line} />
      <div
        data-slot="rin"
        class="col-span-full grid min-w-0 grid-cols-subgrid"
        style:--fault-end="var(--row-compact-pad-end)"
        style:--fault-indent={"calc(var(--row-compact-gap) * 2 + var(--mark-size, var(--spacing-space-5)))"}
      >
        <!-- The row's three cells stand on the list's columns (subgrid): its
             mark and title, then its status as wide as the widest status
             shown, then its trailing figure, so the title takes all the
             room the others leave. A nested list's inset moves only the
             first. -->
        <div
          data-slot="row"
          class="group col-span-full grid min-h-(--row-compact-h) grid-cols-subgrid items-center py-0 pr-(--row-compact-pad-end) pl-(--row-compact-gap) text-ink-strong"
          data-away={row.state === "away" || undefined}
        >
          <span
            data-slot="lead"
            class="mark-line flex min-w-0 items-center gap-(--row-compact-gap)"
            data-box
          >
            <TreeMark
              count={kids.length}
              faceAlways
              fill={fillOf(row)}
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
          </span>
          <!-- Away, on a narrow tray: its long status takes a line of its
               own under the title. -->
          <span
            data-slot="status"
            class="mark-line inline-flex items-center gap-space-1 text-size-label font-medium whitespace-nowrap text-ink-muted @max-stop-tray/stop-tray:group-data-away:col-span-full @max-stop-tray/stop-tray:group-data-away:row-start-2 @max-stop-tray/stop-tray:group-data-away:ps-(--stat-away-indent) @max-stop-tray/stop-tray:group-data-away:pb-space-1"
            data-stop-tray-tone={status.tone}
            data-box
            style:--stat-away-indent={"calc(var(--mark-size, var(--spacing-space-5)) + var(--row-compact-gap))"}
          >
            <span
              data-slot="glyph"
              class={[
                "inline-grid flex-none @min-stop-tray-rail/stop-tray:@max-stop-tray/stop-tray:hidden",
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
            <!-- In the rail's room the glyph says it alone; the title's
                 hidden words say it to a reader. -->
            <span
              class={[
                "@max-stop-tray-rail/stop-tray:hidden",
                status.tone === "failed" && "text-status-fail-ink",
              ]}><MorphText text={status.word} /></span
            >
          </span>
          <span
            data-slot="num"
            class="num type-meta text-end whitespace-nowrap text-ink-muted @max-stop-tray/stop-tray:group-data-away:row-start-1 @max-stop-tray/stop-tray:group-data-away:col-start-3 @max-stop-tray-rail/stop-tray:hidden"
            >{trailOf(row)}</span
          >
        </div>
        <RowFault
          again={() => onstopone(row.s.id)}
          class="col-span-full"
          reason={row.state === "failed" ? row.error : null}
        />
      </div>
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
    {...rest}
  >
    <!-- One column as wide as the tile, never its rows' widest title: a
         row truncates inside it rather than pushing the confirm out. -->
    <div
      bind:this={tile}
      data-slot="tile"
      class="grid grid-cols-1 gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
      {@attach land(() => share)}
    >
      <div data-slot="head" class="flex min-w-0 gap-space-3">
        <div data-slot="words" class="grid min-w-0 flex-auto gap-space-1">
          <p
            data-slot="title"
            class="m-0 min-w-0 flex-auto overflow-clip type-label text-balance text-ellipsis whitespace-nowrap text-ink-strong"
            id="{uid}-title"
          >
            {phase === "done" ? words.titleDone : words.title}
          </p>
          <!-- As wide as the head, whatever its words: sized to them, it
               followed the morph's own box and narrowed mid-morph. Its
               words say each state ("Stopped 3 sessions."), so they are
               announced as they change. -->
          <!-- No line where its words are empty (a delete with nothing
               stopped, once it runs). -->
          <p
            aria-live="polite"
            class="m-0 type-meta text-ink-muted data-empty:hidden"
            data-empty={description === "" || undefined}
          >
            {#if description !== ""}
              <MorphText text={description} wrap />
            {/if}
          </p>
        </div>
      </div>
      {#if rows.some((row) => !row.gone)}
        <ul
          data-slot="sessions"
          aria-label="Running sessions"
          class="kit-tree grid grid-cols-(--tray-cols) gap-x-(--row-compact-gap) overflow-x-clip clip-margin-space-2"
          data-roots="touch"
          style:--tray-cols={TRAY_COLS}
          {@attach echoBeat()}
        >
          {@render branch()}
        </ul>
      {/if}
      {#if job.kind === "delete"}
        <FromDiskBox
          checked={job.fromDisk}
          disabled={!choosing}
          onchange={onfromdisk}
          places={job.places.map((place) => ({
            machine: nameOf(place.machineId),
            path: place.path,
            within: place.within.map((one) => one.name),
          }))}
        />
      {/if}
      <!-- The end refused: the hub's words, beside the confirm that goes on
           from here, from the title's own start. -->
      <RowFault end="0" indent="0" reason={job.refusal} />
      <div data-slot="actions" class="flex flex-wrap justify-end gap-space-2">
        {#if cancelLabel !== null}
          <Button
            data-stop-cancel
            label={cancelLabel}
            onclick={cancelPress}
            size="sm"
            variant="ghost"
          />
        {/if}
        <Button
          arrivals={landed}
          data-stop-confirm
          failed={phase === "fail"}
          icon={job.kind === "delete" ? IconDeleteForGood : IconArchive}
          label={confirmLabel}
          onclick={press}
          {pending}
          {pendingLabel}
          {progress}
          size="sm"
          variant={job.kind === "delete" && phase !== "done"
            ? "destructive"
            : "outline"}
        />
      </div>
    </div>
  </section>
{/if}
