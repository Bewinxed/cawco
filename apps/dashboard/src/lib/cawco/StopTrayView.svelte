<script lang="ts">
  import type { Activity } from "@cawco/core/activity";
  import { cawOffWords } from "@cawco/core/words/caw-off";
  import { commonWords } from "@cawco/core/words/common";
  import type { EndWords } from "@cawco/core/words/project-ends";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  /**
   * Every turn-off's tray (a forget, a delete for good, Caw turned off):
   * one tray that changes shape as a stop goes,
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
   * Caw off (`caw-off`) asks which of what he started stops: each row has
   * its box, all checked, and over them "All N running" checks or clears
   * them all (checking a row checks everything under it; unchecking it
   * unchecks everything under it and the leads above it, so a stopped lead
   * never leaves its delegates running). Its confirm turns him off and
   * stops the checked rows; the unchecked ones are kept, run on, fold out
   * of the list as it is pressed and are not counted. The boxes stay
   * through the stops, settled, so nothing under them moves. While it asks
   * and stops, its line says what asleep means; once he is off, what
   * stopped. Its Cancel while the stops land is Stop waiting, which parks
   * them: nothing calls back a Caw already off.
   *
   * It stands in the page as a tile (`section`), or is the whole of a card
   * hung from Caw's switch (`card`): the card is its surface, so it draws
   * no tile of its own, its words and actions a row gap in from the rows'
   * fills. Either way every fold, flight and morph plays.
   *
   * Each state has its own height (the body's morph): the list, one line
   * shorter armed, a row shorter per landing, the short "Stopped 3
   * sessions." at the end, a line taller for a failure.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconNeedsYou as Attention,
    IconCloudCross as Away,
    IconError as Failed,
    IconArchive,
    IconDeleteForGood,
    IconMoonSleep,
    IconPause as Pause,
    IconRenew as Working,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import {
    CURVE,
    crossIn,
    crossOut,
    dur,
    motionOk,
  } from "../platform/motion/curves.svelte";
  import { echoBeat } from "../platform/motion/echo.svelte";
  import { fold, unfold } from "../platform/motion/fold.svelte";
  import { glyphIn, glyphOut } from "../platform/motion/glyph";
  import { morph } from "../platform/motion/morph.svelte";
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
    onpick,
    onstopone,
    onarrive,
    ondepart,
    ongone,
    look = "section",
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
    /** Caw off's boxes, changed: the ids now checked (none but his have them). */
    onpick?: (ids: string[]) => void;
    /** A failed row's Try again. */
    onstopone: (id: string) => void;
    /** A stopped row's tile landed in the button (or, without its flight, was counted). */
    onarrive: (row: StopRow) => void;
    /** A stopped row's tile left it. */
    ondepart: (row: StopRow) => void;
    /** A stopped row folded shut. */
    ongone: (row: StopRow) => void;
    /**
     * Where it stands: a tile in the page (`section`), or the whole of a
     * card hung from Caw's switch (`card`), whose surface it is.
     */
    look?: "section" | "card";
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
  /** Caw off: each row is checked to stop, the unchecked ones kept running. */
  const picks = $derived(job.kind === "caw-off");
  /** Before the press: a delete's box and Caw off's boxes can still change. */
  const choosing = $derived(
    phase === "none" || phase === "list" || phase === "armed"
  );
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

  /* ── Caw off's boxes ────────────────────────────────────────────── */

  const on = $derived(new Set(job.picked));
  const under = (id: string): string[] => [
    id,
    ...rows
      .filter((row) => row.s.parentId === id)
      .flatMap((row) => under(row.s.id)),
  ];
  const leadsOf = (id: string): string[] => {
    const lead = rows.find((row) => row.s.id === id)?.s.parentId;
    return lead ? [lead, ...leadsOf(lead)] : [];
  };

  /** A row's box: everything under it turns with it; unchecked, so do the leads above it. */
  function toggle(id: string, next: boolean): void {
    const set = new Set(job.picked);
    for (const each of under(id)) {
      if (next) {
        set.add(each);
      } else {
        set.delete(each);
      }
    }
    if (!next) {
      for (const lead of leadsOf(id)) {
        set.delete(lead);
      }
    }
    onpick?.(rows.filter((row) => set.has(row.s.id)).map((row) => row.s.id));
  }

  const picked = $derived(rows.filter((row) => on.has(row.s.id)).length);
  /** "All N running": while it asks and through the stops, over a list of more than one. */
  const allShown = $derived(
    picks &&
      rows.length > 1 &&
      (choosing || phase === "stopping" || phase === "ending")
  );

  /** What the confirm stops: every row, or Caw off's checked ones. */
  const listed = $derived(picks ? picked : rows.length);
  const stopped = $derived(
    rows.filter((row) => row.state === "stopped").length
  );
  /** Left to stop: neither stopped nor recorded for its machine's return. */
  const left = $derived(
    total -
      stopped -
      rows.filter((row) => row.owed && row.state === "away").length
  );
  /** Landed in the button: a kept row is counted done for the job, never for the ring. */
  const arrivedCount = $derived(
    rows.filter((row) => row.arrived && row.state !== "kept").length
  );
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
    pressedLabel = confirmLabel;
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
      ':scope > [data-slot="rin"] [data-slot="tile"]'
    );
    const moving = motionOk.current && node && rowTile;
    // The gap over the row (the tree's, over a delegate) folds with it, so
    // its removal at the end of the fold moves nothing.
    const gap = node
      ? Number.parseFloat(getComputedStyle(node).marginBlockStart) || 0
      : 0;
    if (moving) {
      departBox(`${uid}-stop:${row.s.id}`, rowTile, false);
      arrivals.push({ id: row.s.id, fill: fillOf(row) });
      fold(node, false, {
        ms: dur("--duration-panel"),
        easing: CURVE.inOut,
        gap,
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
      after(dur("--duration-panel"), () => {
        arrive(row);
        pressConfirm();
      });
    } else {
      // Less motion: no flight; the row fades shut with its tile.
      if (node) {
        fold(node, false, {
          ms: dur("--duration-exit"),
          easing: CURVE.out,
          fade: true,
          gap,
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

  /**
   * A tile has landed in the confirm: it takes the house press for one
   * beat, scaled to --press-scale and back on its own press's clock
   * (button/press.ts: transform over --duration-toggle on --ease-out each
   * way). The transform alone, and none with reduced motion.
   */
  function pressConfirm(): void {
    const button = tile?.querySelector<HTMLElement>("[data-stop-confirm]");
    if (!(motionOk.current && button)) {
      return;
    }
    // Its own --press-scale: 1 where the house holds a press still.
    button.animate(
      [
        { scale: "1", easing: CURVE.out },
        { scale: "var(--press-scale)", easing: CURVE.out },
        { scale: "1" },
      ],
      { duration: dur("--duration-toggle") * 2 }
    );
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
    if (picks) {
      return cawOffWords.done(
        stopped,
        away.length,
        machines.length === 1 ? (machines[0] ?? null) : null
      );
    }
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
        // Caw off with none checked just turns him off.
        return listed === 0 ? words.plain : words.stop(listed);
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
  /** The confirm's words as pressed (an armed warning among them). */
  let pressedLabel = $state<string | null>(null);
  /**
   * Every wording the confirm takes from here to its end, held in its
   * cell (Button `words`): as wide as the widest from the start, and as
   * the one pressed once it is, so nothing in the row moves as its words
   * change ("Stop 3 and turn off", "Stopping 3…", "Caw is off").
   */
  const confirmWords = $derived([
    words.ended,
    commonWords.tryAgain,
    ...(pressedLabel !== null && !choosing ? [pressedLabel] : []),
  ]);
  /** Every wording in Cancel's place, held the same way. */
  const cancelWords = $derived([
    projectEndWords.cancel,
    words.keep,
    picks ? cawOffWords.close : words.keep,
    projectEndWords.close,
  ]);
  /**
   * The button in Cancel's place says what it does: before the press it
   * drops the ask; while the stops land or after a refusal it ends the
   * attempt and keeps the project; while the end itself runs nothing can
   * call it back, so it is not there; once done it closes.
   */
  const cancelLabel = $derived.by(() => {
    switch (phase) {
      case "stopping":
        return words.keep;
      case "fail":
        return picks ? cawOffWords.close : words.keep;
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
  /** Stop waiting parks Caw off's stops: nothing calls back a Caw already off. */
  const cancelPress = () =>
    (phase === "stopping" || phase === "fail") && !picks ? onkeep() : leave();
  /** The confirm's look: Caw off's plain with nothing to stop, else destructive; a delete's destructive; plain once ended. */
  const confirmLook = $derived.by(() => {
    if (phase === "done") {
      return "outline";
    }
    if (picks) {
      return choosing && listed === 0 ? "default" : "destructive";
    }
    return job.kind === "delete" ? "destructive" : "outline";
  });

  /** Still listed: not folded shut; Caw off's, once pressed, only what he stops. */
  const shown = (row: StopRow) =>
    !row.gone && (!picks || choosing || on.has(row.s.id));
  /**
   * The list stands while a row is listed, and through the stops once
   * there were any (emptied as each row folds away) until the end is said.
   */
  const listing = $derived(
    rows.some(shown) || (rows.length > 0 && phase !== "done")
  );
  /** A row's place in the tree: under its nearest listed lead, else a root of its own. */
  function rootOf(row: StopRow): string | null {
    let lead = row.s.parentId;
    while (lead !== null) {
      const at = rows.find((each) => each.s.id === lead);
      if (!at) {
        return null;
      }
      if (shown(at)) {
        return lead;
      }
      lead = at.s.parentId;
    }
    return null;
  }
  /** The rows still listed under `parentId`: a lead's own, or the roots. */
  const shownUnder = (parentId: string | null) =>
    rows.filter((row) => shown(row) && rootOf(row) === parentId);
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
      const machine = nameOf(row.s.machineId);
      return {
        // Caw off's unchecked row runs on: only its machine is away.
        word:
          picks && choosing && !on.has(row.s.id)
            ? cawOffWords.away(machine)
            : `Stops when ${machine} is back`,
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

  /** The rows' columns: mark and title, status, trailing figure, and Caw off's box. */
  const trayCols = $derived(
    `minmax(0, 1fr) max-content max-content${picks ? " max-content" : ""}`
  );

  /**
   * A row that leaves the list unflown (Caw off's kept rows as he is
   * pressed off) or comes back to it (the press refused) folds; a stopped
   * row has already folded shut behind its tile.
   */
  const rowFold = (
    li: HTMLElement,
    _: unknown,
    options: Parameters<typeof unfold>[2]
  ) =>
    li.hasAttribute("data-flown") ? { duration: 0 } : unfold(li, {}, options);

  /** The confirm's rest icon, what the end does: the slot the tiles land in. */
  const CONFIRM_ICON = {
    forget: IconArchive,
    delete: IconDeleteForGood,
    "caw-off": IconMoonSleep,
  } as const;

  /** What a row's status says as it stops: its column is as wide as the widest. */
  const STOP_WORDS = [STOPPING_LABEL, STOPPED_LABEL] as const;

  /** A landed tile fades into the ring, as an old glyph fades. */
  const intoRing = glyphOut;
</script>

{#snippet branch()}
  {#each tree as entry (entry.key)}
    {@const { line, node: row } = entry}
    {@const status = statusOf(row)}
    {@const kids = shownUnder(row.s.id)}
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
      data-flown={row.departed || undefined}
      transition:rowFold
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
             room the others leave; Caw off's box last. A nested list's
             inset moves only the first. While his boxes can change, the
             whole row is its box's label. -->
        <svelte:element
          this={picks && choosing ? "label" : "div"}
          for={picks && choosing ? `${uid}-${row.s.id}` : undefined}
          data-slot="row"
          class={[
            "group col-span-full grid min-h-(--row-compact-h) grid-cols-subgrid items-center py-0 pr-(--row-compact-pad-end) pl-(--row-compact-gap) text-ink-strong",
            picks && "rounded-sm",
            picks && choosing && "hover:bg-surface-hover",
          ]}
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
              {#if shownAs.href && !(picks && choosing)}
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
            <!-- A new word cross-fades over the old one where it stands
                 (crossIn/crossOut, the leaving one pinned out of the flow),
                 the cell as wide as the widest word the stop says (a line
                 of no height each), so the column holds its width and
                 nothing beside it moves as a row stops. The cell is a box
                 on the mark line; its word is the run it trims. -->
            <span
              class={[
                "relative inline-block @max-stop-tray-rail/stop-tray:hidden",
                status.tone === "failed" && "text-status-fail-ink",
              ]}
              data-box
            >
              {#key status.word}
                <span class="mark-text block" in:crossIn out:crossOut
                  >{status.word}</span
                >
              {/key}
              {#each STOP_WORDS as word (word)}
                <span
                  aria-hidden="true"
                  class="invisible block h-0 overflow-clip">{word}</span
                >
              {/each}
            </span>
          </span>
          <span
            data-slot="num"
            class="num type-meta text-end whitespace-nowrap text-ink-muted @max-stop-tray/stop-tray:group-data-away:row-start-1 @max-stop-tray/stop-tray:group-data-away:col-start-3 @max-stop-tray-rail/stop-tray:hidden"
            >{trailOf(row)}</span
          >
          {#if picks}
            <!-- Settled through the stops: only checked rows stand then. -->
            <span
              data-slot="pick"
              class="grid flex-none place-items-center @max-stop-tray/stop-tray:group-data-away:row-start-1 @max-stop-tray/stop-tray:group-data-away:col-start-4"
              data-box
            >
              <Checkbox
                id="{uid}-{row.s.id}"
                aria-label={cawOffWords.stopOne(title)}
                checked={on.has(row.s.id)}
                disabled={!choosing}
                onCheckedChange={(next) => toggle(row.s.id, next)}
              />
            </span>
          {/if}
        </svelte:element>
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
  <!-- Unfolds under what asked for it, in the page's flow. In a card, its
       words and actions stand one row gap in from the rows' fills, as a
       menu's do, the fills one gap in from its edge (the card's
       `c-floating-pad`). -->
  <section
    aria-labelledby="{uid}-title"
    class={cn(
      "@container/stop-tray min-w-0 ps-(--ask-indent) pe-(--ask-end)",
      look === "section" ? "py-space-1" : "py-(--row-compact-gap)",
      className
    )}
    data-stop-tray={job.projectId}
    data-stop-kind={job.kind}
    data-phase={phase}
    style:--ask-indent={look === "card" ? "var(--row-compact-gap)" : undefined}
    style:--ask-end={look === "card" ? "var(--row-compact-gap)" : undefined}
    in:unfold
    out:unfold
    {...rest}
  >
    <!-- One column as wide as the tile, never its rows' widest title: a
         row truncates inside it rather than pushing the confirm out. In a
         card the card is its surface. Its height tweens to each state's.
         A flex column, as the list in it is: what folds out of one gives
         its gap back with it (motion/fold `unfold`), which a grid's gap,
         a track of its own, never lets go of. -->
    <div
      bind:this={tile}
      data-slot="tile"
      class={[
        "flex flex-col gap-space-3",
        look === "section" &&
          "rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised",
      ]}
      {@attach land(() => share)}
      {@attach morph()}
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
          <!-- A new line cross-fades over the old one where it stands
               (crossIn/crossOut, the leaving one pinned out of the flow),
               so the body's morph follows one change of height. -->
          <p
            aria-live="polite"
            class="relative m-0 type-meta text-pretty text-ink-muted data-empty:hidden"
            data-empty={description === "" || undefined}
          >
            {#key description}
              {#if description !== ""}
                <span class="block" in:crossIn out:crossOut>{description}</span>
              {/if}
            {/key}
          </p>
        </div>
      </div>
      {#if listing}
        <!-- It stands, emptied as each row folds behind its tile, until the
             end is said: its last row's fold is the last resize the
             landings make, and it folds away whole at the end, the body's
             morph on its clock. -->
        <div
          data-slot="list"
          class={[
            "flex min-w-0 flex-col gap-space-1",
            look === "card" && "-mx-(--row-compact-gap)",
          ]}
          in:unfold
          out:unfold
        >
          {#if allShown}
            <!-- Caw off's box over the rows, in their box column, checks or
                 clears them all. It stays through the stops, settled, so the
                 list under it holds its place. -->
            <label
              for="{uid}-all"
              data-slot="all"
              class={[
                "mark-line flex min-h-(--row-compact-h) items-center gap-(--row-compact-gap) rounded-sm ps-(--row-compact-gap) pe-(--row-compact-pad-end)",
                choosing && "hover:bg-surface-hover",
              ]}
              in:unfold
              out:unfold
            >
              <span
                data-box
                class="min-w-0 flex-auto type-label text-ink-strong"
                >{cawOffWords.all(rows.length)}</span
              >
              <span
                data-box
                class="grid size-icon-md flex-none place-items-center"
              >
                <Checkbox
                  id="{uid}-all"
                  checked={picked === rows.length}
                  disabled={!choosing}
                  indeterminate={picked > 0 && picked < rows.length}
                  onCheckedChange={(next) => {
                    onpick?.(next ? rows.map((row) => row.s.id) : []);
                  }}
                />
              </span>
            </label>
          {/if}
          <ul
            data-slot="sessions"
            aria-label={picks ? cawOffWords.list : "Running sessions"}
            class="kit-tree grid grid-cols-(--tray-cols) gap-x-(--row-compact-gap) overflow-x-clip clip-margin-space-2"
            data-roots="touch"
            style:--tray-cols={trayCols}
            {@attach echoBeat()}
          >
            {@render branch()}
          </ul>
        </div>
      {/if}
      {#if job.kind === "delete"}
        <FromDiskBox
          checked={job.fromDisk}
          disabled={!choosing}
          onchange={onfromdisk}
          places={job.places.map((place) => ({
            machine: nameOf(place.machineId),
            made: place.made,
            path: place.path,
            within: place.within.map((one) => one.name),
          }))}
        />
      {/if}
      <!-- The end refused: the hub's words, beside the confirm that goes on
           from here, from the title's own start. -->
      <RowFault end="0" indent="0" reason={job.refusal} />
      <div data-slot="actions" class="flex flex-wrap justify-end gap-space-2">
        <!-- While the end itself runs nothing can call it back: it fades
             where it stands, holding its place, and Close fades in there. -->
        <span
          class={[
            "inline-flex transition-[opacity] duration-(--duration-control) ease-out",
            cancelLabel === null && "pointer-events-none opacity-0",
          ]}
          inert={cancelLabel === null}
        >
          <Button
            data-stop-cancel
            label={cancelLabel ?? words.keep}
            onclick={cancelPress}
            size="sm"
            variant="ghost"
            words={cancelWords}
          />
        </span>
        <Button
          arrivals={landed}
          data-stop-confirm
          failed={phase === "fail"}
          icon={CONFIRM_ICON[job.kind]}
          label={confirmLabel}
          onclick={press}
          {pending}
          {pendingLabel}
          {progress}
          size="sm"
          variant={confirmLook}
          words={confirmWords}
        />
      </div>
    </div>
  </section>
{/if}
