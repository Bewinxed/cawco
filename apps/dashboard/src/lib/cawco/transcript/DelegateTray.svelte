<script lang="ts">
  /**
   * The delegate tray: one compact chip per delegate this session has working,
   * in a row standing on the composer, so the reader scrolled far from a
   * delegate's card still sees what it is doing. A chip enters the first time
   * its card leaves the view (tray.svelte.ts), shows what the delegate is
   * doing in words and one mark, opens a panel with the detail on hover or
   * press, and leaves on its own once the work is done. Failed work stays
   * until it is dismissed, on every screen at once.
   *
   * Chips that do not fit the row stand behind a "+N" chip, and come out of
   * it as a fan: the same chips, in a column over "+N", unfolding from its
   * box and folding back into it. A delegate is drawn one way, in the row
   * or in the fan.
   */
  import type { WorkItemSummary } from "@cawco/core";
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconAsk,
    IconExternal,
    IconStop,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cawco, dismissWorkItem } from "../client.svelte";
  import HoverPanel from "../HoverPanel.svelte";
  import { conversationHref } from "../links";
  import { markHue, sessionSprite } from "../mark";
  import { CURVE, dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { land } from "../motion/share.svelte";
  import DelegateTail, { type TailNote } from "./DelegateTail.svelte";
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
  }: {
    /** The session whose own delegates the tray shows. */
    parentId: string;
    /** A swipe is carrying the conversation: the chips wait. */
    held?: boolean;
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
  const fanId = `${panelId}-fan`;
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
  /** The fan over "+N" is out; `fanPinned`, by a press, until the next one. */
  let fanOpen = $state(false);
  let fanPinned = $state(false);

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
    const paused = document.hidden || hovering || openKey !== null || fanOpen;
    for (const { item, tone, entry } of chips) {
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

  let rowWidth = $state(0);
  /**
   * Each chip's floor as drawn, by item: what does not give way in it (its
   * mark, its note, its state, its padding and gaps) and a title of two
   * letters' width, never under CHIP. The fit counts these, and each chip is
   * held to its own, so the count and the row cannot disagree: a chip whose
   * fixed parts outgrow CHIP no longer spills over the next one.
   */
  const floors = new SvelteMap<string, number>();
  const floorOf = (id: string): number => floors.get(id) ?? CHIP;
  function measureFloor(id: string) {
    return (node: HTMLElement) => {
      const title = node.querySelector<HTMLElement>(".title");
      const take = () => {
        const fixed = node.scrollWidth - (title?.clientWidth ?? 0);
        const least = title
          ? Number.parseFloat(getComputedStyle(title).fontSize) * 2
          : 0;
        const floor = Math.max(CHIP, Math.ceil(fixed + least));
        if (floors.get(id) !== floor) {
          floors.set(id, floor);
        }
      };
      // Its parts change size with its state (a note arrives, a glyph
      // swaps); the chip's own box may not, held as it is by the row.
      const watch = new ResizeObserver(take);
      for (const part of node.querySelectorAll(".mark, .words, .note, .slot")) {
        watch.observe(part);
      }
      watch.observe(node);
      return () => {
        watch.disconnect();
      };
    };
  }
  const fit = $derived.by(() => {
    const total = chips.length;
    if (rowWidth === 0) {
      return total;
    }
    for (let n = total; n >= 1; n -= 1) {
      const hidden = total - n;
      let width = (n - 1) * GAP + (hidden ? MORE : 0);
      for (const chip of chips.slice(0, n)) {
        width += floorOf(chip.item.id);
      }
      if (width <= rowWidth) {
        return n;
      }
    }
    return 1;
  });
  const shown = $derived(chips.slice(0, fit));
  const hidden = $derived(chips.slice(fit));
  /** Every chip that can be reached, in order: the row, "+N", then the open fan from "+N" up. */
  const keys = $derived([
    ...shown.map((chip) => chip.item.id),
    ...(hidden.length ? ["more"] : []),
    ...(fanOpen ? hidden.map((chip) => chip.item.id) : []),
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
  const stateWords = (chip: Chip): string => {
    switch (chip.tone) {
      case "needs":
        return `needs you, ${questionWords(chip.questions)}`;
      case "asked":
        return "running, asked this session a question";
      default:
        return chip.tone;
    }
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
  let place = $state({ x: 0, span: 0, origin: 0, room: 320, rise: 0 });
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;

  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const chipEl = (key: string) =>
    root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;
  /** The room over the tray, up to the top of the composer's dock. */
  const roomOver = (tray: HTMLElement): number => {
    const dock = tray.closest(".dock") ?? document.documentElement;
    return (
      tray.getBoundingClientRect().top - dock.getBoundingClientRect().top - 16
    );
  };

  function open(key: string, pin: boolean): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    const chip = chipEl(key);
    if (!(chip && row && root)) {
      return;
    }
    // The panel stands at its chip; its own width (it sizes to its content)
    // pulls it back inside the row's right edge, in CSS. A chip in the fan
    // has the fan's place, and its panel stands over the whole fan.
    const fanned = fan?.contains(chip) ?? false;
    const rise = fanned ? (fan?.offsetHeight ?? 0) : 0;
    gliding = openKey !== null && openKey !== key;
    place = {
      x: fanned ? fanBox.x : Math.max(0, chip.offsetLeft),
      span: row.clientWidth,
      origin: chip.offsetWidth / 2,
      room: Math.min(320, roomOver(root) - rise),
      rise,
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

  /* ---- the fan: what "+N" holds, unfolded over it --------------------- */

  let fan = $state<HTMLElement>();
  /**
   * Where the fan stands: at "+N" (`x`), pulled back inside the row's end
   * by its widest chip (`w`), which leaves "+N" `dx` to the side of it; and
   * the room over the tray, past which it scrolls (`tall`).
   */
  let fanBox = $state({ x: 0, dx: 0, w: 0, room: 320, tall: false });

  function measureFan(): void {
    const more = chipEl("more");
    if (!(more && fan && root)) {
      return;
    }
    const leaves = [...fan.querySelectorAll<HTMLElement>(".leaf")];
    const w = Math.max(0, ...leaves.map((leaf) => leaf.offsetWidth));
    const at = (more.parentElement as HTMLElement).offsetLeft;
    const x = Math.max(0, Math.min(at, root.clientWidth - w));
    const room = roomOver(root);
    fanBox = {
      x,
      w,
      room,
      dx: at - x,
      // The stack's own height: the fan's scroll height also counts the
      // folded chips, which stand a chip below it.
      tall: (fan.firstElementChild as HTMLElement).offsetHeight > room,
    };
  }
  // The row changed (a chip came or went, the window resized): "+N" stands
  // somewhere else, and holds other chips.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: the row's chips and width place the fan.
    void [keys, rowWidth, hidden.length];
    untrack(measureFan);
  });

  function openFan(pin: boolean): void {
    clearTimeout(dwell);
    clearTimeout(closing);
    measureFan();
    fanOpen = true;
    fanPinned = pin || fanPinned;
  }
  // A fan taller than its room opens at "+N", on its nearest chips: once
  // it is open, which is when it scrolls.
  $effect(() => {
    if (fanOpen && fanBox.tall && fan) {
      fan.scrollTop = fan.scrollHeight;
    }
  });
  function closeFan(): void {
    // Focus inside the fan goes back to "+N" as the fan folds into it.
    if (fan?.contains(document.activeElement)) {
      chipEl("more")?.focus();
    }
    fanOpen = false;
    fanPinned = false;
  }
  /** The panel and the fan, both. */
  function shut(): void {
    close();
    closeFan();
  }
  // Nothing left behind "+N": the fan is over.
  $effect(() => {
    if (hidden.length === 0 && fanOpen) {
      untrack(closeFan);
    }
  });

  /**
   * A chip leaving the open fan (its delegate finished, the row made room
   * for it) goes the way the fan closes: back into "+N", fading as it gets
   * there. The chips over it step down by their own transition.
   */
  function fanOut(node: HTMLElement): TransitionConfig {
    if (!fanOpen) {
      return { duration: 0 };
    }
    if (!motionOk.current) {
      return {
        duration: dur("--dur-exit"),
        easing: easeOut,
        css: (t) => `opacity: ${t}`,
      };
    }
    const up = Number.parseFloat(
      getComputedStyle(node).translate.split(" ")[1]
    );
    const down = node.offsetHeight;
    const cut = node.offsetWidth - (chipEl("more")?.offsetWidth ?? 0);
    const { dx } = fanBox;
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t, u) =>
        `pointer-events: none; opacity: ${t}; translate: ${(u * dx).toFixed(2)}px ${(t * up + u * down).toFixed(2)}px; clip-path: inset(0 ${(u * cut).toFixed(2)}px 0 0 round var(--radius-sm))`,
    };
  }

  // A chip that leaves takes its panel with it.
  $effect(() => {
    if (openKey && !keys.includes(openKey)) {
      untrack(close);
    }
  });

  // An outside press closes a pinned panel, and a pinned fan.
  $effect(() => {
    if (!((openKey && pinned) || (fanOpen && fanPinned))) {
      return;
    }
    const press = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) {
        shut();
      }
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  });

  /** How long the pointer rests on a chip before what it opens opens. */
  const DWELL = 350;

  function onchipenter(key: string): void {
    if (!fine()) {
      return;
    }
    clearTimeout(closing);
    clearTimeout(dwell);
    if (key === "more") {
      // From a chip to "+N": that chip's panel goes, the fan comes.
      if (openKey !== null && !pinned) {
        close();
        openFan(false);
      } else if (!fanOpen) {
        dwell = setTimeout(() => openFan(false), DWELL);
      }
      return;
    }
    const fanned = hidden.some((chip) => chip.item.id === key);
    if (fanOpen && !(fanPinned || fanned)) {
      closeFan();
    }
    // A panel already open moves along the row with the pointer. In the fan
    // it waits for the pointer to rest: the panel stands over the fan, and
    // the way up to it crosses the chips above.
    if (openKey !== null && !(pinned || fanned)) {
      open(key, false);
    } else if (openKey === null || (fanned && !pinned)) {
      dwell = setTimeout(() => open(key, false), DWELL);
    }
  }
  function onmorepress(): void {
    close();
    if (fanOpen && fanPinned) {
      closeFan();
    } else {
      openFan(true);
    }
  }
  function onpress(key: string): void {
    // A finished chip whose report is in the transcript takes the reader there.
    const done = chips.find(
      (chip) => chip.item.id === key && chip.tone === "done"
    );
    const report = done ? reportOf(done.item)?.id : undefined;
    if (report) {
      shut();
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
    if (!fine()) {
      return;
    }
    const panel = openKey !== null && !pinned;
    const fanned = fanOpen && !fanPinned;
    if (panel || fanned) {
      closing = setTimeout(() => {
        if (panel) {
          close();
        }
        if (fanned) {
          closeFan();
        }
      }, 300);
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
    // Escape closes the panel, then the fan.
    if (event.key === "Escape" && openKey) {
      event.preventDefault();
      const key = openKey;
      close();
      chipEl(key)?.focus();
      return;
    }
    if (event.key === "Escape" && fanOpen) {
      event.preventDefault();
      closeFan();
      chipEl("more")?.focus();
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
      // The fan runs up from "+N".
      ArrowUp: Math.min(keys.length - 1, at + 1),
      ArrowDown: Math.max(0, at - 1),
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

  async function dismiss(item: WorkItemSummary): Promise<void> {
    try {
      await dismissWorkItem(item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }
</script>

{#snippet mark(
  item: WorkItemSummary,
  flies: boolean
)}
  {@const Sprite = sessionSprite(item.instanceId)}
  <span
    aria-hidden="true"
    class="mark m{markHue(item.instanceId)}"
    {@attach land(() => (flies ? flightKey(item.instanceId) : undefined))}
    ><Sprite /></span
  >
{/snippet}

<!-- A delegate's chip, in the row or in the fan: `at` is its place in the
     keyboard's order. A chip in the fan is moved by the fan, not by the
     row's reflow, and a mark never flies to one folded away. -->
{#snippet chipButton(
  chip: Chip,
  at: number,
  fanned: boolean
)}
  {@const { item, tone, entry } = chip}
  {@const flies = entry === "fly" && !fanned}
  <button
    aria-controls={panelId}
    aria-expanded={openKey === item.id}
    aria-label="{item.title}, {stateWords(chip)}"
    class="chip kit-tray-chip touch-hit {tone}"
    data-flip={fanned ? undefined : "pop"}
    data-flip-enter={fanned || entry === "fade" ? undefined : "own"}
    data-key={item.id}
    onblur={() => {
      focusedKey = null;
    }}
    onclick={() => onpress(item.id)}
    onfocus={() => {
      focusedKey = item.id;
      current = at;
    }}
    onkeydown={fanned ? onkeydown : undefined}
    onmousedown={(event) => event.preventDefault()}
    onpointerenter={() => onchipenter(item.id)}
    tabindex={current === at ? 0 : -1}
    type="button"
    style:min-inline-size={fanned ? undefined : `${floorOf(item.id)}px`}
    class:finished={tone === "done" && (item.endedAt ?? 0) > mountedAt}
    class:fly={flies}
    {@attach fanned ? undefined : measureFloor(item.id)}
  >
    {@render mark(item, flies)}
    <span aria-hidden="true" class="words">
      <span class="title">{item.title}</span>
      {#if tone === "needs"}
        <span class="note">{questionWords(chip.questions)}</span>
      {:else if tone === "failed" || tone === "cancelled"}
        <span class="note">{tone}</span>
      {/if}
    </span>
    <span aria-hidden="true" class="slot">
      {#key slotOf(tone)}
        <span
          class="glyph"
          in:slotIn={tone === "done" || tone === "failed"}
          out:slotOut
        >
          {#if tone === "starting"}
            <Spinner aria-hidden="true" role="presentation" />
          {:else if tone === "running"}
            <span
              class="dot"
              style:animation-delay="-{Date.now() % 2000}ms"
            ></span>
          {:else if tone === "asked" || tone === "needs"}
            <IconAsk />
          {:else if tone === "done"}
            <IconSuccess />
          {:else if tone === "failed"}
            <IconWarningTriangle />
          {:else}
            <IconStop />
          {/if}
        </span>
      {/key}
    </span>
  </button>
{/snippet}

<div class="host" bind:clientWidth={rowWidth}>
  {#if chips.length}
    <div
      class="tray"
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
        aria-label="Delegates"
        class="row"
        inert={held}
        {onkeydown}
        role={keys.length >= 3 ? "toolbar" : "group"}
        bind:this={row}
        {@attach reflow()}
      >
        {#each shown as chip, i (chip.item.id)}
          {@render chipButton(chip, i, false)}
        {/each}
        {#if hidden.length}
          <!-- "+N" and its fan are one box in the row: the fan stands on it,
               so it travels with "+N" through a resize or a chip joining
               or leaving, on the one slide the row gives it. -->
          <div class="morebox" data-flip="pop">
            <button
              aria-controls={fanId}
              aria-expanded={fanOpen}
              aria-label="{hidden.length} more delegates"
              class="chip kit-tray-chip more touch-hit"
              data-key="more"
              onclick={onmorepress}
              onfocus={() => {
                current = shown.length;
              }}
              onmousedown={(event) => event.preventDefault()}
              onpointerenter={() => onchipenter("more")}
              tabindex={current === shown.length ? 0 : -1}
              type="button"
              class:needs={hidden.some((chip) => chip.tone === "needs")}
            >
              +{hidden.length}
            </button>

            <!-- The fan: what "+N" holds, as chips, in a column over it. Always
                 laid out, folded into "+N" until it opens, so opening and
                 closing are one transition a pointer can turn round half-way. -->
            <div
              class="fan"
              id={fanId}
              inert={held || !fanOpen}
              bind:this={fan}
              style:--dx="{fanBox.dx}px"
              style:--fan-w="{fanBox.w}px"
              style:--n={hidden.length}
              style:--room="{fanBox.room}px"
              class:open={fanOpen}
              class:tall={fanBox.tall}
            >
              <ul aria-label="More delegates" class="stack">
                {#each hidden as chip, j (chip.item.id)}
                  <li class="leaf" style:--i={j} out:fanOut>
                    {@render chipButton(chip, shown.length + 1 + j, true)}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>

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
        style="--origin: {place.origin}px; --rise: {place.rise}px; --room: {place.room}px; --span: {place.span}px; --x: {place.x}px"
        watch={openInstance}
      >
        {#snippet children()}
          {#if openChip}
            {@const { item, tone } = openChip}
            <div class="phead">
              {@render mark(item, false)}
              <span class="ptitle">{item.title}</span>
              <span
                aria-label={stateWords(openChip)}
                class="pstate {tone}"
                role="img"
              >
                {#if tone === "starting"}
                  <Spinner aria-hidden="true" role="presentation" />
                {:else if tone === "running"}
                  <span
                    class="dot"
                    style:animation-delay="-{Date.now() % 2000}ms"
                  ></span>
                {:else if tone === "asked" || tone === "needs"}
                  <IconAsk />
                {:else if tone === "done"}
                  <IconSuccess />
                {:else if tone === "failed"}
                  <IconWarningTriangle />
                {:else}
                  <IconStop />
                {/if}
              </span>
              <span class="elapsed"
                >{span(item.createdAt, item.endedAt ?? minute)}</span
              >
              <a
                aria-label="Open {item.title} in its own view"
                class="jump touch-hit"
                href={hrefOf(item)}
                title="Open {item.title} in its own view"
              >
                <IconExternal />
              </a>
            </div>
            <DelegateTail
              instanceId={item.instanceId}
              note={noteOf(openChip)}
            />
            {#if tone === "needs"}
              <div class="acts">
                <Button href={hrefOf(item)} size="sm" variant="outline"
                  >Open question</Button
                >
              </div>
            {:else if tone === "failed"}
              <div class="acts">
                <Button onclick={() => dismiss(item)} size="sm" variant="ghost"
                  >Dismiss</Button
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
  /* Always laid out, so the row's width is known before its first chip. */
  .host {
    pointer-events: none;
  }
  /* The row of chips, standing a step off the composer's top edge: no
     surface of its own, one line, never wrapping or scrolling sideways. Its
     chip and step are the app's tray tokens, the row the composer keeps. */
  .tray {
    /* "+N"'s width: the chip's, and the box the fan folds into. */
    --more: 52px;
    position: relative;
    padding-block-end: var(--c-tray-gap);
  }
  .row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-2);
    overflow: visible;
    --hit-gap-x: var(--space-2);
  }

  /* A chip: the tray row's (app.css .kit-tray-chip), its surface on a layer
     of its own so it can arrive after a mark that flew in. */
  .chip {
    flex: 0 1 auto;
    min-inline-size: 120px;
    max-inline-size: 224px;
  }
  .chip.needs {
    color: var(--status-attn-ink);

    &::before {
      background-color: var(--status-attn-bg);
    }
  }
  .chip.failed {
    color: var(--status-fail-ink);

    &::before {
      background-color: var(--status-fail-bg);
    }
  }

  .words {
    min-inline-size: 0;
    display: flex;
    align-items: baseline;
    gap: var(--c-pill-gap);
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    flex: none;
    font-weight: var(--weight-body);
    white-space: nowrap;
  }
  .cancelled .note {
    color: var(--ink-muted);
  }

  .slot {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    display: grid;
    place-items: center;

    & > .glyph {
      grid-area: 1 / 1;
      display: grid;
      place-items: center;
    }
    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
  }
  .starting .slot,
  .running .slot,
  .asked .slot,
  .cancelled .slot {
    color: var(--ink-muted);
  }
  .done .slot {
    color: var(--status-done-ink);
  }
  .dot {
    inline-size: 5px;
    block-size: 5px;
    border-radius: 50%;
    background: var(--status-live-glyph);
  }

  /* The mark flew in; the chip's surface and words come in after it. */
  @media (prefers-reduced-motion: no-preference) {
    .chip.fly::before,
    .chip.fly .words,
    .chip.fly .slot {
      animation: arrive var(--dur-menu) var(--ease-out) var(--dur-control) both;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip.fly {
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
  .chip.finished::before {
    animation: finish calc(var(--dur-fade) * 2) var(--ease-out);
  }
  @keyframes finish {
    35% {
      background-color: var(--status-done-bg);
    }
  }

  /* "+N"'s box in the row, and what the fan stands on. */
  .morebox {
    position: relative;
    flex: none;
    display: flex;
  }
  .more {
    flex: none;
    min-inline-size: 0;
    inline-size: var(--more);
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }

  /* The delegate card's mark, at its size. */
  .mark {
    flex: none;
    inline-size: 17px;
    block-size: 17px;
    border-radius: var(--radius-xs);
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      display: block;
      color: var(--mark-glyph);
    }
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

  /* The panel's surface, motion and size are the house hover panel's
     (HoverPanel); what is in it is drawn here. */
  .ptitle {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The panel's head: the mark, the title, and at the end the time it has
     taken and its state as a glyph. */
  .phead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  .elapsed {
    flex: none;
    font-size: var(--text-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .pstate {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
  }
  /* The delegate card's way out to its own view, as the card draws it. */
  .jump {
    flex: 0 0 auto;
    inline-size: 26px;
    block-size: 26px;
    margin-block: -5px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    transition:
      color var(--dur-control) var(--ease-out),
      background var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      display: block;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .jump:hover {
      color: var(--brand-ink);
      background: var(--surface-hover);
    }
  }
  .pstate.needs {
    color: var(--status-attn-ink);
  }
  .pstate.done {
    color: var(--status-done-ink);
  }
  .pstate.failed {
    color: var(--status-fail-ink);
  }
  .acts {
    margin-block-start: var(--space-3);
    display: flex;
    gap: var(--space-2);
  }

  /* The fan. It stands on "+N"'s box (pulled back inside the row's end by
     its widest chip: --dx) and is as tall as its chips,
     each a step (a chip and the row's gap) over the last. A leaf is placed
     by translate alone, from the stack's foot: folded, on "+N"'s own box
     and clipped to its width, so the stack reads as "+N" itself; open, in
     its slot. Open, close, a turn half-way and a chip joining or leaving
     are therefore one transition each, picked up from wherever it is. */
  .fan {
    --step: calc(var(--c-tray-chip) + var(--space-2));
    position: absolute;
    z-index: 1;
    inset-block-end: 100%;
    inset-inline-start: 0;
    inline-size: var(--fan-w);
    block-size: min(calc(var(--n) * var(--step)), var(--room));
    translate: calc(var(--dx) * -1) 0;
    pointer-events: none;
  }
  /* Taller than the room over the tray: it scrolls there, from "+N" up. */
  .fan.tall.open {
    overflow-y: auto;
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  .stack {
    position: relative;
    block-size: calc(var(--n) * var(--step));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .leaf {
    /* How far it waits its turn: the nearest chip leaves "+N" first and is
       the last back in. Five deep, like every cascade here. */
    --out: min(var(--i), 4);
    --back: min(calc(var(--n) - 1 - var(--i)), 4);
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 0;
    display: flex;
    inline-size: max-content;
    opacity: 0;
    visibility: hidden;
    translate: var(--dx) var(--c-tray-chip);
    clip-path: inset(0 calc(100% - var(--more)) 0 0 round var(--radius-sm));
    transition:
      opacity var(--dur-exit) var(--ease-out)
      calc(var(--back) * var(--dur-stagger)),
      visibility 0s linear
      calc(var(--dur-exit) + var(--back) * var(--dur-stagger));

    & > .chip {
      flex: 0 1 auto;
    }
  }
  .fan.open .leaf {
    opacity: 1;
    visibility: visible;
    translate: 0 calc((var(--i) * var(--step) + var(--space-2)) * -1);
    /* Past its own edge, so the chip's shadow is drawn whole. */
    clip-path: inset(calc(var(--space-2) * -1) round var(--radius-sm));
    transition:
      opacity var(--dur-morph) var(--ease-out)
      calc(var(--out) * var(--dur-stagger)),
      visibility 0s;

    /* A chip that joins the open fan comes out of "+N" like the rest. */
    @starting-style {
      opacity: 0;
      translate: var(--dx) var(--c-tray-chip);
      clip-path: inset(0 calc(100% - var(--more)) 0 0 round var(--radius-sm));
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .leaf {
      transition:
        opacity var(--dur-exit) var(--ease-out)
        calc(var(--back) * var(--dur-stagger)),
        translate var(--dur-exit) var(--ease-out)
        calc(var(--back) * var(--dur-stagger)),
        clip-path var(--dur-exit) var(--ease-out)
        calc(var(--back) * var(--dur-stagger)),
        visibility 0s linear
        calc(var(--dur-exit) + var(--back) * var(--dur-stagger));
    }
    .fan.open .leaf {
      transition:
        opacity var(--dur-morph) var(--ease-out)
        calc(var(--out) * var(--dur-stagger)),
        translate var(--dur-morph) var(--ease-out)
        calc(var(--out) * var(--dur-stagger)),
        clip-path var(--dur-morph) var(--ease-out)
        calc(var(--out) * var(--dur-stagger)),
        visibility 0s;
    }
  }
  /* Less motion: the chips are in their places and only fade. */
  @media (prefers-reduced-motion: reduce) {
    .leaf,
    .fan.open .leaf {
      translate: 0 calc((var(--i) * var(--step) + var(--space-2)) * -1);
      clip-path: none;
    }
  }
</style>
