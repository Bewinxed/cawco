<script lang="ts">
  import { questionsOf } from "@cawco/core";
  /**
   * Caw's head in the top bar: the way into what needs the operator (the
   * home's Needs you: every parked ask, a workflow run's question, a project
   * past its cap; home-state `needs`, the rows Home's Needs you section shows).
   *
   * He is his compacted head (assets/mascot/README.md, `compacted`: a head
   * that fills its box, built for 18 px), the last item of the bar's icon
   * group, on the group's glass (Shell): borderless, as every item in it is.
   * His head's circle, not his drawing's box, stands at the item's centre
   * (CAW_HEAD_CENTRE), since his beak and note reach out to one side. The
   * count rides his corner in the bar's badge, morphing digit by digit,
   * while anything waits. When something new arrives he plays his needs-you
   * beat once (the wave of `needs-you-hey` through a box round his head,
   * drawn ahead by `bun run tab-icon`; his guide: "a gentle beat… never a
   * hello") and holds still again. With less motion only the badge changes.
   *
   * He smiles back at the operator's own pointer (owner: "show the smiling
   * ^^ caw's face/animation on hover and on click"): a pointer coming onto
   * him plays his strip from rest into his ^^ face, which holds while it
   * stays, and leaving plays it back to rest; a press, by mouse or finger,
   * squashes his head once on --press-scale and smiles, then the drawer
   * opens as it always has. The beat, when one plays, goes first. With less
   * motion no drawing steps: his face cross-fades to the ^^ one and back.
   *
   * A tap on him, or a drag down from him, pulls a drawer down from the top.
   * Dragged, its body grows out of the capsule under the finger 1:1, joined
   * to it by a neck that thins as the two part and snaps once they are a gap
   * apart (a metaball's join); let go, it opens or closes on where the
   * finger was heading (its position projected along its speed) and settles
   * on the spring every hand-driven surface uses (motion/spring), which a
   * finger can take hold of again mid-flight. Inside, the rows, longest
   * wait first; choosing one closes the drawer and opens it: a session with
   * its composer grown into the ask, a run, or a project's spend. It closes
   * by a drag up, a tap outside, Escape, or a row.
   */
  import { mergeProps } from "bits-ui";
  import { untrack } from "svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import beatDark from "#lib/assets/brand/bar-beat-needs-you-dark.png";
  import beatLight from "#lib/assets/brand/bar-beat-needs-you-light.png";
  import smileDark from "#lib/assets/brand/bar-beat-smile-dark.png";
  import smileLight from "#lib/assets/brand/bar-beat-smile-light.png";
  import { IconDollar, IconWorkflow } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { goto } from "$app/navigation";
  import { cawco } from "./client.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { CAW_HEAD_CENTRE } from "./home/caw-still.svelte";
  import { clock, home, type NeedsItem, span } from "./home/home-state.svelte";
  import { conversationHref } from "./links";
  import {
    dur,
    easeInOut,
    easeOut,
    motionOk,
  } from "./motion/curves.svelte";
  import { integrate, type Sample, sampleAt } from "./motion/spring";
  import SessionMark from "./SessionMark.svelte";
  import { capLine } from "./usage";

  /** His head's side, px: the compacted still fills it (`--c-bar-symbol`). */
  const HEAD = 20;
  /**
   * The beat's box, px: his head and raised wing (tab-icon-shots
   * `NEEDS_YOU`), 32 to a 22px head, so his head beats at the size it rests.
   */
  const BEAT_BOX = 29;
  /** The beat's drawings, and its pace: his loops are held on twos of 24. */
  const BEAT_FRAMES = 16;
  const BEAT_PACE = 12;
  /**
   * The smile's strip (tab-icon-shots `SMILE`): all of him, from rest
   * through eyes shut to ^^, at the beat's pace. Its box is his still box,
   * sized so his head is the size the face shows it: the head's circle is
   * 0.304 of the compacted box and 0.244 of the still box (circles fitted
   * to his crown, as CAW_HEAD_CENTRE), so his body hangs below his head
   * within the glass, as it does on any page that shows him whole.
   */
  const SMILE_FRAMES = 5;
  const SMILE_BOX = Math.round((HEAD * 0.304) / 0.244);
  /** His head's centre in the smile's rest drawing, as shares of its box. */
  const SMILE_HEAD_CENTRE = { x: 0.481, y: 0.364 } as const;
  /** Where the drawer stands under the capsule once parted, px. */
  const GAP = 8;
  /** The finger's travel by which the neck has thinned to nothing and snapped, px. */
  const SNAP = 56;
  /** The travel over which the body widens from the capsule's width to its own, px. */
  const WIDEN = 160;
  /** Travel before a press is a drag, px. */
  const SLOP = 8;
  /** Release speed is read over this last stretch, ms. */
  const VELOCITY_WINDOW = 80;
  /**
   * How far a release is carried along its speed when deciding where it was
   * going, ms: the projection a deceleration of 0.99 a millisecond reaches
   * (0.99 / (1 − 0.99) = 99).
   */
  const PROJECT_MS = 99;
  /** Past fully open, a third of the finger's travel shows, and no more than a fifth. */
  const RESIST = 0.35;
  const RESIST_MAX = 0.2;

  const needs = $derived(home.needs);
  const count = $derived(needs.length);
  /**
   * What he says with nothing to count: "All caught up" only once the fleet
   * is read over a live hub (PRODUCT.md: an empty answer is only given when
   * it is known); before that, what he is waiting on, in StatusLine's words.
   */
  const quiet = $derived.by(() => {
    switch (home.status) {
      case "connected":
        return "All caught up";
      case "reading":
        return "Reading the fleet";
      case "connecting":
        return "Connecting…";
      default:
        return "Hub unreachable";
    }
  });
  const label = $derived(count > 0 ? `Needs you, ${count}` : quiet);

  /* ── The count ─────────────────────────────────────────────────────── */
  /**
   * His count is drawn on his circle's rim, never written on him (owner:
   * "lines along the rim of the circle that increase with the count, to a
   * limit"): an arc for each thing waiting, from 12 o'clock clockwise,
   * ARC° long with GAP° between, in the attention ink. Past ARCS the count
   * refills the same arcs on top in a second ink, the fail glyph (owner:
   * "for more than 9 dashes we can refill again with another color"), so
   * the tenth redraws the first; past two laps the ring closes whole in the
   * second ink, which says "a lot". Nothing of it leaves his circle, so nothing of it
   * leaves the screen. The number itself is in his label, his tooltip and
   * the drawer's head. His circle is the bar's control height across,
   * round his item's centre: the narrow bar's glass circle, and the wide
   * group's trailing end. Apple's NeedsCawButton draws the same arcs.
   */
  const ARC = 30;
  const ARC_GAP = 8;
  const ARCS = 9;
  /** The ring's box: his circle, in px (`--c-btn-h`). */
  const RING_BOX = 36;
  /**
   * Clear glass between the arcs and his circle's edge, px (`--space-1`),
   * so the ring reads as his count and never as the capsule's border.
   */
  const RIM_INSET = 4;
  /** The arcs' stroke, px (`--c-caw-ring`). */
  const RIM_STROKE = 2;
  /** The rim's radius: the inset in from his circle's edge, half the stroke in. */
  const RIM = RING_BOX / 2 - RIM_INSET - RIM_STROKE / 2;
  /** The first lap's arcs, the second lap's on top of them, and past both the closed ring. */
  const ringClosed = $derived(count > 2 * ARCS);
  const arcCount = $derived(ringClosed ? 0 : Math.min(count, ARCS));
  const lapCount = $derived(
    ringClosed ? 0 : Math.min(Math.max(count - ARCS, 0), ARCS)
  );
  const tipText = $derived(count > 0 ? `${count} need you` : quiet);

  /** A point on the rim, `deg` clockwise from 12 o'clock. */
  const onRim = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const c = RING_BOX / 2;
    return `${(c + RIM * Math.sin(rad)).toFixed(3)} ${(c - RIM * Math.cos(rad)).toFixed(3)}`;
  };
  /**
   * A round cap reaches half the stroke past its path's end: this many
   * degrees of the rim, taken off each end so the arc as seen, caps and
   * all, is ARC° long and the gaps are ARC_GAP°.
   */
  const CAP = ((RIM_STROKE / 2 / RIM) * 180) / Math.PI;
  /** Arc `k`, seen from k × (ARC + GAP)° clockwise for ARC°. */
  const arcPath = (k: number) => {
    const from = k * (ARC + ARC_GAP) + CAP;
    return `M ${onRim(from)} A ${RIM} ${RIM} 0 0 1 ${onRim(from + ARC - 2 * CAP)}`;
  };

  /**
   * An arc drawing itself in along its own length, and retracting the same
   * way; with less motion, a fade. Each arc's path length is 1.
   */
  const drawn = (_node: Element) => ({
    duration: dur("--dur-panel"),
    easing: easeOut,
    css: (t: number) =>
      motionOk.current ? `stroke-dashoffset: ${1 - t}` : `opacity: ${t}`,
  });

  /* ── The beat ──────────────────────────────────────────────────────── */
  /** What he has already seen, by key; null until the fleet is first read. */
  let seen: Set<string> | null = null;
  let beating = $state(false);
  let beatEl = $state<HTMLElement | null>(null);
  const beatStrip = $derived(theme.resolved === "dark" ? beatDark : beatLight);

  $effect(() => {
    const keys = needs.map((item) => item.key);
    if (!home.ready) {
      return;
    }
    untrack(() => {
      const before = seen;
      seen = new Set(keys);
      if (before && keys.some((key) => !before.has(key)) && motionOk.current) {
        beat();
      }
    });
  });

  function beat() {
    if (beating || !beatEl) {
      return;
    }
    // The beat goes first: a smile under way gives way to it at once.
    stopSmile();
    beating = true;
    const run = beatEl.animate(
      [
        { backgroundPositionX: "0px" },
        { backgroundPositionX: `${-BEAT_BOX * BEAT_FRAMES}px` },
      ],
      {
        duration: (BEAT_FRAMES / BEAT_PACE) * 1000,
        easing: `steps(${BEAT_FRAMES}, end)`,
      }
    );
    const done = () => {
      beating = false;
      // Still under the pointer when it ends: he smiles at it after all.
      if (hovered) {
        smileIn();
      }
    };
    run.finished.then(done, done);
  }

  /* ── The smile ─────────────────────────────────────────────────────── */
  let smileEl = $state<HTMLElement | null>(null);
  /** The strip stands in for his face. */
  let smiling = $state(false);
  /** His face and the strip swap as drawings do, at once, rather than fade. */
  let cut = $state(false);
  /** A pressed head, squashed while the press lasts. */
  let pressed = $state(false);
  /** A fine pointer is on him. */
  let hovered = false;
  /** A press is down on him. */
  let pressing = false;
  /** The strip's one run, played forward into the smile and back out of it. */
  let smileRun: Animation | undefined;
  const smileStrip = $derived(
    theme.resolved === "dark" ? smileDark : smileLight
  );
  /** The ^^ drawing, the strip's last: what Reduce Motion fades to. */
  const SMILE_LAST = -SMILE_BOX * (SMILE_FRAMES - 1);

  /** The run, made the first time he smiles; one drawing a beat. */
  function stripRun(el: HTMLElement): Animation {
    const made = el.animate(
      [
        { backgroundPositionX: "0px" },
        { backgroundPositionX: `${SMILE_LAST}px` },
      ],
      {
        duration: ((SMILE_FRAMES - 1) / BEAT_PACE) * 1000,
        easing: `steps(${SMILE_FRAMES - 1}, end)`,
        fill: "both",
      }
    );
    made.pause();
    made.currentTime = 0;
    made.onfinish = () => {
      if (made.playbackRate < 0) {
        // Back at rest: his face again.
        smiling = false;
      } else if (!(hovered || pressing)) {
        // A tap's smile: in, and out again once it has landed.
        smileOut();
      }
    };
    return made;
  }

  function smileIn() {
    if (beating || !smileEl) {
      return;
    }
    if (!motionOk.current) {
      cut = false;
      smiling = true;
      return;
    }
    cut = true;
    smiling = true;
    smileRun ??= stripRun(smileEl);
    const end = ((SMILE_FRAMES - 1) / BEAT_PACE) * 1000;
    if (smileRun.playbackRate > 0 && Number(smileRun.currentTime) >= end) {
      return;
    }
    smileRun.updatePlaybackRate(1);
    smileRun.play();
  }

  function smileOut() {
    if (!smiling) {
      return;
    }
    if (!(motionOk.current && smileRun)) {
      smiling = false;
      return;
    }
    smileRun.updatePlaybackRate(-1);
    smileRun.play();
  }

  /** Gone at once, wherever it was: the beat takes his place. */
  function stopSmile() {
    smileRun?.cancel();
    smileRun = undefined;
    smiling = false;
    cut = false;
  }

  function pointerOn(event: PointerEvent) {
    if (event.pointerType !== "mouse") {
      return;
    }
    hovered = true;
    smileIn();
  }

  function pointerOff(event: PointerEvent) {
    if (event.pointerType !== "mouse") {
      return;
    }
    hovered = false;
    if (!pressing) {
      smileOut();
    }
  }

  /** A press: one squash, and the smile; the drawer is `grab`'s. */
  function press(event: PointerEvent) {
    if (!event.isPrimary || event.button > 0) {
      return;
    }
    pressing = true;
    pressed = true;
    smileIn();
    const lift = () => {
      pressing = false;
      pressed = false;
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      // A finger has no hover to hold the smile: it ends once it has landed,
      // or now where nothing plays.
      if (!hovered && smileRun?.playState !== "running") {
        smileOut();
      }
    };
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
  }

  /* ── The drawer ────────────────────────────────────────────────────── */
  let capsule = $state<HTMLButtonElement | null>(null);
  let body = $state<HTMLElement | null>(null);
  let inner = $state<HTMLElement | null>(null);
  let neck = $state<SVGPathElement | null>(null);
  let scrim = $state<HTMLElement | null>(null);
  /** The drawer is open, or opening: what the capsule says and the focus follows. */
  let open = $state(false);
  /** How far down it is drawn: 0 folded into the capsule, 1 open. */
  let progress = 0;
  /** Any of it is on screen. */
  let shown = $state(false);

  interface Geometry {
    /** The capsule's box. */
    capBottom: number;
    capLeft: number;
    capRight: number;
    /** The open drawer's box. */
    height: number;
    left: number;
    width: number;
  }
  let geo: Geometry | null = null;

  /** Where the open drawer stands, read off the capsule and the content as they are now. */
  function measure(): Geometry | null {
    if (!(capsule && inner)) {
      return null;
    }
    // Across under him, and down to the foot of the glass he stands on (the
    // bar's group, `data-bar-group`), so the drawer grows out of what is seen.
    const own = capsule.getBoundingClientRect();
    const glass = capsule.closest("[data-bar-group]")?.getBoundingClientRect();
    const cap = {
      left: own.left,
      right: own.right,
      bottom: glass?.bottom ?? own.bottom,
    };
    const phone = window.innerWidth < 900;
    const width = phone ? window.innerWidth - 16 : 380;
    const left = phone ? 8 : Math.max(8, cap.right - width);
    inner.style.width = `${width}px`;
    // Its travel: the gap it parts by, then the content, as far as the screen allows.
    const room = window.innerHeight - cap.bottom - 16;
    const height = Math.min(inner.scrollHeight + GAP, room, 560 + GAP);
    return {
      capLeft: cap.left,
      capRight: cap.right,
      capBottom: cap.bottom,
      left,
      width,
      height,
    };
  }

  const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
  /** Where the neck snaps: SNAP, or sooner in a drawer too short for it. */
  const snapAt = (g: Geometry) => Math.min(SNAP, g.height * 0.4);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  /** Draws the drawer at `at` of its travel: body, neck, content and scrim. */
  function paint(at: number) {
    progress = at;
    const g = geo;
    if (!(g && body && inner)) {
      return;
    }
    const q = Math.max(0, at);
    const over = Math.max(0, q - 1);
    // The finger's travel: 1:1 to fully open, then the rubber band.
    const travel =
      Math.min(q, 1) * g.height +
      Math.min(over * g.height * RESIST, g.height * RESIST_MAX);
    // Its edges leave the capsule's for its own: it grows out from under him,
    // done by the time it is open however short it is.
    const widen = easeInOut(clamp01(travel / Math.min(WIDEN, g.height * 0.8)));
    const left = lerp(g.capLeft, g.left, widen);
    const right = lerp(g.capRight, g.left + g.width, widen);
    const gap = GAP * clamp01(travel / snapAt(g));
    const top = g.capBottom + gap;
    const h = Math.max(0, travel - gap);
    const w = right - left;
    const r = Math.min(12, h / 2, w / 2);
    body.style.left = `${left}px`;
    body.style.top = `${top}px`;
    body.style.width = `${w}px`;
    body.style.height = `${h}px`;
    body.style.borderRadius = `${r}px`;
    inner.style.transform = `translateX(${g.left - left}px)`;
    inner.style.opacity = String(clamp01((q - 0.3) / 0.4));
    if (scrim) {
      scrim.style.opacity = String(clamp01(q));
    }
    if (neck) {
      neck.setAttribute("d", neckPath(g, travel, { left, right, top, h, r }));
    }
    shown = q > 0.001;
  }

  /**
   * The join between the capsule and the body until they are a gap apart:
   * from a chord across the capsule's foot down to one across the body's
   * head under him, pinched at its middle to a waist that thins to nothing
   * as the finger travels, when it snaps and is drawn no more.
   */
  function neckPath(
    g: Geometry,
    travel: number,
    bodyBox: { left: number; right: number; top: number; h: number; r: number }
  ): string {
    const t = travel / snapAt(g);
    if (travel <= 0.5 || t >= 1 || bodyBox.h <= 0) {
      return "";
    }
    const capW = g.capRight - g.capLeft;
    const capX = g.capLeft + capW / 2;
    const a = capW * 0.36;
    const b = Math.min((bodyBox.right - bodyBox.left) / 2, a * 1.4);
    // Under him, kept off the body's rounded corners.
    const x = Math.min(
      Math.max(capX, bodyBox.left + bodyBox.r + b),
      bodyBox.right - bodyBox.r - b
    );
    const waist = a * (1 - t) ** 1.6;
    const y1 = g.capBottom - capW * 0.12;
    const y2 = bodyBox.top + Math.min(bodyBox.h, 10);
    const ym = (y1 + y2) / 2;
    const xm = (capX + x) / 2;
    const d1 = (ym - y1) / 2;
    const d2 = (y2 - ym) / 2;
    return [
      `M ${capX - a} ${y1}`,
      `C ${capX - a} ${y1 + d1} ${xm - waist} ${ym - d1} ${xm - waist} ${ym}`,
      `C ${xm - waist} ${ym + d2} ${x - b} ${y2 - d2} ${x - b} ${y2}`,
      `L ${x + b} ${y2}`,
      `C ${x + b} ${y2 - d2} ${xm + waist} ${ym + d2} ${xm + waist} ${ym}`,
      `C ${xm + waist} ${ym - d1} ${capX + a} ${y1 + d1} ${capX + a} ${y1}`,
      "Z",
    ].join(" ");
  }

  /* The settle: the spring integrated once at release, sampled each frame,
     so a finger that takes hold mid-flight takes it from where it is. */
  let settleFrame = 0;
  let settling: { path: Sample[]; start: number; target: 0 | 1 } | null = null;

  function stopSettle() {
    cancelAnimationFrame(settleFrame);
    settling = null;
  }

  function settle(target: 0 | 1, velocity = 0) {
    stopSettle();
    const g = geo;
    if (!g) {
      return;
    }
    if (!motionOk.current) {
      paint(target);
      finished(target);
      return;
    }
    const path = integrate((progress - target) * g.height, velocity * 1000);
    settling = { path, start: performance.now(), target };
    const step = (now: number) => {
      if (!settling) {
        return;
      }
      // biome-ignore lint/style/useAtIndex: integrate() always returns at least two points
      const end = settling.path[settling.path.length - 1].t;
      const seconds = (now - settling.start) / 1000;
      const sample = sampleAt(settling.path, seconds);
      paint(settling.target + sample.x / g.height);
      if (seconds >= end) {
        const done = settling.target;
        settling = null;
        finished(done);
        return;
      }
      settleFrame = requestAnimationFrame(step);
    };
    settleFrame = requestAnimationFrame(step);
  }

  /** The drawer came to rest. */
  function finished(at: 0 | 1) {
    if (at === 0) {
      shown = false;
      return;
    }
    if (!body?.contains(document.activeElement)) {
      body
        ?.querySelector<HTMLElement>(".row, .empty")
        ?.focus({ preventScroll: true });
    }
  }

  function openDrawer(velocity = 0) {
    // From rest it is measured as it is now; mid-flight it keeps its box.
    if (!geo || progress <= 0.001) {
      geo = measure();
    }
    open = true;
    settle(1, velocity);
  }

  function closeDrawer(velocity = 0) {
    open = false;
    const hadFocus = body?.contains(document.activeElement);
    settle(0, velocity);
    if (hadFocus) {
      capsule?.focus({ preventScroll: true });
    }
  }

  /** A row: the drawer closes and what it asks for opens. */
  function choose(item: NeedsItem) {
    closeDrawer();
    // biome-ignore lint/complexity/noVoid: the session surface takes it from the route
    void goto(hrefOf(item));
  }

  function hrefOf(item: NeedsItem): string {
    if (item.kind !== "ask") {
      return item.href;
    }
    return item.thread
      ? `/session/${item.thread}`
      : conversationHref(item.instanceId, cawco.instanceIndex);
  }

  /** What a row asks for, in the words it is asked: its second line. */
  function wantOf(item: NeedsItem): string {
    switch (item.kind) {
      case "ask":
        return item.isQuestion
          ? (questionsOf(item.request.toolName, item.request.input)?.[0]
              ?.question ?? item.ask)
          : item.ask;
      case "run":
        return "Waiting on your answer";
      default:
        return capLine(item.cap);
    }
  }

  /** A row's last line: the kind, then where it is (machine · project). */
  function metaOf(item: NeedsItem): string {
    switch (item.kind) {
      case "ask":
        return `${item.isQuestion ? "Question" : "Permission"} · ${item.place}${item.stale ? " · machine offline" : ""}`;
      case "run":
        return `Workflow · ${item.place}`;
      default:
        return "Budget";
    }
  }

  /* ── The hand ──────────────────────────────────────────────────────── */
  /**
   * A press on the capsule, or on the open drawer's head and handle: a tap
   * toggles, a drag moves the drawer under the finger. From the capsule the
   * drag is downward (or back up, once it has it); from the drawer, upward.
   */
  interface Hold {
    base: number;
    dragging: boolean;
    fromDrawer: boolean;
    samples: Array<{ at: number; t: number }>;
    startX: number;
    startY: number;
  }

  /**
   * The first real travel decides whether a press is a drag: mostly down or
   * up, and toward where the drawer can go (down from the capsule while it
   * is shut, up from the open drawer).
   */
  function takesHold(hold: Hold, e: PointerEvent): boolean {
    const dy = e.clientY - hold.startY;
    const dx = Math.abs(e.clientX - hold.startX);
    if (Math.abs(dy) < SLOP || dx > Math.abs(dy)) {
      return false;
    }
    if (hold.fromDrawer) {
      return dy < 0;
    }
    return open || dy > 0;
  }

  /** Release speed along the drawer's travel, px/ms, over the last stretch. */
  function speedOf(samples: Hold["samples"]): number {
    const last = samples.at(-1);
    const first = samples.find(
      (sample) => last && last.t - sample.t <= VELOCITY_WINDOW
    );
    if (!(first && last) || last.t <= first.t) {
      return 0;
    }
    return (last.at - first.at) / (last.t - first.t);
  }

  function follow(hold: Hold, e: PointerEvent) {
    const g = geo;
    if (!g) {
      return;
    }
    const at = hold.base + (e.clientY - hold.startY) / g.height;
    paint(at);
    hold.samples.push({ at: at * g.height, t: e.timeStamp });
    while (
      hold.samples.length > 2 &&
      e.timeStamp - hold.samples[0].t > VELOCITY_WINDOW
    ) {
      hold.samples.shift();
    }
  }

  /** Let go: it goes where its position, carried along its speed, points. */
  function letGo(hold: Hold) {
    const g = geo as Geometry;
    const v = speedOf(hold.samples);
    if (progress + (v * PROJECT_MS) / g.height > 0.5) {
      openDrawer(v / g.height);
    } else {
      closeDrawer(v / g.height);
    }
  }

  function grab(fromDrawer: boolean) {
    return (event: PointerEvent) => {
      if (!event.isPrimary || event.button > 0) {
        return;
      }
      const node = event.currentTarget as HTMLElement;
      const hold: Hold = {
        base: progress,
        dragging: false,
        fromDrawer,
        samples: [],
        startX: event.clientX,
        startY: event.clientY,
      };
      const move = (e: PointerEvent) => {
        if (!hold.dragging) {
          if (!takesHold(hold, e)) {
            return;
          }
          hold.dragging = true;
          node.setPointerCapture(e.pointerId);
          stopSettle();
          if (!fromDrawer && progress <= 0.001) {
            geo = measure();
          }
          hold.base = progress;
        }
        follow(hold, e);
      };
      const end = (e: PointerEvent) => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", end);
        node.removeEventListener("pointercancel", end);
        if (hold.dragging) {
          letGo(hold);
        } else if (e.type === "pointerup" && !fromDrawer) {
          toggle();
        }
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
    };
  }

  const grabCapsule = grab(false);

  function toggle() {
    if (open) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  /** A key's press: a pointer's is the `pointerup` above, its click left alone. */
  function onCapsuleClick(event: MouseEvent) {
    if (event.detail === 0) {
      toggle();
    }
  }

  /** The drawer follows the window and the content while it stands open. */
  $effect(() => {
    if (!shown) {
      return;
    }
    const again = () => {
      if (settling || !open) {
        return;
      }
      geo = measure();
      paint(progress);
    };
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  });
  $effect(() => {
    // The rows changed under an open drawer: its height follows them.
    const rows = needs.length;
    untrack(() => {
      if (rows >= 0 && open && !settling) {
        requestAnimationFrame(() => {
          geo = measure();
          paint(1);
        });
      }
    });
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeDrawer();
    }
  }}
