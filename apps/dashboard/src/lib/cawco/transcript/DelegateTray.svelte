<script lang="ts">
  /**
   * The delegate tray: one compact chip per delegate this session has working,
   * in a row standing on the composer, so the reader scrolled far from a
   * delegate's card still sees what it is doing. A chip enters the first time
   * its card leaves the view (tray.svelte.ts), shows what the delegate is
   * doing in words and one mark, opens a panel with the detail on hover or
   * press, and leaves on its own once the work is done.
   *
   * The row has two zones. Working delegates stand at its start in the order
   * they were made, never reordered as their state changes, and those that
   * do not fit stand behind a "+N" chip at the zone's end. Failures leave
   * that zone: they stand at the row's end as one chip ("N failed", or the
   * one failure's own chip), so a failure never takes a working slot and is
   * never counted in "+N".
   *
   * Pressing "+N" or the failure chip opens the shelf: a block between the
   * row and the composer's field, inside the dock, which grows upward while
   * the transcript keeps its room (Transcript `shelfHeight`), so nothing is
   * drawn over the log. Folded delegates are listed there; each failure is
   * a row that ends one of three ways: Retry (the same item runs again, and
   * its chip goes back to its place in the row), Replaced by (a later item
   * of this session took its work over) or Dismiss with a reason.
   */
  import type { WorkItemSummary } from "@cawco/core";
  import { tick, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconAsk,
    IconChevronDown,
    IconClose,
    IconExternal,
    IconStop,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cawco, dismissWorkItem, retryWorkItem } from "../client.svelte";
  import { age } from "../find/find-rows";
  import HoverPanel from "../HoverPanel.svelte";
  import { conversationHref } from "../links";
  import { markHue, sessionSprite } from "../mark";
  import { CURVE, dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { land } from "../motion/share.svelte";
  import { pressOutside } from "../press-outside";
  import RowFault from "../RowFault.svelte";
  import DelegateTail, { type TailNote } from "./DelegateTail.svelte";
  import { layoutScale } from "./grown";
  import { askDetailOf, askShortOf, matchesSession } from "./present";
  import {
    admit,
    cardVisible,
    type Entry,
    entered,
    flightKey,
    left,
    trayNews,
    trayReveal,
  } from "./tray.svelte";

  let {
    parentId,
    held = false,
    onshelf,
  }: {
    /**
     * The session whose delegates the tray shows: its own, and as its
     * project's lead the ones it co-parents.
     */
    parentId: string;
    /** A swipe is carrying the conversation: the chips wait. */
    held?: boolean;
    /** The shelf's height as drawn, px, frame by frame; 0 once it has shut. */
    onshelf?: (px: number) => void;
  } = $props();

  /** How long a finished chip stays on screen, counted only while it is seen. */
  const HOLD = 6000;
  /** How long a new delegate's card has to come on screen before its chip simply appears. */
  const SETTLE = 1500;
  /**
   * The least a chip's floor can be (it shrinks to its floor, its title
   * ellipsised) and the gap after it, for the overflow count; the "+N" chip
   * and its gap. What does not fit at the floor goes into "+N", so the row
   * never passes the composer's edge. A chip's own floor is measured
   * (`floors`): only its title gives way, so a chip with a note ("2
   * questions", "cancelled") cannot be as narrow as one without.
   */
  const CHIP = 120;
  const GAP = 7;
  const MORE = 59;
  /**
   * The fewest characters of its title, and of its state ("queued for a
   * heavy-run slot behind 2 checks, 4m", "2 questions"), a chip in the row
   * shows: cut shorter, either reads as noise, so the chip goes into "+N"
   * instead. A state this short or shorter is shown whole.
   */
  const TITLE_FLOOR = 8;
  const NOTE_FLOOR = 12;
  let ruler: CanvasRenderingContext2D | null = null;
  /** A text's floor as drawn: its first `chars` characters and the ellipsis, in its own face. */
  function textFloor(part: HTMLElement, chars: number): number {
    const text = part.textContent ?? "";
    const style = getComputedStyle(part);
    ruler ??= document.createElement("canvas").getContext("2d");
    if (!ruler) {
      return 0;
    }
    ruler.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const shown = text.length > chars ? `${text.slice(0, chars)}…` : text;
    return Math.ceil(ruler.measureText(shown).width) + 1;
  }

  type Tone =
    | "starting"
    | "running"
    | "asked"
    | "needs"
    | "done"
    | "cancelled"
    | "failed";
  interface Chip {
    entry: Entry;
    item: WorkItemSummary;
    /** The pending question: the delegate's own (needs you), or the one it put to this session. */
    question: string;
    questions: number;
    tone: Tone;
  }

  const panelId = $props.id();
  const shelfId = `${panelId}-shelf`;
  /** Delegates that existed before this tray: their chips are simply there. */
  const mountedAt = Date.now();

  const items = $derived(cawco.workItemsOf(parentId));

  const toChip = (item: WorkItemSummary): Chip => {
    const pending = cawco.session(item.instanceId)?.pending ?? [];
    const own = pending.filter((each) => !each.routedTo);
    const routed = pending.filter((each) => each.routedTo === "parent");
    let tone: Tone;
    if (item.state === "failed") {
      tone = "failed";
    } else if (item.state === "cancelled") {
      tone = "cancelled";
    } else if (item.state === "done") {
      tone = "done";
    } else if (own.length > 0) {
      tone = "needs";
    } else if (routed.length > 0) {
      tone = "asked";
    } else if (item.state === "starting") {
      tone = "starting";
    } else {
      tone = "running";
    }
    const asking = own[0] ?? routed[0];
    return {
      item,
      tone,
      entry: entered.get(item.instanceId) ?? "none",
      questions: own.length,
      question: asking
        ? (own[0] ? askDetailOf : askShortOf)(
            asking.toolName,
            asking.input as Parameters<typeof askShortOf>[1]
          )
        : "",
    };
  };

  const chips = $derived(
    items
      .filter(
        (item) =>
          entered.has(item.instanceId) &&
          !left.has(item.id) &&
          item.dismissedAt === null
      )
      .map(toChip)
  );
  /** The row's two zones: the work in creation order, and the failures owed a decision. */
  const working = $derived(chips.filter((chip) => chip.tone !== "failed"));
  const failures = $derived(chips.filter((chip) => chip.tone === "failed"));
  /** The one failure drawn as its own chip, when it is the only one. */
  const lone = $derived(failures.length === 1 ? failures[0] : null);
  /** The failure chip's key: the lone failure's id, or "failed" for the count. */
  const failKey = $derived(lone ? lone.item.id : "failed");

  /* ---- entering without a flight ------------------------------------- */

  /** When the tray first heard of each item. */
  const known = new Map<string, number>();
  const candidate = (item: WorkItemSummary, now: number): boolean =>
    item.dismissedAt === null &&
    (item.state === "starting" ||
      item.state === "running" ||
      item.state === "failed" ||
      (item.endedAt !== null && now - item.endedAt < HOLD));

  /* ---- the finished chip's hold -------------------------------------- */

  /** How long each finished chip has been on screen, by item id. */
  const shownFor = new SvelteMap<string, number>();
  let hovering = $state(false);
  let focusedKey = $state<string | null>(null);
  let openKey = $state<string | null>(null);
  /** What the shelf lists while it is open: the failures, or what "+N" holds. */
  let shelf = $state<"failed" | "more" | null>(null);

  const TICK = 250;

  /**
   * A delegate whose card has had its chance to be on screen and is not:
   * its chip comes in by itself — faded in if it started while the tray was
   * here, simply there if it was already running when the page loaded.
   */
  function admitWaiting(now: number): void {
    for (const item of items) {
      known.set(item.id, known.get(item.id) ?? now);
      const waiting =
        !(entered.has(item.instanceId) || left.has(item.id)) &&
        candidate(item, now) &&
        now - (known.get(item.id) ?? now) >= SETTLE;
      if (waiting && !cardVisible(item.instanceId)) {
        admit(item.instanceId, item.createdAt < mountedAt ? "none" : "fade");
      }
    }
  }

  /**
   * Counts a finished chip's time on screen; paused while it is not being
   * seen, or is being read. A chip that finished while the tray watched,
   * once its check has had LIFT to be seen, flies to its report if that row
   * is in view; otherwise it stays out its hold and goes.
   */
  function holdFinished(now: number): void {
    const paused =
      document.hidden || hovering || openKey !== null || shelf !== null;
    for (const { item, tone, entry } of working) {
      if (!(tone === "done" || tone === "cancelled")) {
        continue;
      }
      // At load, one that finished moments ago shows for what is left.
      const start =
        entry === "none" && item.endedAt !== null
          ? Math.max(0, now - item.endedAt)
          : 0;
      const sofar = shownFor.get(item.id) ?? start;
      const next = paused || focusedKey === item.id ? sofar : sofar + TICK;
      shownFor.set(item.id, next);
      const target =
        tone === "done" &&
        next >= LIFT &&
        openKey !== item.id &&
        (item.endedAt ?? 0) > mountedAt
          ? reportInView(item)
          : null;
      if (target) {
        fly(item, target);
      } else if (next >= HOLD) {
        left.add(item.id);
      }
    }
  }

  /* ---- the flight home ------------------------------------------------ */

  /** The seen time a finished chip holds its check before it may fly: the pulse, then a beat. */
  const LIFT = 1000;

  /** The delegate's newest report in this session's transcript. */
  const reportOf = (item: WorkItemSummary) =>
    (cawco.session(parentId)?.messages ?? []).findLast(
      (m) =>
        m.type === "user.peer" &&
        m.metadata?.reportKind !== undefined &&
        matchesSession(m.metadata?.peerSession, item.instanceId)
    );

  /** The report's row, when it is drawn inside its transcript's view, above the composer. */
  function reportInView(item: WorkItemSummary): HTMLElement | null {
    const id = reportOf(item)?.id;
    if (!(id && root)) {
      return null;
    }
    const foot = root.getBoundingClientRect().top;
    for (const row of document.querySelectorAll<HTMLElement>(
      `[data-message="${CSS.escape(id)}"]`
    )) {
      const view = row.closest('[role="log"]')?.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      if (
        view &&
        view.height > 0 &&
        box.height > 0 &&
        box.top >= view.top &&
        box.top + Math.min(box.height, 28) <= Math.min(view.bottom, foot)
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * The chip lifts off and lands on its report's label line: a copy flies
   * (translate and scale on one clock) while the chip's slot closes, then
   * fades as the row, held clear while it flew, fades in.
   */
  function fly(item: WorkItemSummary, target: HTMLElement): void {
    const chip = chipEl(item.id);
    // A chip folded away behind "+N" has nowhere to lift off from.
    const seen = chip?.checkVisibility({ visibilityProperty: true });
    if (!(chip && seen && motionOk.current)) {
      left.add(item.id);
      target.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-menu"),
        easing: CURVE.out,
      });
      return;
    }
    const from = chip.getBoundingClientRect();
    const copy = chip.cloneNode(true) as HTMLElement;
    for (const name of ["data-key", "data-flip", "data-flip-enter", "id"]) {
      copy.removeAttribute(name);
    }
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    copy.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;inline-size:${from.width}px;block-size:${from.height}px;margin:0;z-index:50;pointer-events:none;transform-origin:0 0`;
    document.body.append(copy);
    chip.style.visibility = "hidden";
    target.style.opacity = "0";
    left.add(item.id);
    // biome-ignore lint/complexity/noVoid: the flight runs on its own; nothing waits on it.
    void flight(copy, from, target.getBoundingClientRect(), target);
  }
  async function flight(
    copy: HTMLElement,
    from: DOMRect,
    to: DOMRect,
    target: HTMLElement
  ): Promise<void> {
    const line = Math.min(to.height, 26);
    const scale = Math.min(1, line / from.height);
    const dy = to.top + (line - from.height * scale) / 2 - from.top;
    await copy.animate(
      [
        { transform: "none" },
        {
          transform: `translate(${to.left - from.left}px, ${dy}px) scale(${scale})`,
        },
      ],
      // A flight and a half: the chip travels further than a row moves.
      {
        duration: dur("--dur-panel") * 1.5,
        easing: CURVE.inOut,
        fill: "forwards",
      }
    ).finished;
    const landing = { duration: dur("--dur-menu"), easing: CURVE.out };
    target.style.removeProperty("opacity");
    target.animate([{ opacity: 0 }, { opacity: 1 }], landing);
    await copy.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...landing,
      fill: "forwards",
    }).finished;
    copy.remove();
  }

  /**
   * The tray's beat: the interval only marks the time, and the tray reads
   * its chips in an effect on that mark. A tray leaving (Composer's keyed
   * fade, on every switch) is paused until its fade ends; a paused tray's
   * effects do not run, so nothing reads its chips once it is on its way
   * out, while the interval itself goes with the tray.
   */
  let beatAt = $state<number | null>(null);
  $effect(() => {
    const beat = setInterval(() => {
      beatAt = Date.now();
    }, TICK);
    return () => clearInterval(beat);
  });
  $effect(() => {
    const now = beatAt;
    if (now === null) {
      return;
    }
    untrack(() => {
      admitWaiting(now);
      holdFinished(now);
    });
  });

  /* ---- overflow ------------------------------------------------------ */

  /**
   * The row's width, as the size observer delivers it after a layout. The
   * tray is mounted afresh on every tab switch (Composer's `{#key
   * delegatesOf}`), and a `clientWidth` binding reads the width as it
   * mounts: that read laid the page out in the click, with the pane just
   * shown still to be styled, ~1,900 elements in that task. The delivery
   * comes before the frame is painted, so the first frame drawn has the fit.
   */
  let hostBox = $state<DOMRectReadOnly>();
  const rowWidth = $derived(hostBox?.width ?? 0);
  /**
   * Each chip's floor as drawn, by item: what does not give way in it (its
   * mark, its state glyph, its padding and gaps), its title's floor and its
   * state's (`textFloor`), never under CHIP. Both texts give way down to
   * their floors, which each holds as its least width, so a long state
   * ("queued for a heavy-run slot behind …") is cut inside its chip instead
   * of widening it. The fit counts these, and each chip in the row is held
   * to its own, so the count and the row cannot disagree.
   *
   * Counted whole, the state made a queued chip's floor about 400px; held
   * to that, the chip stretched across the row and every chip after it
   * folded into "+N" (owner: "why the delegate chips here show +9 even
   * though there's space for them").
   */
  const floors = new SvelteMap<string, number>();
  const floorOf = (id: string): number => floors.get(id) ?? CHIP;
  function measureFloor(id: string) {
    return (node: HTMLElement) => {
      const title = node.querySelector<HTMLElement>('[data-slot="title"]');
      const take = () => {
        const note = node.querySelector<HTMLElement>('[data-slot="note"]');
        const titleLeast = title ? textFloor(title, TITLE_FLOOR) : 0;
        const noteLeast = note ? textFloor(note, NOTE_FLOOR) : 0;
        for (const [part, least] of [
          [title, titleLeast],
          [note, noteLeast],
        ] as const) {
          if (part && part.style.minInlineSize !== `${least}px`) {
            part.style.minInlineSize = `${least}px`;
          }
        }
        const fixed =
          node.scrollWidth -
          (title?.clientWidth ?? 0) -
          (note?.clientWidth ?? 0);
        const floor = Math.max(CHIP, Math.ceil(fixed + titleLeast + noteLeast));
        if (floors.get(id) !== floor) {
          floors.set(id, floor);
        }
      };
      // Its parts change size with its state (a note arrives, a glyph
      // swaps); the chip's own box may not, held as it is by the row.
      const watch = new ResizeObserver(take);
      for (const part of node.querySelectorAll(
        '[data-slot="mark"], [data-slot="words"], [data-slot="note"], [data-slot="slot"]'
      )) {
        watch.observe(part);
      }
      watch.observe(node);
      return () => {
        watch.disconnect();
      };
    };
  }
  /** The "N failed" chip's width as drawn: it never gives way. */
  let countWidth = $state(0);
  /** What the failure chip and its gap take from the working zone. */
  const failRoom = $derived(
    failures.length === 0
      ? 0
      : (lone ? floorOf(lone.item.id) : countWidth) + GAP
  );
  const fit = $derived.by(() => {
    const total = working.length;
    if (rowWidth === 0) {
      return total;
    }
    const room = rowWidth - failRoom;
    for (let n = total; n >= 1; n -= 1) {
      const hidden = total - n;
      let width = (n - 1) * GAP + (hidden ? MORE : 0);
      for (const chip of working.slice(0, n)) {
        width += floorOf(chip.item.id);
      }
      if (width <= room) {
        return n;
      }
    }
    // Not one chip fits beside "+N" (a phone with failures): "+N" holds
    // them all, so the row still ends inside the composer.
    return 0;
  });
  const shown = $derived(working.slice(0, fit));
  const hidden = $derived(working.slice(fit));
  /** Every chip in the row, in order: the work, "+N", the failure chip. */
  const keys = $derived([
    ...shown.map((chip) => chip.item.id),
    ...(hidden.length ? ["more"] : []),
    ...(failures.length ? [failKey] : []),
  ]);

  /* ---- words ---------------------------------------------------------- */

  let minute = $state(Date.now());
  $effect(() => {
    const clock = setInterval(() => {
      minute = Date.now();
    }, 60_000);
    return () => clearInterval(clock);
  });
  const span = (from: number, to: number): string => {
    const m = Math.floor((to - from) / 60_000);
    if (m < 1) {
      return "<1m";
    }
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  /** An age that is a span ("2h"), not a date ("Oct 3"). */
  const SPAN = /^\d/;
  /** When it failed, as a failure row says it: "failed 2h ago". */
  const failedWhen = (item: WorkItemSummary): string => {
    const at = age(item.endedAt ?? item.createdAt, minute);
    if (at === "now") {
      return "failed just now";
    }
    return SPAN.test(at) ? `failed ${at} ago` : `failed ${at}`;
  };
  /** Why a queued delegate waits, as its chip says it: its machine's pause, or the files it owns. */
  const queuedWords = (item: WorkItemSummary): string => {
    if (!item.queued) {
      return "";
    }
    return item.queued.paused
      ? `queued: ${item.queued.paused}`
      : `queued: owns ${item.queued.owns.join(", ")}`;
  };
  /** What its landing waits for (a shared machine slot, its turn to land), as its chip says it, with how long. */
  const checkQueueWords = (item: WorkItemSummary): string =>
    item.checkQueue
      ? `${item.checkQueue.words}, ${span(item.checkQueue.since, minute)}`
      : "";
  const stateWords = (chip: Chip): string => {
    if (chip.item.queued) {
      return queuedWords(chip.item);
    }
    if (chip.item.checkQueue) {
      return checkQueueWords(chip.item);
    }
    // Its machine is paused: it runs no turn until the pause ends.
    if (chip.item.machinePaused) {
      return chip.item.machinePaused;
    }
    switch (chip.tone) {
      case "needs":
        return `needs you, ${questionWords(chip.questions)}`;
      case "asked":
        return "running, asked this session a question";
      case "cancelled":
      case "done":
      case "failed":
      case "running":
      case "starting":
        break;
    }
    return chip.tone;
  };
  const questionWords = (n: number) =>
    n === 1 ? "1 question" : `${n} questions`;
  const hrefOf = (item: WorkItemSummary) =>
    conversationHref(item.instanceId, cawco.instanceIndex);

  /* ---- what the tray says out loud ------------------------------------ */

  /** Each chip's last announced tone; a chip seen first is recorded silently at load. */
  const said = new Map<string, Tone>();
  let politeQueue: string[] = [];
  let flush: ReturnType<typeof setTimeout> | undefined;
  /** What a chip's change says, if anything: polite news, or an urgent question. */
  const PHRASE: Partial<Record<Tone, string>> = {
    done: "finished",
    failed: "failed",
    cancelled: "was cancelled",
  };
  function newsOf(
    { item, tone, entry }: Chip,
    was: Tone | undefined
  ): { urgent?: string; polite?: string } {
    if (was === tone || (was === undefined && entry === "none")) {
      return {};
    }
    if (tone === "needs") {
      return { urgent: `${item.title} has a question` };
    }
    const phrase = was === undefined ? "started" : PHRASE[tone];
    return phrase ? { polite: `${item.title} ${phrase}` } : {};
  }
  $effect(() => {
    const now = chips;
    untrack(() => {
      let urgent = "";
      for (const chip of now) {
        const news = newsOf(chip, said.get(chip.item.id));
        said.set(chip.item.id, chip.tone);
        urgent = news.urgent ?? urgent;
        if (news.polite) {
          politeQueue.push(news.polite);
        }
      }
      if (urgent) {
        trayNews.set(parentId, {
          polite: trayNews.get(parentId)?.polite ?? "",
          assertive: urgent,
          at: Date.now(),
        });
      }
      if (politeQueue.length && !flush) {
        // A burst is said once: every change in it, in one sentence.
        flush = setTimeout(() => {
          trayNews.set(parentId, {
            polite: `${politeQueue.join(". ")}.`,
            assertive: "",
            at: Date.now(),
          });
          politeQueue = [];
          flush = undefined;
        }, 400);
      }
    });
  });
  $effect(() => () => clearTimeout(flush));

  /* ---- the panel ------------------------------------------------------ */

  let root = $state<HTMLElement>();
  let row = $state<HTMLElement>();
  let pinned = $state(false);
  let gliding = $state(false);
  let place = $state({ x: 0, span: 0, origin: 0, room: 320 });
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;

  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const chipEl = (key: string) =>
    root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;
  /** The room over the tray, up to the top of the composer's dock. */
  const roomOver = (tray: HTMLElement): number => {
    const dock = tray.closest('[data-slot="dock"]') ?? document.documentElement;
    // In the layout's px: the panel may still be rising out of its scale.
    const over =
      tray.getBoundingClientRect().top - dock.getBoundingClientRect().top;
    return over / layoutScale(tray) - 16;
  };

  function open(key: string, pin: boolean): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    const chip = chipEl(key);
    if (!(chip && row && root)) {
      return;
    }
    // The panel stands at its chip; its own width (it sizes to its content)
    // pulls it back inside the row's right edge, in CSS.
    gliding = openKey !== null && openKey !== key;
    place = {
      x: Math.max(0, chip.offsetLeft),
      span: row.clientWidth,
      origin: chip.offsetWidth / 2,
      room: Math.min(320, roomOver(root)),
    };
    openKey = key;
    pinned = pin || pinned;
  }
  function close(): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    openKey = null;
    pinned = false;
    gliding = false;
  }

  // A chip that leaves takes its panel with it.
  $effect(() => {
    if (openKey && !keys.includes(openKey)) {
      untrack(close);
    }
  });

  /** How long the pointer rests on a chip before its panel opens. */
  const DWELL = 350;

  function onchipenter(key: string): void {
    if (!fine()) {
      return;
    }
    clearTimeout(closing);
    clearTimeout(dwell);
    // "+N" and "N failed" open the shelf on a press, never on a rest.
    if (key === "more" || key === "failed") {
      if (openKey !== null && !pinned) {
        close();
      }
      return;
    }
    // A panel already open moves along the row with the pointer.
    if (openKey !== null && !pinned) {
      open(key, false);
    } else if (openKey === null) {
      dwell = setTimeout(() => open(key, false), DWELL);
    }
  }
  function onpress(key: string, event: MouseEvent): void {
    if (key === "more" || key === failKey) {
      close();
      toggleShelf(key === "more" ? "more" : "failed", key, event);
      return;
    }
    // A finished chip whose report is in the transcript takes the reader there.
    const done = working.find(
      (chip) => chip.item.id === key && chip.tone === "done"
    );
    const report = done ? reportOf(done.item)?.id : undefined;
    if (report) {
      close();
      closeShelf(false);
      trayReveal.set(parentId, report);
      return;
    }
    if (openKey === key && pinned) {
      close();
    } else {
      open(key, true);
    }
  }
  function onrootleave(): void {
    hovering = false;
    clearTimeout(dwell);
    if (fine() && openKey !== null && !pinned) {
      closing = setTimeout(close, 300);
    }
  }

  /* ---- the shelf ------------------------------------------------------ */

  let shelfEl = $state<HTMLElement>();
  /** The chip that opened the shelf: focus goes back to it as it shuts. */
  let opener = "";
  /** The shelf's height as drawn, frame by frame while it unfolds. */
  let shelfPx = $state(0);

  function toggleShelf(
    kind: "failed" | "more",
    key: string,
    event: MouseEvent
  ): void {
    if (shelf === kind) {
      closeShelf(true);
      return;
    }
    shelf = kind;
    opener = key;
    // Opened from the keys (a click with no pointer), focus goes in with it.
    if (event.detail === 0) {
      tick().then(() =>
        shelfEl
          ?.querySelector<HTMLElement>(
            '[data-slot="srow"] :is(button:not(:disabled), a), [data-slot="shead"] button'
          )
          ?.focus()
      );
    }
  }
  function closeShelf(refocus: boolean): void {
    if (shelf === null) {
      return;
    }
    if (refocus || shelfEl?.contains(document.activeElement)) {
      (chipEl(opener) ?? chipEl(keys[0] ?? ""))?.focus();
    }
    shelf = null;
    allReason = null;
  }
  // Nothing left to list: the shelf shuts.
  $effect(() => {
    if (
      (shelf === "failed" && failures.length === 0) ||
      (shelf === "more" && hidden.length === 0)
    ) {
      untrack(() => closeShelf(false));
    }
  });
  // The opener changed shape (a lone failure became "2 failed"): focus and
  // the way back follow the chip that stands there now.
  $effect(() => {
    if (shelf === "failed") {
      opener = failKey;
    }
  });
  $effect(() => {
    onshelf?.(shelfPx);
  });
  $effect(() => () => onshelf?.(0));

  // An outside press closes a pinned panel, and the shelf.
  $effect(() => {
    if (!(root && ((openKey && pinned) || shelf))) {
      return;
    }
    return pressOutside(root, () => {
      close();
      closeShelf(false);
    });
  });

  /**
   * The shelf's fold: open on --dur-panel, shut on --dur-exit (The Fast
   * Exit Rule). Two transitions, not one: a bidirectional one keeps the
   * length it was first made with, and shut over the opening's 280ms.
   */
  const shelfIn = (node: HTMLElement): TransitionConfig =>
    unfold(node, { ms: dur("--dur-panel") }, { direction: "in" });
  const shelfOut = (node: HTMLElement): TransitionConfig =>
    unfold(node, { ms: dur("--dur-exit") }, { direction: "out" });

  /**
   * The list shows four rows on a desk and three on a compact screen, then
   * scrolls inside itself: its height stops at the next row's top.
   */
  function capRows(node: HTMLElement) {
    const take = () => {
      const compact = matchMedia("(width < 640px), (pointer: coarse)").matches;
      const rows = [
        ...node.querySelectorAll<HTMLElement>(':scope > [data-slot="srow"]'),
      ].filter((one) => !one.inert);
      const next = rows[compact ? 3 : 4];
      const cap = next ? `${next.offsetTop}px` : "";
      if (node.style.maxBlockSize !== cap) {
        node.style.maxBlockSize = cap;
      }
      for (const one of rows) {
        sizes.observe(one);
      }
    };
    const sizes = new ResizeObserver(take);
    const rowsChange = new MutationObserver(take);
    rowsChange.observe(node, { childList: true });
    take();
    return () => {
      sizes.disconnect();
      rowsChange.disconnect();
    };
  }

  /** The failures, newest first. */
  const failedRows = $derived(
    [...failures].sort(
      (a, b) =>
        (b.item.endedAt ?? b.item.createdAt) -
        (a.item.endedAt ?? a.item.createdAt)
    )
  );
  /** The items of this tray made after `item`: what can have replaced it. */
  const laterThan = (item: WorkItemSummary) =>
    items.filter(
      (other) => other.id !== item.id && other.createdAt > item.createdAt
    );

  /* ---- a failure's three ways out ------------------------------------- */

  type Act = "retry" | "replace" | "dismiss";
  /** The act each row has under way: its button pending until the hub answers. */
  const acting = new SvelteMap<string, Act>();
  /** A row's refusal, said under it with the way to try again. */
  const faults = new SvelteMap<
    string,
    { again: () => unknown; reason: string }
  >();
  /** The rows whose actions have become the reason field, and what it holds. */
  const reasons = new SvelteMap<string, string>();

  async function act(
    item: WorkItemSummary,
    kind: Act,
    call: () => Promise<void>
  ): Promise<void> {
    if (acting.has(item.id)) {
      return;
    }
    acting.set(item.id, kind);
    faults.delete(item.id);
    try {
      await call();
      reasons.delete(item.id);
    } catch (error) {
      faults.set(item.id, {
        reason: failureWords(error),
        again: () => act(item, kind, call),
      });
    } finally {
      acting.delete(item.id);
    }
  }
  const retry = (item: WorkItemSummary) =>
    act(item, "retry", () => retryWorkItem(item.id));
  const replace = (item: WorkItemSummary, by: string) =>
    act(item, "replace", () => dismissWorkItem(item.id, { replacedBy: by }));
  function dismiss(item: WorkItemSummary): void {
    const reason = (reasons.get(item.id) ?? "").trim();
    if (reason) {
      // biome-ignore lint/complexity/noVoid: the row says how it went.
      void act(item, "dismiss", () => dismissWorkItem(item.id, { reason }));
    }
  }
  async function startReason(id: string): Promise<void> {
    reasons.set(id, "");
    await tick();
    shelfEl
      ?.querySelector<HTMLInputElement>(
        `[data-shelf-row="${CSS.escape(id)}"] input`
      )
      ?.focus();
  }
  async function cancelReason(id: string): Promise<void> {
    reasons.delete(id);
    await tick();
    shelfEl
      ?.querySelector<HTMLElement>(
        `[data-shelf-row="${CSS.escape(id)}"] [data-act="dismiss"]`
      )
      ?.focus();
  }

  /** The footer's one reason for every failure listed: null until it is asked for. */
  let allReason = $state<string | null>(null);
  let allPending = $state(false);
  let allField = $state<HTMLInputElement | null>(null);
  async function dismissAll(): Promise<void> {
    const reason = (allReason ?? "").trim();
    if (!reason || allPending) {
      return;
    }
    allPending = true;
    await Promise.all(
      failures.map(({ item }) =>
        act(item, "dismiss", () => dismissWorkItem(item.id, { reason }))
      )
    );
    allPending = false;
    if (failures.length === 0 || faults.size === 0) {
      allReason = null;
    }
  }

  function onshelfkey(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const field = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-shelf-row]"
    );
    const id = field?.dataset.shelfRow;
    if (id && reasons.has(id) && event.target instanceof HTMLInputElement) {
      // biome-ignore lint/complexity/noVoid: focus lands after the field goes.
      void cancelReason(id);
      return;
    }
    if (allReason !== null && event.target === allField) {
      allReason = null;
      return;
    }
    closeShelf(true);
  }

  /**
   * Escape with the shelf open and focus nowhere in particular (a pointer
   * opened it, and a chip takes no focus from a press): it shuts, and focus
   * goes to its chip.
   */
  function onwindowkey(event: KeyboardEvent): void {
    const at = document.activeElement;
    if (
      event.key === "Escape" &&
      shelf &&
      !event.defaultPrevented &&
      (!at || at === document.body)
    ) {
      event.preventDefault();
      closeShelf(true);
    }
  }

  /* ---- keyboard: one tab stop, arrows between chips ------------------ */

  let current = $state(0);
  $effect(() => {
    if (current > keys.length - 1) {
      current = Math.max(0, keys.length - 1);
    }
  });
  function onkeydown(event: KeyboardEvent): void {
    // Escape closes the panel, then the shelf.
    if (event.key === "Escape" && openKey) {
      event.preventDefault();
      const key = openKey;
      close();
      chipEl(key)?.focus();
      return;
    }
    if (event.key === "Escape" && shelf) {
      event.preventDefault();
      event.stopPropagation();
      closeShelf(true);
      return;
    }
    const at = keys.indexOf(
      (event.target as HTMLElement).closest<HTMLElement>("[data-key]")?.dataset
        .key ?? ""
    );
    if (at < 0) {
      return;
    }
    const to = {
      ArrowRight: Math.min(keys.length - 1, at + 1),
      ArrowLeft: Math.max(0, at - 1),
      Home: 0,
      End: keys.length - 1,
    }[event.key];
    if (to === undefined) {
      return;
    }
    event.preventDefault();
    current = to;
    chipEl(keys[to])?.focus();
  }

  /* ---- motion --------------------------------------------------------- */

  /** The whole row, the first time a chip is in it: fades up, unless every chip was simply there. */
  const quiet = $derived(chips.every((chip) => chip.entry === "none"));

  /**
   * The row comes and goes in the room the composer keeps for it from its
   * first render (app.css `--c-tray-row`): opacity only, so nothing standing
   * on it or under it moves. Growing its height instead, a first chip
   * arriving after the switch lifted the suggestion row 35px.
   */
  function rowFade(_node: Element): TransitionConfig {
    return {
      duration: quiet ? 0 : dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }

  /**
   * The check or the triangle taking the dot's place: drawn in from its
   * leading edge over --dur-pop as it grows from 0.6.
   */
  function slotIn(_node: Element, ends: boolean): TransitionConfig {
    if (!(ends && motionOk.current)) {
      return {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t) => `opacity: ${t}`,
      };
    }
    return {
      duration: dur("--dur-pop"),
      easing: easeOut,
      css: (t, u) =>
        `transform: scale(${(0.6 + 0.4 * t).toFixed(3)}); clip-path: inset(0 ${(u * 100).toFixed(1)}% 0 0)`,
    };
  }
  function slotOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }

  const slotOf = (tone: Tone) =>
    tone === "asked" || tone === "needs" ? "ask" : tone;
  const openChip = $derived(
    chips.find((chip) => chip.item.id === openKey) ?? null
  );

  /** The open panel's delegate, whose live tail the panel watches (HoverPanel). */
  const openInstance = $derived(openChip?.item.instanceId ?? null);

  /** The row the tail ends on: the question waiting, or the failure. */
  const noteOf = ({ item, tone, question }: Chip): TailNote | null => {
    if (tone === "needs" || tone === "asked") {
      return {
        key: `${tone}:${question}`,
        kind: tone === "needs" ? "ask" : "asked",
        text: question,
      };
    }
    if (tone === "failed") {
      return {
        key: "fail",
        kind: "fail",
        text: item.firstLines.error || "It failed without saying why.",
      };
    }
    return null;
  };
</script>

<!-- The delegate card's mark, at its size. -->
{#snippet mark(item: WorkItemSummary, flies: boolean)}
  {@const Sprite = sessionSprite(item.instanceId)}
  <!-- literal: 17px -->
  <span
    data-slot="mark"
    aria-hidden="true"
    class="flex-none size-(--mark-size) rounded-xs grid place-items-center bg-mark-overlay bg-(--mark-bg)"
    data-box
    style:--mark-size="17px"
    style:--mark-bg="var(--mark-{markHue(item.instanceId)})"
    {@attach land(() => (flies ? flightKey(item.instanceId) : undefined))}
    ><Sprite class="size-icon-sm block text-mark-glyph" /></span
  >
{/snippet}

<!-- A state's glyph, in the chip's slot or the panel's state cell: 16px
     either way. -->
{#snippet glyph(tone: Tone)}
  {#if tone === "starting"}
    <Spinner
      aria-hidden="true"
      class="size-icon-md block"
      role="presentation"
    />
  {:else if tone === "running"}
    <!-- literal: 5px -->
    <!-- literal: 50% -->
    <span
      data-slot="dot"
      class="size-(--dot) rounded-(--dot-r) bg-status-live-glyph"
      style:--dot="5px"
      style:--dot-r="50%"
      style:--dot-delay="-{Date.now() % 2000}ms"
    ></span>
  {:else if tone === "asked" || tone === "needs"}
    <IconAsk class="size-icon-md block" />
  {:else if tone === "done"}
    <IconSuccess class="size-icon-md block" />
  {:else if tone === "failed"}
    <IconWarningTriangle class="size-icon-md block" />
  {:else}
    <IconStop class="size-icon-md block" />
  {/if}
{/snippet}

<!-- A delegate's chip in the row: `at` is its place in the keyboard's order.
     The lone failure's chip stands at the row's end and opens the shelf. -->
{#snippet chipButton(chip: Chip, at: number)}
  {@const { item, tone, entry } = chip}
  {@const flies = entry === "fly"}
  {@const failed = tone === "failed"}
  <!-- A chip: the tray row's (app.css .kit-tray-chip), its surface on a
       layer of its own so it can arrive after a mark that flew in. Its
       floor is measured (`measureFloor`); the failure chip stands at the
       row's end, next to the plan. -->
  <button
    data-end={failed || undefined}
    aria-controls={failed ? shelfId : panelId}
    aria-expanded={failed ? shelf === "failed" : openKey === item.id}
    aria-label="{item.title}, {stateWords(chip)}"
    class="group/chip kit-tray-chip touch-hit flex-initial data-end:ms-auto status-failed:text-status-fail-ink"
    data-delegate-tray-tone={tone}
    data-finished={(tone === "done" && (item.endedAt ?? 0) > mountedAt) ||
      undefined}
    data-flip="pop"
    data-flip-enter={entry === "fade" ? undefined : "own"}
    data-fly={flies || undefined}
    data-key={item.id}
    data-status={tone}
    onblur={() => {
      focusedKey = null;
    }}
    onclick={(event) => onpress(item.id, event)}
    onfocus={() => {
      focusedKey = item.id;
      current = at;
    }}
    onmousedown={(event) => event.preventDefault()}
    onpointerenter={() => onchipenter(item.id)}
    tabindex={current === at ? 0 : -1}
    type="button"
    style:--floor="{floorOf(item.id)}px"
    {@attach measureFloor(item.id)}
  >
    {@render mark(item, flies)}
    <span
      data-slot="words"
      aria-hidden="true"
      class="mark-line min-w-0 flex items-baseline gap-c-pill-gap"
      data-box
    >
      <span
        data-slot="title"
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{item.title}</span
      >
      <!-- The state gives way like the title, to its floor (`measureFloor`),
           cut with an ellipsis inside the chip, before its glyph. -->
      {#if item.queued}
        <span
          data-slot="note"
          class="min-w-0 font-normal overflow-clip text-ellipsis whitespace-nowrap"
          >{queuedWords(item)}</span
        >
      {:else if item.checkQueue}
        <span
          data-slot="note"
          class="min-w-0 font-normal overflow-clip text-ellipsis whitespace-nowrap"
          >{checkQueueWords(item)}</span
        >
      {:else if tone === "needs"}
        <span
          data-slot="note"
          class="min-w-0 font-normal overflow-clip text-ellipsis whitespace-nowrap"
          >{questionWords(chip.questions)}</span
        >
      {:else if tone === "failed" || tone === "cancelled"}
        <span
          data-slot="note"
          class="min-w-0 font-normal overflow-clip text-ellipsis whitespace-nowrap"
          >{tone}</span
        >
      {/if}
    </span>
    <span
      data-slot="slot"
      aria-hidden="true"
      class="flex-none size-icon-md grid place-items-center group-status-running/chip:text-ink-muted group-status-done/chip:text-status-done-ink"
      data-box
    >
      {#key slotOf(tone)}
        <span
          data-slot="glyph"
          class="col-start-1 row-start-1 grid place-items-center"
          in:slotIn={tone === "done" || tone === "failed"}
          out:slotOut
        >
          {@render glyph(tone)}
        </span>
      {/key}
    </span>
  </button>
{/snippet}

<!-- One failure in the shelf: what failed and when, why, and its three ways
     out; the reason field in their place while a dismissal is being said. -->
{#snippet failRow(chip: Chip)}
  {@const { item } = chip}
  {@const doing = acting.get(item.id)}
  {@const reason = reasons.get(item.id)}
  {@const later = laterThan(item)}
  <li
    data-slot="srow"
    class="flex flex-col gap-space-1 py-space-3 px-space-4 not-first:border-t not-first:border-t-border-hairline"
    data-flip
    data-shelf-row={item.id}
  >
    <div class="mark-line flex items-center gap-space-2 min-w-0">
      {@render mark(item, false)}
      <span
        class="flex-initial min-w-0 text-size-label font-medium text-ink-strong overflow-clip text-ellipsis whitespace-nowrap"
        >{item.title}</span
      >
      <span
        class="flex-none ms-auto text-size-meta text-ink-muted whitespace-nowrap"
        >{failedWhen(item)}</span
      >
      <!-- literal: 26px -->
      <!-- literal: -5px -->
      <a
        aria-label="Open {item.title} in its own view"
        class="touch-hit flex-none size-(--jump) my-(--jump-my) grid place-items-center rounded-xs text-ink-muted transition-[color,background] dur-control ease-out hover:text-brand-ink hover:bg-surface-hover"
        data-box
        href={hrefOf(item)}
        title="Open {item.title} in its own view"
        style:--jump="26px"
        style:--jump-my="-5px"
      >
        <IconExternal class="size-icon-sm block" />
      </a>
    </div>
    <!-- literal: 17px -->
    <p
      class="m-0 ps-(--serror-start) text-size-meta text-status-fail-ink overflow-clip text-ellipsis whitespace-nowrap"
      style:--serror-start="calc(17px + var(--space-2))"
    >
      {item.firstLines.error || "It failed without saying why."}
    </p>
    {#if reason === undefined}
      <!-- literal: 17px -->
      <div
        class="flex flex-wrap items-center gap-space-2 mt-space-1 ps-(--sacts-start)"
        style:--sacts-start="calc(17px + var(--space-2))"
        style:--hit-gap-x="var(--space-2)"
      >
        <Button
          label="Retry"
          onclick={() => retry(item)}
          pending={doing === "retry"}
          pendingLabel="Retrying…"
          size="sm"
          variant="outline"
        />
        {#if later.length}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  disabled={doing !== undefined && doing !== "replace"}
                  pending={doing === "replace"}
                  size="sm"
                  variant="ghost"
                  ><span>Replaced by</span><IconChevronDown /></Button
                >
              {/snippet}
            </DropdownMenu.Trigger>
            <!-- In the shelf, not the page's top layer: it opens downward
                 over the shelf's own rows, and a press in it is the shelf's. -->
            <DropdownMenu.Content
              align="start"
              class="w-auto min-w-48"
              portalProps={{ disabled: true }}
              side="bottom"
            >
              {#each later as other (other.id)}
                <DropdownMenu.Item onSelect={() => replace(item, other.id)}>
                  {@render mark(other, false)}
                  <span
                    class="flex-auto min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{other.title}</span
                  >
                  <span class="flex-none text-size-meta text-ink-muted"
                    >{other.state}</span
                  >
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else}
          <span
            data-slot="nolater"
            class="inline-flex"
            title="No later item to point at yet"
          >
            <Button disabled size="sm" variant="ghost"
              ><span>Replaced by</span><IconChevronDown /></Button
            >
          </span>
        {/if}
        <Button
          data-act="dismiss"
          disabled={doing !== undefined && doing !== "dismiss"}
          label="Dismiss…"
          onclick={() => startReason(item.id)}
          size="sm"
          variant="ghost"
        />
      </div>
    {:else}
      <!-- literal: 17px -->
      <form
        data-slot="reason"
        class="flex flex-nowrap items-center gap-space-2 mt-space-1 ps-(--sacts-start)"
        onsubmit={(event) => {
          event.preventDefault();
          dismiss(item);
        }}
        style:--sacts-start="calc(17px + var(--space-2))"
        style:--hit-gap-x="var(--space-2)"
      >
        <Input
          aria-label="Why {item.title} is no longer owed"
          bind:value={
            () => reasons.get(item.id) ?? "", (v) => reasons.set(item.id, v)
          }
          class="flex-auto min-w-0 h-c-btn-h-sm"
          placeholder="Why this is no longer owed"
        />
        <Button
          disabled={!reason.trim()}
          label="Dismiss"
          pending={doing === "dismiss"}
          pendingLabel="Dismissing…"
          size="sm"
          type="submit"
          variant="outline"
        />
        <Button
          label="Cancel"
          onclick={() => cancelReason(item.id)}
          size="sm"
          variant="ghost"
        />
      </form>
    {/if}
    <RowFault
      again={faults.get(item.id)?.again}
      reason={faults.get(item.id)?.reason ?? null}
    />
  </li>
{/snippet}

<!-- A delegate "+N" holds, as a row: what it is doing, for how long. -->
{#snippet moreRow(chip: Chip)}
  {@const { item, tone } = chip}
  <li
    data-slot="srow"
    class="flex flex-col gap-space-1 py-space-3 px-space-4 not-first:border-t not-first:border-t-border-hairline"
    data-flip
    data-shelf-row={item.id}
  >
    <div class="mark-line flex items-center gap-space-2 min-w-0">
      {@render mark(item, false)}
      <span
        class="flex-initial min-w-0 text-size-label font-medium text-ink-strong overflow-clip text-ellipsis whitespace-nowrap"
        >{item.title}</span
      >
      <!-- A folded delegate's state gives way before its title does. -->
      <span
        class="flex-initial ms-auto text-size-meta text-ink-muted whitespace-nowrap min-w-0 overflow-clip text-ellipsis"
        data-delegate-tray-tone={tone}
        data-status={tone}>{stateWords(chip)}</span
      >
      <span
        aria-hidden="true"
        class="flex-none size-icon-md grid place-items-center text-ink-muted status-done:text-status-done-ink status-failed:text-status-fail-ink"
        data-delegate-tray-tone={tone}
        data-box
        data-status={tone}
      >
        {@render glyph(tone)}
      </span>
      <span class="flex-none text-size-meta text-ink-muted num"
        >{span(item.createdAt, item.endedAt ?? minute)}</span
      >
      {#if !item.queued}
        <!-- literal: 26px -->
        <!-- literal: -5px -->
        <a
          aria-label="Open {item.title} in its own view"
          class="touch-hit flex-none size-(--jump) my-(--jump-my) grid place-items-center rounded-xs text-ink-muted transition-[color,background] dur-control ease-out hover:text-brand-ink hover:bg-surface-hover"
          data-box
          href={hrefOf(item)}
          title="Open {item.title} in its own view"
          style:--jump="26px"
          style:--jump-my="-5px"
        >
          <IconExternal class="size-icon-sm block" />
        </a>
      {/if}
    </div>
  </li>
{/snippet}

<svelte:window onkeydown={onwindowkey} />

<!-- Always laid out, so the row's width is known before its first chip. The
     row stops short of the plan's chip at its end (Composer `--ring-room`);
     the shelf under it spans the whole composer. -->
<div
  data-slot="host"
  class="pointer-events-none pe-(--host-end)"
  style:--host-end="var(--ring-room, 0px)"
  bind:contentRect={hostBox}
>
  {#if chips.length}
    <!-- The row of chips, standing a step off the composer's top edge: no
         surface of its own, one line, never wrapping or scrolling sideways.
         Its chip and step are the app's tray tokens, the row the composer
         keeps. The shelf, open, stands between the row and that step. -->
    <div
      data-slot="tray"
      class="relative pb-c-tray-gap"
      onpointerenter={() => {
        hovering = true;
        clearTimeout(closing);
      }}
      onpointerleave={onrootleave}
      role="presentation"
      bind:this={root}
      transition:rowFade
    >
      <!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is toolbar or group (a binding the rule cannot read); both take a label. -->
      <div
        data-slot="row"
        aria-label="Delegates"
        class="flex flex-nowrap items-center gap-space-2 overflow-visible"
        inert={held}
        {onkeydown}
        role={keys.length >= 3 ? "toolbar" : "group"}
        style:--hit-gap-x="var(--space-2)"
        bind:this={row}
        {@attach reflow()}
      >
        {#each shown as chip, i (chip.item.id)}
          {@render chipButton(chip, i)}
        {/each}
        {#if hidden.length}
          <!-- literal: 224px -->
          <!-- literal: 52px -->
          <button
            data-needs={hidden.some((chip) => chip.tone === "needs") ||
              undefined}
            data-slot="more"
            aria-controls={shelfId}
            aria-expanded={shelf === "more"}
            aria-label="{hidden.length} more delegates"
            class="kit-tray-chip touch-hit flex-none min-w-0 max-w-(--chip-max) w-(--more-w) justify-center num data-needs:text-status-attn-ink"
            data-flip="pop"
            data-key="more"
            onclick={(event) => onpress("more", event)}
            onfocus={() => {
              current = shown.length;
            }}
            onmousedown={(event) => event.preventDefault()}
            onpointerenter={() => onchipenter("more")}
            tabindex={current === shown.length ? 0 : -1}
            type="button"
            style:--chip-max="224px"
            style:--more-w="52px"
          >
            +{hidden.length}
          </button>
        {/if}
        <!-- "N failed": the triangle and the count, whole. -->
        {#if lone}
          {@render chipButton(lone, keys.length - 1)}
        {:else if failures.length}
          <!-- literal: 224px -->
          <button
            data-delegate-tray-failed
            data-slot="end"
            data-delegate-tray-count
            aria-controls={shelfId}
            aria-expanded={shelf === "failed"}
            aria-label="{failures.length} failed delegates"
            class="kit-tray-chip touch-hit flex-none min-w-0 max-w-(--chip-max) whitespace-nowrap ms-auto text-status-fail-ink"
            data-flip="pop"
            data-key="failed"
            onclick={(event) => onpress("failed", event)}
            onfocus={() => {
              current = keys.length - 1;
            }}
            onmousedown={(event) => event.preventDefault()}
            onpointerenter={() => onchipenter("failed")}
            tabindex={current === keys.length - 1 ? 0 : -1}
            type="button"
            style:--chip-max="224px"
            bind:offsetWidth={countWidth}
          >
            <span
              data-slot="slot"
              aria-hidden="true"
              class="flex-none size-icon-md grid place-items-center"
              data-box><IconWarningTriangle class="size-icon-md block" /></span
            >
            <span data-slot="num" class="num">{failures.length} failed</span>
          </button>
        {/if}
      </div>

      {#if shelf}
        <!-- The shelf, between the row and the field: the dock grows up for
             it and the transcript keeps its room, so it covers no line. -->
        <!-- What unfolds: the step under the row, and the shelf's surface,
             a raised card in the dock, concentric with the composer's pill. -->
        <div
          data-slot="shelf-slot"
          class="me-(--slot-end) pt-c-tray-gap pointer-events-auto"
          inert={held}
          onoutroend={() => {
            shelfPx = 0;
          }}
          style:--slot-end="calc(-1 * var(--ring-room, 0px))"
          bind:clientHeight={shelfPx}
          in:shelfIn
          out:shelfOut
        >
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape inside the shelf (a row's reason field, then the shelf) is heard on the region; every control in it is its own button or field -->
          <section
            data-slot="shelf"
            aria-label={shelf === "failed"
              ? "Failed delegates"
              : "More delegates"}
            class="flex flex-col border border-border-hairline rounded-lg bg-surface-raised shadow-tile overflow-clip"
            id={shelfId}
            onkeydown={onshelfkey}
            bind:this={shelfEl}
            {@attach morph({ rows: true })}
          >
            <header
              data-slot="shead"
              class="flex items-center gap-space-2 py-space-2 pr-space-2 pl-space-4 border-b border-b-border-hairline"
            >
              <h2
                class="flex-auto min-w-0 m-0 text-size-label font-medium text-ink-strong"
              >
                {#if shelf === "failed"}
                  {failures.length === 1
                    ? "1 failure needs a decision"
                    : `${failures.length} failures need a decision`}
                {:else}
                  {hidden.length === 1
                    ? "1 more delegate"
                    : `${hidden.length} more delegates`}
                {/if}
              </h2>
              <Button
                aria-label="Close"
                class="touch-hit"
                onclick={() => closeShelf(true)}
                size="icon-sm"
                variant="ghost"><IconClose /></Button
              >
            </header>
            <ul
              data-slot="slist"
              class="relative m-0 p-0 list-none overflow-y-auto overscroll-contain"
              {@attach reflow()}
              {@attach capRows}
            >
              {#if shelf === "failed"}
                {#each failedRows as chip (chip.item.id)}
                  {@render failRow(chip)}
                {/each}
              {:else}
                {#each hidden as chip (chip.item.id)}
                  {@render moreRow(chip)}
                {/each}
              {/if}
            </ul>
            {#if shelf === "failed" && failures.length > 1}
              <footer
                data-slot="sfoot"
                class="py-space-2 px-space-4 border-t border-t-border-hairline"
              >
                {#if allReason === null}
                  <Button
                    label="Dismiss all {failures.length} with one reason…"
                    onclick={async () => {
                      allReason = "";
                      await tick();
                      allField?.focus();
                    }}
                    size="sm"
                    variant="ghost"
                  />
                {:else}
                  <form
                    data-slot="reason"
                    class="flex flex-nowrap items-center gap-space-2 m-0 p-0"
                    onsubmit={(event) => {
                      event.preventDefault();
                      // biome-ignore lint/complexity/noVoid: each row says how it went.
                      void dismissAll();
                    }}
                    style:--hit-gap-x="var(--space-2)"
                  >
                    <Input
                      aria-label="Why all {failures.length} are no longer owed"
                      class="flex-auto min-w-0 h-c-btn-h-sm"
                      placeholder="Why these are no longer owed"
                      bind:ref={allField}
                      bind:value={allReason}
                    />
                    <Button
                      disabled={!allReason.trim()}
                      label="Dismiss all"
                      pending={allPending}
                      pendingLabel="Dismissing…"
                      size="sm"
                      type="submit"
                      variant="outline"
                    />
                    <Button
                      label="Cancel"
                      onclick={() => {
                        allReason = null;
                      }}
                      size="sm"
                      variant="ghost"
                    />
                  </form>
                {/if}
              </footer>
            {/if}
          </section>
        </div>
      {/if}

      <!-- The house hover panel; its mousedown is swallowed so a phone's
           keyboard stays up (its controls are links and buttons). -->
      <HoverPanel
        {gliding}
        id={panelId}
        key={openKey}
        onmousedown={(event) => event.preventDefault()}
        onpointerenter={() => clearTimeout(dwell)}
        role="presentation"
        side="above"
        style="--origin: {place.origin}px; --rise: 0px; --room: {place.room}px; --span: {place.span}px; --x: {place.x}px"
        watch={openInstance}
      >
        {#snippet children()}
          {#if openChip}
            {@const { item, tone } = openChip}
            <!-- The panel's surface, motion and size are the house hover
                 panel's (HoverPanel); what is in it is drawn here. Its head:
                 the mark, the title, and at the end the time it has taken
                 and its state as a glyph. -->
            <div class="mark-line flex items-center gap-space-2 mb-space-2">
              {@render mark(item, false)}
              <span
                class="flex-auto min-w-0 text-size-label font-medium text-ink-strong overflow-clip text-ellipsis whitespace-nowrap"
                >{item.title}</span
              >
              <span
                aria-label={stateWords(openChip)}
                class="flex-none size-icon-md grid place-items-center text-ink-muted status-done:text-status-done-ink status-failed:text-status-fail-ink"
                data-delegate-tray-tone={tone}
                data-box
                data-status={tone}
                role="img"
              >
                {@render glyph(tone)}
              </span>
              <span class="flex-none text-size-meta text-ink-muted num"
                >{span(item.createdAt, item.endedAt ?? minute)}</span
              >
              <!-- A queued delegate has no session to open until it starts.
                   The delegate card's way out to its own view, as the card
                   draws it. -->
              {#if !item.queued}
                <!-- literal: 26px -->
                <!-- literal: -5px -->
                <a
                  aria-label="Open {item.title} in its own view"
                  class="touch-hit flex-none size-(--jump) my-(--jump-my) grid place-items-center rounded-xs text-ink-muted transition-[color,background] dur-control ease-out hover:text-brand-ink hover:bg-surface-hover"
                  data-box
                  href={hrefOf(item)}
                  title="Open {item.title} in its own view"
                  style:--jump="26px"
                  style:--jump-my="-5px"
                >
                  <IconExternal class="size-icon-sm block" />
                </a>
              {/if}
            </div>
            <DelegateTail
              instanceId={item.instanceId}
              note={noteOf(openChip)}
            />
            {#if tone === "needs"}
              <div data-slot="acts" class="mt-space-3 flex gap-space-2">
                <Button href={hrefOf(item)} size="sm" variant="outline"
                  >Open question</Button
                >
              </div>
            {/if}
          {/if}
        {/snippet}
      </HoverPanel>
    </div>
  {/if}
</div>

<style>
  /* residual: keyframes */
  /* The mark flew in; the chip's surface and words come in after it. */
  @media (prefers-reduced-motion: no-preference) {
    [data-fly]::before,
    [data-fly] [data-slot="words"],
    [data-fly] [data-slot="slot"] {
      animation: arrive var(--dur-menu) var(--ease-out) var(--dur-control) both;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-fly] {
      animation: arrive var(--dur-menu) var(--ease-out) both;
    }
  }
  @keyframes arrive {
    from {
      opacity: 0;
    }
  }
  /* Finished while watched: one soft pulse of the success tint (after the
     arrival rules, which it replaces on a chip that flew in). */
  [data-finished]::before {
    animation: finish calc(var(--dur-fade) * 2) var(--ease-out);
  }
  @keyframes finish {
    35% {
      background-color: var(--status-done-bg);
    }
  }

  /* residual: pseudo */
  /* The chip's surface (.kit-tray-chip's ::before) in its state's tint. */
  button[data-status="needs"]::before,
  [data-needs]::before {
    background-color: var(--status-attn-bg);
  }
  button[data-status="failed"]::before,
  [data-slot="end"]::before {
    background-color: var(--status-fail-bg);
  }

  /* residual: unmapped */
  /* A delegate that needs you, in the ask ink wherever its state shows:
     its chip, its folded row's words, its state cell. */
  [data-status="needs"] {
    color: var(--status-attn-ink);
  }
  /* The slot's glyph in the muted ink for the states with no tone of their
     own (running's and done's are utilities on the slot). */
  :is(
      [data-status="starting"],
      [data-status="asked"],
      [data-status="cancelled"]
    )
    [data-slot="slot"] {
    color: var(--ink-muted);
  }
  [data-status="cancelled"] [data-slot="note"] {
    color: var(--ink-muted);
  }
  /* The dot's phase, set from the clock so every running dot reads as one
     beat; animation-delay has no utility. */
  [data-slot="dot"] {
    animation-delay: var(--dot-delay);
  }
  /* A working chip's floor and cap (--c-tray-chip-min, --c-tray-chip-max).
     fly() clones the chip and rewrites the copy's inline style, so both
     come from here, where the copy keeps them; the live chip's measured
     floor (inline --floor) comes first. */
  button[data-key][data-status] {
    min-inline-size: var(--floor, var(--c-tray-chip-min));
    max-inline-size: var(--c-tray-chip-max);
  }
</style>