/>

<div class="needs-caw" class:shown>
  <!-- Under the drawer: a tap outside closes it. -->
  <div
    aria-hidden="true"
    class="scrim"
    onclick={() => closeDrawer()}
    bind:this={scrim}
  ></div>
  <svg aria-hidden="true" class="neck"><path d="" bind:this={neck}></path></svg>
  <div
    aria-label="Needs you"
    aria-modal="false"
    class="drawer"
    id="needs-drawer"
    inert={!open}
    role="dialog"
    bind:this={body}
  >
    <div class="inner" bind:this={inner}>
      {#if needs.length > 0}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="head" onpointerdown={grab(true)}>
          <span class="title">Needs you</span>
          <span class="count">{needs.length}</span>
        </div>
        <!-- More rows than the drawer holds: the house edge fade at the foot
             while more is below, and at the head once scrolled. -->
        <ul class="rows kit-edge-fade-block">
          {#each needs as item (item.key)}
            <li>
              <button
                class="row press-tint focus-inset"
                data-stale={(item.kind === "ask" && item.stale) || undefined}
                onclick={() => choose(item)}
                type="button"
              >
                <!-- The session's own mark, as the rail draws it; a run and
                     a budget their glyphs. -->
                <span class="lead">
                  {#if item.kind === "ask"}
                    <SessionMark
                      id={item.instanceId}
                      place={item.cwd || item.machineId}
                      status="attn"
                    />
                  {:else if item.kind === "run"}
                    <IconWorkflow aria-hidden="true" />
                  {:else}
                    <IconDollar aria-hidden="true" />
                  {/if}
                </span>
                <span class="name">{item.title}</span>
                {#if item.raisedAt !== undefined}
                  <span class="wait">{span(clock.now - item.raisedAt)}</span>
                {/if}
                <span class="want">{wantOf(item)}</span>
                <span class="meta">{metaOf(item)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div
          class="empty"
          onpointerdown={grab(true)}
          role="status"
          tabindex="-1"
        >
          {#if home.status === "connected"}
            <CawFace size={48} status="ready" />
          {/if}
          <span>{quiet}</span>
        </div>
      {/if}
      <div aria-hidden="true" class="handle" onpointerdown={grab(true)}>
        <span></span>
      </div>
    </div>
  </div>

  <Tip label={tipText}>
    {#snippet children(tip)}
  <button
    {...mergeProps(tip, {
      onclick: onCapsuleClick,
      onpointerdown: (event: PointerEvent) => {
        press(event);
        grabCapsule(event);
      },
      onpointerenter: pointerOn,
      onpointerleave: pointerOff,
    })}
    aria-controls="needs-drawer"
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={label}
    class="capsule bar-item touch-hit"
    data-needs-caw
    type="button"
    bind:this={capsule}
  >
    <span class="mug" class:cut={cut} class:pressed={pressed}>
      <span
        class="face"
        style:--dx={0.5 - CAW_HEAD_CENTRE.x}
        style:--dy={0.5 - CAW_HEAD_CENTRE.y}
        style:--side="{HEAD}px"
        class:away={beating}
        class:smiled={smiling}
      >
        <CawFace size={HEAD} status="compacted" />
      </span>
      <span
        aria-hidden="true"
        class="beat"
        bind:this={beatEl}
        style:--box="{BEAT_BOX}px"
        style:--frames={BEAT_FRAMES}
        style:background-image="url({beatStrip})"
        class:on={beating}
      ></span>
      <span
        aria-hidden="true"
        class="smile"
        bind:this={smileEl}
        style:--box="{SMILE_BOX}px"
        style:--dx={0.5 - SMILE_HEAD_CENTRE.x}
        style:--dy={0.5 - SMILE_HEAD_CENTRE.y}
        style:--frames={SMILE_FRAMES}
        style:background-image="url({smileStrip})"
        style:background-position-x="{SMILE_LAST}px"
        class:on={smiling}
      ></span>
    </span>
    <!-- What waits, on his rim: an arc each, a second lap on top in its
         own ink past ARCS, closed whole past two laps. -->
    <svg
      aria-hidden="true"
      class="rim"
      data-count={count}
      viewBox="0 0 {RING_BOX} {RING_BOX}"
    >
      {#each { length: arcCount }, k (k)}
        <path class="arc" d={arcPath(k)} pathLength="1" transition:drawn />
      {/each}
      {#each { length: lapCount }, k (k)}
        <path
          class="arc lap"
          d={arcPath(k)}
          pathLength="1"
          transition:drawn
        />
      {/each}
      {#if ringClosed}
        <circle
          class="arc lap whole"
          cx={RING_BOX / 2}
          cy={RING_BOX / 2}
          pathLength="1"
          r={RIM}
          transform="rotate(-90 {RING_BOX / 2} {RING_BOX / 2})"
          transition:drawn
        />
      {/if}
    </svg>
  </button>
    {/snippet}
  </Tip>
</div>

<style>
  /* Its own stacking context over the page: the scrim, the neck and the
     drawer under the capsule, so the neck joins the capsule from beneath. */
  .needs-caw {
    position: relative;
    z-index: 60;
    display: grid;
    flex: none;
  }
  /* An item of the bar's group (Shell's `.bar-item` recipe draws its box,
     hover and focus); a drag down from him is the drawer's, never a scroll. */
  .capsule {
    z-index: 3;
    display: grid;
    place-items: center;
    /* A circle whatever the strips' boxes: the beat's reaches past it. */
    inline-size: var(--c-bar-item);
    padding: 0;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }
  /* What waits, on his circle's rim: his circle's box round his item's
     centre, the arcs a 2px round-capped attention stroke, each with a path
     length of 1 so it draws in and out along itself. (Not `.ring`: that is
     Tailwind's ring utility, a box-shadow round the box.) */
  .rim {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: var(--c-btn-h);
    block-size: var(--c-btn-h);
    overflow: visible;
    translate: -50% -50%;
    pointer-events: none;
  }
  .arc {
    fill: none;
    stroke: var(--status-attn-glyph);
    stroke-width: var(--c-caw-ring);
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
  /* The second lap, and the closed ring past it: the fail glyph's ink. */
  .arc.lap {
    stroke: var(--status-fail-glyph);
  }
  /* His head: the face, the beat and the smile in one cell, squashed once
     under a press (DESIGN.md, The Press Rule) with motion allowed. */
  .mug {
    display: grid;
    place-items: center;
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-toggle) var(--ease-out);
    }
  }
  .mug.pressed {
    @media (prefers-reduced-motion: no-preference) {
      transform: scale(var(--press-scale));
    }
  }
  .face,
  .beat,
  .smile {
    grid-area: 1 / 1;
  }
  /* His head's circle at the centre, not his box (CAW_HEAD_CENTRE): moved
     in layout, not by a transform, so his picture stays on whole pixels. */
  .face {
    position: relative;
    inset-inline-start: calc(var(--dx) * var(--side));
    inset-block-start: calc(var(--dy) * var(--side));
    display: grid;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .face.away,
  .face.smiled {
    opacity: 0;
  }
  /* The beat's and the smile's strips, one drawing showing. */
  .beat,
  .smile {
    inline-size: var(--box);
    block-size: var(--box);
    background-repeat: no-repeat;
    background-size: calc(var(--box) * var(--frames)) var(--box);
    opacity: 0;
  }
  .beat.on,
  .smile.on {
    opacity: 1;
  }
  /* The smile stands where his face does: its rest drawing's head on it. */
  .smile {
    position: relative;
    inset-inline-start: calc(var(--dx) * var(--box));
    inset-block-start: calc(var(--dy) * var(--box));
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  /* With motion the face and the strip swap as two drawings do, at once;
     with less of it they cross-fade, and nothing steps. */
  .cut :is(.face, .smile) {
    transition: none;
  }

  .scrim {
    position: fixed;
    z-index: 1;
    inset: 0;
    visibility: hidden;
    background: oklch(from var(--surface-recess) l c h / 0.4);
    opacity: 0;
  }
  .neck {
    position: fixed;
    z-index: 2;
    inset: 0;
    inline-size: 100vw;
    block-size: 100dvh;
    visibility: hidden;
    overflow: visible;
    pointer-events: none;
    fill: var(--surface-raised);
  }
  .drawer {
    position: fixed;
    z-index: 2;
    visibility: hidden;
    overflow: hidden;
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
  .shown :is(.scrim, .neck, .drawer) {
    visibility: visible;
  }
  .inner {
    display: flex;
    flex-direction: column;
    max-block-size: min(560px, calc(100dvh - 120px));
    @media (prefers-reduced-motion: reduce) {
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-2);
    touch-action: none;
  }
  .title {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .rows {
    flex: 1 1 auto;
    min-block-size: 0;
    margin: 0;
    padding: 0 var(--space-2);
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* A row: the session's mark leading on the title's line; the title and
     its wait; what it wants, two lines at most; then the kind and where. */
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: var(--space-3);
    align-items: baseline;
    inline-size: 100%;
    min-block-size: 44px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    text-align: start;
    cursor: pointer;
  }
  /* Its machine is offline: it stands, dimmed as every stale row is. */
  .row[data-stale] {
    opacity: 0.55;
  }
  .lead {
    grid-row: 1;
    grid-column: 1;
    align-self: center;
    display: grid;
    place-items: center;
    inline-size: 18px;
    block-size: 18px;
    color: var(--ink-muted);
  }
  .lead > :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .name {
    grid-row: 1;
    grid-column: 2;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wait {
    grid-row: 1;
    grid-column: 3;
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .want {
    grid-row: 2;
    grid-column: 2 / 4;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .meta {
    grid-row: 3;
    grid-column: 2 / 4;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4) var(--space-2);
    font: var(--type-label);
    color: var(--ink-muted);
    outline: none;
    touch-action: none;
  }
  /* The grabber at the drawer's foot: pulled up, the drawer goes back. */
  .handle {
    display: grid;
    place-items: center;
    block-size: 24px;
    touch-action: none;
    cursor: grab;
  }
  .handle span {
    inline-size: 36px;
    block-size: 4px;
    border-radius: var(--radius-pill);
    background: var(--border-control);
  }
</style>
