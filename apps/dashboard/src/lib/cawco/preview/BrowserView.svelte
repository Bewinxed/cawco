<script lang="ts">
  import {
    BROWSER_SCREEN,
    type ListedBrowser,
    TAKEOVER_SCALE_MOST,
    type TakeoverFocus,
    type TakeoverLayout,
    type TakeoverTouchPoint,
  } from "@cawco/core/browser";
  /**
   * A browser artifact in the panel (Projects spec §5.11, "The view"): the
   * browser's stream, drawn here from the hub's socket (browser-stream.ts),
   * never a page of its own, standing under the panel's floating head as
   * any page not CawCo's own does (its layout is not ours to push down).
   * No band claims a row over it: while the browser is live, where it is
   * and who drives stand in the head after its title (BrowserAddress) on a
   * desk. The stream draws in its screen, one box its wait draws in too.
   * Take over stands in the head only while the stream is drawn here
   * (`viewing`). The local browser's line, on a machine with no container
   * runtime, stands under the stream in every layout.
   * No comments and no ink: nothing the person sees here reaches an agent
   * (§5.11, "Private").
   *
   * Watched (the agent driving), the screen is the stream's own shape:
   * contained and centred in the well on a desk; on a phone's sheet
   * (`addressAtFoot`) at the well's top at its width, framed, where it is
   * right under it, as a phone browser frames a page.
   *
   * Taken over, the page takes the layout of the device the person holds
   * (`form`, the head's switch; a phone starts on the phone's, a desk on
   * the desktop's, on every take-over), and the hands that drive it
   * follow the layout (the takeover pitch, shape A):
   *
   * - **Phone layout on a phone**: the page laid out at the room the panel
   *   has under the head, laid out again as the phone turns, real touch (a drag scrolls and flings, a pinch zooms,
   *   a tap clicks, a finger held still selects the word under it).
   * - **Phone layout at a desk**: the phone's width (core `FORMS.phone`) at
   *   the well's height up to a phone's (`screenHeight`), at 1:1, centred in
   *   a plain card; mouse and wheel.
   * - **Desktop layout on a phone**: the desktop page drawn at a reading
   *   size, opened where its focus stands; one finger pans the picture, two
   *   scroll the page, a pinch zooms the picture, a tap clicks. An overview
   *   in the corner marks the part in view while zoomed past the whole, and
   *   Fit the page shows it whole.
   * - **Desktop layout at a desk**: contained in the well; mouse and wheel.
   *
   * The well's states: waiting (the browser waking, its image building,
   * its stream connecting), drawn as the preview's cover draws a wait, a
   * skeleton of the page to come over its live line; live (the agent
   * driving, the person watching); you have control (the person's pointer,
   * fingers, keys and paste go to the browser; on a touch screen Show
   * keyboard raises the phone's keyboard, its typing read from a field of
   * the view's own, keyboard-sink.ts); and each failure as the house's
   * region fault draws one, Caw over its headline and line, its way out
   * leading: the machine away, the browser that didn't start, the view's
   * link lost or refused, the stream that found no way here (the stream
   * relay's settings), a codec this browser can't play.
   */
  import { FORMS, screenHeight } from "@cawco/core/stage";
  import { browserWords } from "@cawco/core/words/browser";
  import { commonWords } from "@cawco/core/words/common";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IsCoarsePointer,
    PHONE_HELD_QUERY,
  } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconKeyboardLinear,
    IconMinimizeLinear,
    IconRefresh,
    IconRefreshLinear,
  } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { newId } from "#lib/platform/id.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { store, stored } from "#lib/platform/storage.js";
  import { track } from "#lib/platform/track.js";
  import FaultDetails from "../fault/FaultDetails.svelte";
  import ShowDetails from "../fault/ShowDetails.svelte";
  import { animatedCaw } from "../home/FaultCaw.svelte";
  import BrowserAddress from "./BrowserAddress.svelte";
  import { startFromPanel } from "./browser-acts";
  import {
    type BrowserStream,
    cdpStream,
    nekoStream,
    type StreamState,
    streamUrl,
    type TakeoverStream,
  } from "./browser-stream";
  import CoverState from "./CoverState.svelte";
  import {
    SINK_AT_SPACE,
    SINK_MOST,
    SINK_PAD,
    sinkKeyRole,
    typedBetween,
  } from "./keyboard-sink";

  /** The layout a take-over's page is in: a phone's or the desktop's. */
  type Form = TakeoverLayout["form"];

  let {
    instanceId,
    artifactId,
    browser,
    machine,
    addressAtFoot = false,
    viewing = $bindable(false),
    form = $bindable<Form>("desk"),
  }: {
    instanceId: string;
    artifactId: string;
    /** The address floats at the stream's foot (a phone's sheet, whose head has no room for it); else the head holds it. */
    addressAtFoot?: boolean;
    /** The stream is drawn here: there is a page to take over (PreviewPane's Take over). */
    viewing?: boolean;
    /** The layout the page is in while the person holds it (the head's switch); each take-over starts on the device's own. */
    form?: Form;
    /** The browser as the hub lists it; null until its machine reported it. */
    browser: ListedBrowser | null;
    /** The session's machine: its name, and whether the hub reaches it. */
    machine: { machineId: string; name: string; online: boolean };
  } = $props();

  const detailsId = $props.id();
  /** Caw's side on the failure, px: a panel's (RegionFault's `panel` room). */
  const CAW_SIZE = 136;
  const sinkId = `${detailsId}-keys`;

  /** The view's name for itself on the hub (its `?token`): one neko session per tab and artifact, kept through a reload. */
  const viewer = $derived.by(() => {
    const storeKey = `cawco-browser-viewer:${artifactId}`;
    return untrack(() => {
      const kept = stored("session", storeKey);
      if (kept) {
        return kept;
      }
      const made = newId();
      store("session", storeKey, made);
      return made;
    });
  });

  const mine = $derived(!!browser?.takeover);
  const host = $derived(browser?.host ?? null);
  const live = $derived(browser?.state === "live" && machine.online);
  /**
   * What the well draws: the page's frames (a take-over on either host, the
   * local browser watched) or neko's video (the container host watched).
   */
  const source = $derived.by(() => {
    if (mine || host === "local") {
      return "frames" as const;
    }
    return host === "container" ? ("video" as const) : null;
  });

  let stream: BrowserStream | null = null;
  /** The frames' stream, which takes input: a take-over's, or the local browser's watched. */
  let frames: TakeoverStream | null = null;
  let streamState = $state<StreamState>({ kind: "connecting" });
  /** Each press of a failure's Try again opens the stream again. */
  let again = $state(0);
  let video = $state<HTMLVideoElement>();
  let canvas = $state<HTMLCanvasElement>();
  let overviewCanvas = $state<HTMLCanvasElement>();
  let well = $state<HTMLDivElement>();
  let screenBox = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  /** The field the phone's keyboard types into (keyboard-sink.ts), while the person drives. */
  let sink = $state<HTMLTextAreaElement>();
  /** The sink has the focus: the phone's keyboard is up for it. */
  let sinkFocused = $state(false);
  /** What the sink held when its typing was last sent. */
  let sent = SINK_PAD;
  /** A finger, not a cursor: Show keyboard floats at the stream's foot. */
  const coarse = new IsCoarsePointer();
  /** A phone in either hold: a finger, and a screen under the phone line (core `FORMS` tablet) on one side or the other. */
  const phoneScreen = new MediaQuery(PHONE_HELD_QUERY);
  /**
   * The person holds a phone: its sheet (`addressAtFoot`), or a phone turned
   * to landscape, whose panel stands beside the conversation. A phone's
   * page fills the room it has, in either layout, and follows it as the
   * phone turns.
   */
  const handheld = $derived(addressAtFoot || phoneScreen.current);
  let details = $state(false);
  /** A start the hub refused, in its words. */
  let refusal = $state<string | null>(null);
  let starting = $state(false);

  /** A frame's shape before the stream says its own: a desktop screen's 16:10. */
  const SCREEN_RATIO = BROWSER_SCREEN.width / BROWSER_SCREEN.height;
  /** How far a finger may move, px, and still tap or hold rather than pan. */
  const TAP_SLOP = 8;
  /** How far two fingers move apart or together, px, before they pinch; or together, before they scroll. */
  const TWO_SLOP = 12;
  /** A finger held this long without moving is a long press, as a phone's (Android's 500 ms). */
  const HOLD_MS = 500;
  /** The desktop layout on a phone opens at this share of its size: the takeover pitch's measure, where a form's column fits the sheet and its text reads. */
  const READ_SCALE = 0.6;
  /** The desktop layout's picture zooms to this share of its size at most: twice its own. */
  const ZOOM_MOST = 2;
  /** A sheet's room changes for a while as it moves between its stops: the page is laid out again once it has stood this long, ms. Our call. */
  const LAYOUT_SETTLE_MS = 200;

  /** The well's frames, counted on its element for whoever reads the engine (the probe kit). */
  function counted(width: number, height: number) {
    if (!well) {
      return;
    }
    well.dataset.frames = String(Number(well.dataset.frames ?? 0) + 1);
    well.dataset.width = String(width);
    well.dataset.height = String(height);
    if (width > 0 && height > 0 && Math.abs(width / height - ratio) > 0.001) {
      ratio = width / height;
    }
    if (
      width > 0 &&
      height > 0 &&
      (width !== framed.w || height !== framed.h)
    ) {
      framed = { w: width, h: height };
    }
    drawOverview();
  }

  /** The stream's own shape, from its frames; a screen's 16:10 until the first. */
  let ratio = $state(SCREEN_RATIO);
  /** The page's size as its frames last drew it, CSS px. */
  let framed = $state<{ w: number; h: number }>({
    w: BROWSER_SCREEN.width,
    h: BROWSER_SCREEN.height,
  });
  /** The well's room for the screen, px: its own box less its padding. */
  let room = $state({ w: 0, h: 0, gap: 0 });
  /** The phone's foot under the screen, px: where it is and its controls. */
  let footH = $state(0);

  // Each take-over starts on the layout of the device taking over: a
  // phone, held either way, on the phone's; a desk on the desktop's.
  let formFor = 0;
  $effect(() => {
    const since = browser?.takeover?.since;
    if (since && since !== formFor) {
      formFor = since;
      form = untrack(() => (handheld ? "phone" : "desk"));
    }
  });

  /** The page's room under the head on a phone's sheet: the well less its foot. */
  const below = $derived(
    Math.max(0, room.h - (addressAtFoot && live ? room.gap + footH : 0))
  );

  /** The phone layout's page as the well has room for it, CSS px: the sheet's room on a phone, a phone's shape at a desk. */
  const phoneRoom = $derived(
    handheld
      ? { w: Math.floor(room.w), h: Math.floor(below) }
      : {
          w: Math.min(FORMS.phone, Math.floor(room.w)),
          h: Math.min(screenHeight(FORMS.phone), Math.floor(room.h)),
        }
  );

  /** The phone's keyboard is up for the sink while the person drives. */
  const keyboardUp = $derived(
    mine && streamState.kind === "live" && sinkFocused
  );

  /**
   * The layout sent: the device's room once it has stood still, and kept
   * while the phone's keyboard is up (the page keeps its size, and the
   * view moves to the field instead).
   */
  let laid = $state<TakeoverLayout | null>(null);
  $effect(() => {
    if (!mine) {
      laid = null;
      return;
    }
    // At a desk the desktop layout is the browser's own viewport: the page
    // stays as it was watched.
    if (form === "desk" && !handheld) {
      if (untrack(() => laid?.form) !== "desk") {
        laid = { form: "desk" };
      }
      return;
    }
    const next = roomLayout();
    if (keyboardUp || !next) {
      return;
    }
    const now = untrack(() => laid);
    // The first layout of a form goes at once; a change waits for the
    // room to stand.
    const wait = now?.form === next.form ? LAYOUT_SETTLE_MS : 0;
    const timer = setTimeout(() => {
      if (!sameLayout(now, next)) {
        laid = next;
      }
    }, wait);
    return () => clearTimeout(timer);
  });

  /**
   * The layout the room asks for: the phone layout at the room's size, or
   * on a phone the desktop layout as tall as the room is at the picture's
   * opening zoom, so the picture fills it; none while there is no room.
   */
  function roomLayout(): TakeoverLayout | null {
    if (form === "desk") {
      return below > 0
        ? { form: "desk", height: Math.floor(below / READ_SCALE) }
        : null;
    }
    const { w, h } = phoneRoom;
    if (w <= 0 || h <= 0) {
      return null;
    }
    return {
      form: "phone",
      width: w,
      height: h,
      scale: Math.min(
        TAKEOVER_SCALE_MOST,
        Math.max(1, Math.round(window.devicePixelRatio))
      ),
      landscape: w > h,
    };
  }

  /** Whether two layouts lay the page out alike. */
  function sameLayout(
    a: TakeoverLayout | null,
    b: TakeoverLayout | null
  ): boolean {
    if (a?.form === "phone" && b?.form === "phone") {
      return (
        a.width === b.width && a.height === b.height && a.scale === b.scale
      );
    }
    return a?.form === "desk" && b?.form === "desk" && a.height === b.height;
  }

  /**
   * The page the desktop layout's picture zooms, CSS px. On a phone, the
   * size its layout lays it out at, from the moment the person picks it:
   * the one sent, else the one about to be (the phone layout's frames
   * still standing would make the whole page seem a phone's, and the
   * picture would open at that page's fit, not the reading zoom). At a
   * desk, the browser's own viewport: the frames' size.
   */
  const page = $derived.by(() => {
    if (!(mine && form === "desk" && handheld)) {
      return framed;
    }
    if (laid?.form === "desk" && laid.height !== undefined) {
      return { w: BROWSER_SCREEN.width, h: laid.height };
    }
    const next = roomLayout();
    return next?.form === "desk" && next.height !== undefined
      ? { w: BROWSER_SCREEN.width, h: next.height }
      : framed;
  });

  // The layout to the daemon: first on every connection (the stream keeps it), and on each change.
  $effect(() => {
    const layout = laid;
    untrack(() => frames?.layout(layout));
  });

  /**
   * The screen: the box the stream draws in, and the one its wait draws in
   * too. Taken over in the phone layout, the page's own size; in the
   * desktop layout on a phone, the sheet's room, the page's picture moved
   * and zoomed in it; else the stream's own shape, contained in the well on
   * a desk and at its width at the well's top on a phone.
   */
  const screen = $derived.by(() => {
    if (mine && form === "phone") {
      return laid?.form === "phone"
        ? { w: laid.width, h: laid.height }
        : phoneRoom;
    }
    if (mine && handheld) {
      return { w: room.w, h: below };
    }
    const w = addressAtFoot
      ? room.w
      : Math.max(0, Math.min(room.w, room.h * ratio));
    return { w, h: w / ratio };
  });

  /** The desktop layout's picture, while the person holds it: its zoom (0, the whole page in the screen) and where it stands, px. */
  let view = $state({ scale: 0, x: 0, y: 0 });
  /** The person moved the picture since the layout opened: where the page's focus stands no longer moves it. */
  let placed = false;
  /** The picture's zoom that shows the whole page across the screen. */
  const fit = $derived(screen.w > 0 ? screen.w / page.w : READ_SCALE);
  /** The picture moves and zooms: the desktop layout, held. */
  const picturing = $derived(mine && form === "desk");
  const zoom = $derived(
    view.scale > 0 ? Math.max(fit, Math.min(ZOOM_MOST, view.scale)) : fit
  );
  /** The page's box: the picture's size and where it stands while it moves, else the screen. */
  const pageBox = $derived(
    picturing
      ? {
          w: page.w * zoom,
          h: page.h * zoom,
          x: view.x,
          y: view.y,
        }
      : { w: screen.w, h: screen.h, x: 0, y: 0 }
  );
  /** Zoomed past the whole page: the overview stands, and Fit the page is offered. */
  const zoomedIn = $derived(picturing && zoom > fit + 0.001);

  /** The picture at zoom `scale`, standing at `x`, `y`, kept on the page. */
  function setView(scale: number, x: number, y: number) {
    const s = Math.max(fit, Math.min(ZOOM_MOST, scale));
    const most = {
      x: Math.max(0, page.w * s - screen.w),
      y: Math.max(0, page.h * s - screen.h),
    };
    const next = {
      scale: s,
      x: Math.max(0, Math.min(most.x, x)),
      y: Math.max(0, Math.min(most.y, y)),
    };
    if (next.scale !== view.scale || next.x !== view.x || next.y !== view.y) {
      view = next;
    }
  }

  // The desktop layout opens at reading size on a phone, at the page's
  // start until the daemon says where its focus stands; whole at a desk.
  $effect(() => {
    if (!picturing) {
      return;
    }
    untrack(() => {
      placed = false;
      view = { scale: handheld ? READ_SCALE : 0, x: 0, y: 0 };
    });
  });

  // The picture stays on the page as the screen or the page changes (the sheet moved, the page laid out again).
  $effect(() => {
    track(screen.w, screen.h, page.w, page.h);
    if (!picturing) {
      return;
    }
    untrack(() => {
      if (view.scale > 0) {
        setView(view.scale, view.x, view.y);
      }
    });
  });

  /** Where the page's focus stands: a desktop layout opened on a phone moves to it, until the person moves it. */
  function focused(focus: TakeoverFocus) {
    if (!(picturing && handheld) || placed) {
      return;
    }
    setView(
      zoom,
      (focus.x + focus.width / 2) * zoom - screen.w / 2,
      (focus.y + focus.height / 2) * zoom - screen.h / 3
    );
  }

  /**
   * Fit the page: the whole page across the screen; and back to reading
   * size as the layout opens, at the page's start until the daemon says
   * where the page's focus stands, then centred on it.
   */
  function fitPage() {
    if (zoomedIn) {
      placed = true;
      setView(fit, 0, 0);
      return;
    }
    placed = false;
    setView(READ_SCALE, 0, 0);
    frames?.askFocus();
  }

  // The stream, while the browser is live: the page's frames (a take-over
  // on either host, the local browser watched) or neko's video (the
  // container host watched).
  $effect(() => {
    track(again);
    const kind = source;
    const screenVideo = kind === "video" ? video : undefined;
    const screenCanvas = kind === "video" ? undefined : canvas;
    if (!(live && kind && (screenVideo || screenCanvas))) {
      return;
    }
    const events = {
      state: (next: StreamState) => {
        streamState = next;
      },
    };
    const open = (): BrowserStream | null => {
      if (screenVideo) {
        return nekoStream(
          streamUrl(instanceId, artifactId, "api", viewer),
          screenVideo,
          events
        );
      }
      if (!screenCanvas) {
        return null;
      }
      const made = cdpStream(
        streamUrl(instanceId, artifactId, "cdp", viewer),
        screenCanvas,
        events,
        counted,
        focused
      );
      made.layout(laid);
      frames = made;
      return made;
    };
    const opened = untrack(open);
    if (!opened) {
      return;
    }
    stream = opened;
    return () => {
      opened.close();
      if (stream === opened) {
        stream = null;
      }
      if (frames === opened) {
        frames = null;
      }
      streamState = { kind: "connecting" };
    };
  });

  // The video's frames, counted as they are presented.
  $effect(() => {
    const playing = video;
    if (!(playing && source === "video")) {
      return;
    }
    let handle = 0;
    const presented = () => {
      handle = playing.requestVideoFrameCallback((_now, frame) => {
        counted(frame.width, frame.height);
        presented();
      });
    };
    presented();
    return () => playing.cancelVideoFrameCallback(handle);
  });

  // The person opened it asleep, or failed at a start before this view: it
  // starts (§5.11, "or when the person opens it"), once per view, so a
  // failure the view shows is this start's, never one an older start left.
  let wokeFor = "";
  $effect(() => {
    const resting = browser?.state === "asleep" || browser?.state === "failed";
    if (!(browser && resting && machine.online) || wokeFor === browser.key) {
      return;
    }
    wokeFor = browser.key;
    untrack(() => start());
  });

  async function start() {
    if (!browser) {
      return;
    }
    starting = true;
    const why = await startFromPanel(browser.key, machine.machineId);
    starting = false;
    // A start that failed on its machine says so in the well, from the row.
    refusal = why && browser?.state !== "failed" ? why : null;
  }

  function tryAgain() {
    details = false;
    refusal = null;
    if (browser?.state === "failed") {
      start();
      return;
    }
    again += 1;
  }

  /** Reload page (the head's glass on a desk, the foot's on a phone): the page loaded again in the layout the person holds. */
  export function reloadPage() {
    if (driving) {
      frames?.reload();
    }
  }

  /** A point on the page in the stream's own pixels, the picture letterboxed in its box. */
  function at(event: { clientX: number; clientY: number }) {
    const size = stream?.size();
    const box = layer?.getBoundingClientRect();
    if (!(size && box && box.width > 0 && box.height > 0)) {
      return null;
    }
    const scale = Math.min(box.width / size.width, box.height / size.height);
    const left = box.left + (box.width - size.width * scale) / 2;
    const top = box.top + (box.height - size.height * scale) / 2;
    const clamp = (value: number, most: number) =>
      Math.max(0, Math.min(Math.round(value), most));
    return {
      x: clamp((event.clientX - left) / scale, size.width),
      y: clamp((event.clientY - top) / scale, size.height),
    };
  }

  // The head offers Take over only while there is a page to take.
  $effect(() => {
    viewing = live && streamState.kind === "live";
  });

  /** Input goes to the browser only while the person holds it and the stream stands. */
  const driving = $derived(mine && streamState.kind === "live");

  /** The fingers on the page, by pointer id: where each is, client px. */
  const fingers = new Map<number, { x: number; y: number }>();
  /**
   * What the fingers are doing: forwarded as touch (the phone layout); a
   * finger held still, its word selected and a mouse button down after it;
   * on the desktop layout's picture, one finger not yet moved (a tap or a
   * hold to come), panning it, two fingers (pinching it or scrolling the
   * page, once they have moved), or two fingers done and one still down.
   */
  type Gesture =
    | { kind: "touch" }
    | { kind: "select" }
    | { kind: "wait" }
    | { kind: "pan" }
    | {
        kind: "two";
        mode: "wait" | "pinch" | "scroll";
        dist: number;
        mid: { x: number; y: number };
        last: { x: number; y: number };
        from: { scale: number; x: number; y: number };
      }
    | { kind: "spent" };
  let gesture: Gesture | null = null;
  /** Where the one finger came down, client px: a hold or a tap is one that stayed near it. */
  let downAt = { x: 0, y: 0 };
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where the last finger came down on the screen, px from its top: the field the phone's keyboard is raised for. */
  let tappedAt = $state(0);

  /** The fingers, in the stream's pixels. */
  function points(): TakeoverTouchPoint[] {
    const out: TakeoverTouchPoint[] = [];
    for (const [id, client] of fingers) {
      const point = at({ clientX: client.x, clientY: client.y });
      if (point) {
        out.push({ id, ...point });
      }
    }
    return out;
  }

  /** An event's time on the epoch's clock, ms: the phone's own, which the page's fling reads. */
  const timeOf = (event: Event): number =>
    performance.timeOrigin + event.timeStamp;

  /** A finger held still for {@link HOLD_MS}: the word under it selected, and a drag from there selects on. */
  function armHold(point: { x: number; y: number }) {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (
        !frames ||
        fingers.size !== 1 ||
        !(gesture?.kind === "touch" || gesture?.kind === "wait")
      ) {
        return;
      }
      gesture = { kind: "select" };
      frames.hold(point.x, point.y);
    }, HOLD_MS);
  }

  /** The person's input takes the view's focus, or keeps the sink's while the phone's keyboard is up. */
  function takeFocus() {
    // With the keyboard up the sink keeps the focus, so it stays up while
    // the person taps from field to field; what it held was typed where
    // the caret stood before.
    if (keyboardUp) {
      resetSink();
    } else {
      layer?.focus();
    }
  }

  function pointer(
    event: PointerEvent,
    phase: "down" | "move" | "up" | "cancel"
  ) {
    if (!(driving && frames)) {
      return;
    }
    if (event.pointerType === "mouse") {
      mouse(event, phase, frames);
      return;
    }
    if (phase === "down") {
      takeFocus();
      layer?.setPointerCapture(event.pointerId);
      const box = screenBox?.getBoundingClientRect();
      tappedAt = box ? event.clientY - box.top : 0;
    }
    event.preventDefault();
    if (form === "phone") {
      touch(event, phase, frames);
    } else {
      picture(event, phase, frames);
    }
  }

  /** A mouse on the page, in either layout: its moves, presses and releases. */
  function mouse(
    event: PointerEvent,
    phase: "down" | "move" | "up" | "cancel",
    to: TakeoverStream
  ) {
    const point = at(event);
    if (!point || phase === "cancel") {
      return;
    }
    if (phase === "move") {
      to.move(point.x, point.y);
      return;
    }
    if (phase === "down") {
      takeFocus();
      layer?.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    to.button(point.x, point.y, event.button, phase === "down");
  }

  /** The two fingers down: their middle and how far apart they are, client px. */
  function pair(): { mid: { x: number; y: number }; dist: number } {
    const [a, b] = [...fingers.values()];
    if (!(a && b)) {
      return { mid: { x: 0, y: 0 }, dist: 0 };
    }
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  /**
   * Fingers on the phone layout's page, which the surface takes whole
   * (`touch-none`, so the phone neither scrolls the panel nor pulls to
   * refresh): each sent as the page's own touch as it comes, every sample
   * of a coalesced move with its own time, so the page scrolls, flings and
   * pinches as a phone's page does. A finger held still is a long press:
   * its touch cancelled, the word under it selected and nothing activated,
   * and a drag from there carries the selection on.
   */
  function touch(
    event: PointerEvent,
    phase: "down" | "move" | "up" | "cancel",
    to: TakeoverStream
  ) {
    if (phase === "down") {
      touchDown(event, to);
    } else if (fingers.has(event.pointerId)) {
      if (phase === "move") {
        touchMove(event, to);
      } else {
        touchLift(event, phase, to);
      }
    }
  }

  function touchDown(event: PointerEvent, to: TakeoverStream) {
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture?.kind === "select") {
      return;
    }
    gesture = { kind: "touch" };
    to.touch("start", points(), timeOf(event));
    clearTimeout(holdTimer);
    const point = at(event);
    if (fingers.size === 1 && point) {
      downAt = { x: event.clientX, y: event.clientY };
      armHold(point);
    }
  }

  function touchMove(event: PointerEvent, to: TakeoverStream) {
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const one of samples.length > 0 ? samples : [event]) {
      fingers.set(event.pointerId, { x: one.clientX, y: one.clientY });
      if (
        Math.hypot(one.clientX - downAt.x, one.clientY - downAt.y) > TAP_SLOP
      ) {
        clearTimeout(holdTimer);
      }
      const point = gesture?.kind === "select" ? at(one) : null;
      if (point) {
        to.select(point.x, point.y);
      } else if (gesture?.kind !== "select") {
        to.touch("move", points(), timeOf(one));
      }
    }
  }

  function touchLift(
    event: PointerEvent,
    phase: "up" | "cancel",
    to: TakeoverStream
  ) {
    fingers.delete(event.pointerId);
    clearTimeout(holdTimer);
    if (gesture?.kind === "select") {
      // The selection stands as the finger lifts: nothing is pressed.
      gesture = fingers.size === 0 ? null : gesture;
      return;
    }
    if (fingers.size > 0) {
      // One finger lifted of several: the page's touch goes on with the rest.
      to.touch("move", points(), timeOf(event));
      return;
    }
    to.touch(phase === "up" ? "end" : "cancel", [], timeOf(event));
    gesture = null;
  }

  /**
   * Fingers on the desktop layout's picture, a desktop page driven by a
   * mouse: as a remote desktop's client takes them (Jump Desktop, Screens,
   * Chrome Remote Desktop), one finger pans the picture and a tap clicks
   * where it lands; two fingers scroll the page, or pinch the picture's
   * zoom, whichever they do first; a finger held still selects the word
   * under it, as on the phone layout.
   */
  function picture(
    event: PointerEvent,
    phase: "down" | "move" | "up" | "cancel",
    to: TakeoverStream
  ) {
    const before = fingers.get(event.pointerId);
    if (phase === "down") {
      pictureDown(event);
    } else if (before) {
      if (phase === "move") {
        pictureMove(event, before, to);
      } else {
        pictureLift(event, phase, to);
      }
    }
  }

  function pictureDown(event: PointerEvent) {
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = at(event);
    if (fingers.size === 1) {
      gesture = { kind: "wait" };
      downAt = { x: event.clientX, y: event.clientY };
      if (point) {
        armHold(point);
      }
      return;
    }
    if (fingers.size !== 2) {
      return;
    }
    clearTimeout(holdTimer);
    const { mid, dist } = pair();
    gesture = {
      kind: "two",
      mode: "wait",
      dist,
      mid,
      last: mid,
      from: { scale: zoom, x: view.x, y: view.y },
    };
  }

  function pictureMove(
    event: PointerEvent,
    before: { x: number; y: number },
    to: TakeoverStream
  ) {
    const client = { x: event.clientX, y: event.clientY };
    fingers.set(event.pointerId, client);
    switch (gesture?.kind) {
      case "wait":
        if (Math.hypot(client.x - downAt.x, client.y - downAt.y) > TAP_SLOP) {
          clearTimeout(holdTimer);
          gesture = { kind: "pan" };
          placed = true;
          setView(
            zoom,
            view.x - (client.x - downAt.x),
            view.y - (client.y - downAt.y)
          );
        }
        return;
      case "pan":
        setView(
          zoom,
          view.x - (client.x - before.x),
          view.y - (client.y - before.y)
        );
        return;
      case "select": {
        const point = at(event);
        if (point) {
          to.select(point.x, point.y);
        }
        return;
      }
      case "two":
        twoFingers(gesture, to);
        return;
      // A finger forwarded as touch is the phone layout's; a pair's last
      // finger, or none, moves nothing.
      case "touch":
      case "spent":
      case undefined:
        return;
      default:
        return;
    }
  }

  function pictureLift(
    event: PointerEvent,
    phase: "up" | "cancel",
    to: TakeoverStream
  ) {
    fingers.delete(event.pointerId);
    clearTimeout(holdTimer);
    const point = at(event);
    if (gesture?.kind === "wait" && phase === "up" && point) {
      to.button(point.x, point.y, 0, true);
      to.button(point.x, point.y, 0, false);
    }
    gesture = fingers.size > 0 ? { kind: "spent" } : null;
  }

  /** Two fingers on the desktop layout's picture: they pinch its zoom about their middle, or scroll the page under it. */
  function twoFingers(
    two: Extract<Gesture, { kind: "two" }>,
    to: TakeoverStream
  ) {
    const { mid, dist } = pair();
    if (two.mode === "wait") {
      if (Math.abs(dist - two.dist) > TWO_SLOP) {
        two.mode = "pinch";
      } else if (Math.hypot(mid.x - two.mid.x, mid.y - two.mid.y) > TWO_SLOP) {
        two.mode = "scroll";
      } else {
        return;
      }
    }
    placed = true;
    if (two.mode === "pinch") {
      pinch(two, mid, dist);
      return;
    }
    const point = at({ clientX: mid.x, clientY: mid.y });
    if (point) {
      // The page follows the fingers: fingers up read the page further down.
      to.wheel(point.x, point.y, {
        deltaMode: 0,
        deltaX: (two.last.x - mid.x) / zoom,
        deltaY: (two.last.y - mid.y) / zoom,
      });
    }
    two.last = mid;
  }

  /** The picture zoomed by the fingers' spread, the page's point under their first middle kept under their middle. */
  function pinch(
    two: Extract<Gesture, { kind: "two" }>,
    mid: { x: number; y: number },
    dist: number
  ) {
    const box = screenBox?.getBoundingClientRect();
    if (!(box && two.dist > 0)) {
      return;
    }
    const scale = Math.max(
      fit,
      Math.min(ZOOM_MOST, (two.from.scale * dist) / two.dist)
    );
    const pageX = (two.from.x + two.mid.x - box.left) / two.from.scale;
    const pageY = (two.from.y + two.mid.y - box.top) / two.from.scale;
    setView(
      scale,
      pageX * scale - (mid.x - box.left),
      pageY * scale - (mid.y - box.top)
    );
  }

  function wheel(event: WheelEvent) {
    if (!(driving && frames)) {
      return;
    }
    const point = at(event);
    if (point) {
      event.preventDefault();
      frames.wheel(point.x, point.y, event);
    }
  }

  function key(event: KeyboardEvent, down: boolean) {
    if (!(driving && frames)) {
      return;
    }
    // Every key is the browser's while the person drives it: none reaches
    // the pane's or the app's shortcuts. Ctrl+V stays the browser's own, so
    // its paste event carries the person's text.
    event.stopPropagation();
    const pasting =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
    if (!pasting) {
      event.preventDefault();
    }
    frames.key(event, down);
  }

  function paste(event: ClipboardEvent) {
    if (!(driving && frames)) {
      return;
    }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    if (text) {
      frames.paste(text);
    }
  }

  /** The sink as it stands with nothing typed, its caret at its end. */
  function resetSink() {
    if (!sink) {
      return;
    }
    sink.value = SINK_PAD;
    sent = SINK_PAD;
    sink.setSelectionRange(SINK_PAD.length, SINK_PAD.length);
  }

  /**
   * Show keyboard, inside the person's tap: the sink focused there, where a
   * phone raises its keyboard for it. Without a scroll: the sink stands at
   * the well's top, in view.
   */
  function toggleKeyboard() {
    if (keyboardUp) {
      sink?.blur();
      return;
    }
    resetSink();
    sink?.focus({ preventScroll: true });
  }

  /**
   * While the phone's keyboard covers the sheet's foot, the phone layout's
   * page keeps its size and moves up under the head so where the person
   * last tapped (the field the keyboard is for) stands in view, px.
   */
  const keyboardShift = $derived(
    keyboardUp && form === "phone" && handheld
      ? Math.max(
          0,
          Math.min(screen.h - below, tappedAt - Math.max(0, below) / 2)
        )
      : 0
  );

  /** The keyboard changed the sink: the change typed into the browser. */
  function sinkInput(event: Event) {
    if (!(driving && frames && sink)) {
      return;
    }
    const now = sink.value;
    const typed = typedBetween(sent, now);
    sent = now;
    if (typed.back > 0 || typed.text) {
      frames.type(typed);
    }
    // A composition's field is the IME's until it ends.
    if (event instanceof InputEvent && event.isComposing) {
      return;
    }
    const caret = now.length;
    if (
      !now.startsWith(SINK_PAD) ||
      (caret > SINK_MOST && SINK_AT_SPACE.test(now))
    ) {
      resetSink();
    } else if (sink.selectionStart !== caret || sink.selectionEnd !== caret) {
      sink.setSelectionRange(caret, caret);
    }
  }

  /** Enter that would break the sink's line, when no key press said so first: typed as Enter. */
  function sinkBeforeInput(event: InputEvent) {
    if (!(driving && frames)) {
      return;
    }
    const breaks =
      event.inputType === "insertLineBreak" ||
      event.inputType === "insertParagraph";
    // One that can't be cancelled reaches the sink, and its input types it.
    if (breaks && event.cancelable) {
      event.preventDefault();
      frames.type({ back: 0, text: "\n" });
    }
  }

  /** A key in the sink: the sink takes what edits it, the browser the rest (keyboard-sink.ts `sinkKeyRole`). */
  function sinkKey(event: KeyboardEvent, down: boolean) {
    if (!(driving && frames)) {
      return;
    }
    event.stopPropagation();
    const role = sinkKeyRole(event);
    if (role === "field") {
      return;
    }
    if (role === "enter") {
      event.preventDefault();
      if (down) {
        frames.type({ back: 0, text: "\n" });
      }
      return;
    }
    key(event, down);
  }

  /**
   * The overview of the desktop layout's picture: the whole page in small,
   * drawn from each frame as it lands, the part in view marked over it.
   */
  function drawOverview() {
    const small = overviewCanvas;
    if (!(small && canvas && canvas.width > 0 && zoomedIn)) {
      return;
    }
    const width = small.clientWidth * window.devicePixelRatio;
    const height = small.clientHeight * window.devicePixelRatio;
    if (small.width !== width || small.height !== height) {
      small.width = width;
      small.height = height;
    }
    small.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
  }

  // The overview drawn as it stands up, from the frame already drawn.
  $effect(() => {
    if (overviewCanvas && zoomedIn) {
      untrack(drawOverview);
    }
  });

  /** A press on the overview: the view moved to centre there. */
  function overviewAt(event: PointerEvent) {
    const box = overviewCanvas?.getBoundingClientRect();
    if (!(box && box.width > 0 && box.height > 0)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerdown") {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } else if (event.buttons === 0) {
      return;
    }
    placed = true;
    const pageW = page.w * zoom;
    const pageH = page.h * zoom;
    setView(
      zoom,
      ((event.clientX - box.left) / box.width) * pageW - screen.w / 2,
      ((event.clientY - box.top) / box.height) * pageH - screen.h / 2
    );
  }

  /** An arrow key on the overview: the view moved a quarter of the screen that way. */
  function overviewKey(event: KeyboardEvent) {
    const step = { x: screen.w / 4, y: screen.h / 4 };
    const by: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step.x, y: 0 },
      ArrowRight: { x: step.x, y: 0 },
      ArrowUp: { x: 0, y: -step.y },
      ArrowDown: { x: 0, y: step.y },
    };
    const move = by[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    placed = true;
    setView(zoom, view.x + move.x, view.y + move.y);
  }

  /** What the well says when it shows no stream: a wait, or a failure with its way out. */
  const shown = $derived.by(
    ():
      | { kind: "wait"; line: string }
      | {
          kind: "fail";
          title: string;
          line: string;
          details?: string;
          relay?: boolean;
          again: boolean;
        }
      | null => {
      if (!machine.online) {
        return {
          kind: "fail",
          title: browserWords.awayTitle(machine.name),
          line: browserWords.awayLine(machine.name),
          again: false,
        };
      }
      // While this view's own start runs, it is starting, whatever an older start left.
      if (browser?.state === "failed" && !starting) {
        return {
          kind: "fail",
          title: browserWords.failedTitle,
          line: browserWords.failedLine(machine.name),
          ...(browser.why ? { details: browser.why } : {}),
          again: true,
        };
      }
      if (!live) {
        const progress = browser?.progress;
        return {
          kind: "wait",
          line: progress
            ? browserWords.building(progress.done, progress.total)
            : browserWords.starting,
        };
      }
      switch (streamState.kind) {
        case "connecting":
          return { kind: "wait", line: browserWords.connecting };
        case "lost":
          return {
            kind: "fail",
            title: browserWords.lostTitle,
            line: browserWords.lostLine,
            details: streamState.why,
            again: true,
          };
        case "refused":
          return {
            kind: "fail",
            title: browserWords.refusedTitle,
            line: streamState.why,
            again: true,
          };
        case "no-stream":
          return {
            kind: "fail",
            title: browserWords.noStreamTitle,
            line: browserWords.noStreamLine(machine.name),
            relay: true,
            again: true,
          };
        case "no-codec":
          return {
            kind: "fail",
            title: browserWords.noCodecTitle,
            line: browserWords.noCodecLine(streamState.codec),
            again: false,
          };
        case "live":
          return null;
        default:
          return null;
      }
    }
  );
</script>

<!-- Show keyboard, a bare symbol in a glass: held off the focus, so a press
     that hides the keyboard doesn't first take the focus from the sink
     (noVNC's keepVirtualKeyboard). -->
{#snippet keyboardKey()}
  <BarItem
    icon={IconKeyboardLinear}
    label={keyboardUp ? browserWords.hideKeyboard : browserWords.showKeyboard}
    onclick={toggleKeyboard}
    pressed={keyboardUp}
    props={{
      "aria-controls": sinkId,
      "data-slot": "browser-keyboard",
      onmousedown: (event: MouseEvent) => event.preventDefault(),
    }}
  />
{/snippet}

<section
  aria-label={browserWords.view}
  class="absolute inset-x-0 top-0 bottom-(--keyboard-lift,0px) flex flex-col min-h-0 pt-(--side-room,0px) bg-surface-well"
  data-browser-host={host ?? undefined}
  data-browser-mine={mine || undefined}
  data-slot="browser-view"
>
  <!-- The well: the screen contained in it on a desk, centred; on a
       phone's sheet the screen at its top, at its width, with where it is
       and its controls right under it. Taken over, `data-form` is the
       layout the page is in: at a desk the phone's page stands in a card
       with room round it, its shadow one the room holds whole (the well
       clips what it holds). -->
  <div
    bind:this={well}
    class="relative grid flex-1 min-h-0 place-items-center overflow-hidden bg-surface-recess data-framed:content-start data-framed:justify-items-start data-framed:gap-space-3 data-framed:p-space-3 not-data-framed:not-data-fill:data-[form=phone]:p-space-5"
    data-form={mine ? form : undefined}
    data-fill={handheld || undefined}
    data-framed={addressAtFoot || undefined}
    data-slot="browser-well"
    data-stream={source ?? undefined}
    data-stream-state={live ? streamState.kind : (browser?.state ?? "unknown")}
    {@attach frameSize(
      (node: HTMLElement) => {
        const style = getComputedStyle(node);
        const px = (value: string) => Number.parseFloat(value) || 0;
        return {
          w:
            node.clientWidth -
            px(style.paddingInlineStart) -
            px(style.paddingInlineEnd),
          h:
            node.clientHeight -
            px(style.paddingBlockStart) -
            px(style.paddingBlockEnd),
          gap: px(style.rowGap),
        };
      },
      (value) => {
        room = value;
      }
    )}
  >
    <!-- The screen: the box the page draws in. The phone layout's page at a
         desk is a plain card (the takeover pitch's frame); on a phone's
         sheet every screen is framed by a hairline. While the phone's
         keyboard is up the phone layout's page moves up under the head, so
         the field the person tapped stands over the keyboard. -->
    <div
      bind:this={screenBox}
      class="relative h-(--screen-h) w-(--screen-w) translate-y-(--keyboard-shift) overflow-hidden in-data-framed:rounded-md in-data-framed:border in-data-framed:border-border-hairline not-in-data-framed:not-in-data-fill:in-data-[form=phone]:rounded-modal not-in-data-framed:not-in-data-fill:in-data-[form=phone]:border not-in-data-framed:not-in-data-fill:in-data-[form=phone]:border-border-hairline not-in-data-framed:not-in-data-fill:in-data-[form=phone]:shadow-md"
      data-slot="browser-screen"
      style:--keyboard-shift="{-keyboardShift}px"
      style:--screen-h="{screen.h}px"
      style:--screen-w="{screen.w}px"
    >
      <!-- The page's picture: the screen's own box, or the desktop layout's
           picture at its zoom, moved under the person's fingers. While the
           stream waits (connecting again as control changes hands) the
           last picture leaves as the wait comes in, so the wait's line
           never stands over a page that is no longer there. -->
      <div
        class="absolute start-0 top-0 h-(--page-h) w-(--page-w) translate-x-(--page-x) translate-y-(--page-y) data-waiting:animate-wait-grace-out"
        data-slot="browser-page"
        data-waiting={shown?.kind === "wait" || undefined}
        style:--page-h="{pageBox.h}px"
        style:--page-w="{pageBox.w}px"
        style:--page-x="{-pageBox.x}px"
        style:--page-y="{-pageBox.y}px"
      >
        {#if source === "video"}
          <video
            bind:this={video}
            class="absolute inset-0 size-full object-contain pointer-events-none"
            data-slot="browser-video"
            disablepictureinpicture
            muted
            playsinline
          ></video>
        {:else if source === "frames"}
          <canvas
            bind:this={canvas}
            class="absolute inset-0 size-full object-contain pointer-events-none"
            data-slot="browser-frames"
          ></canvas>
        {/if}
        <!-- The person's input while they hold the browser; the agent's page is only watched otherwise. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- the remote browser is one application widget (WAI-ARIA `application`): it takes the focus, every key, the pointer and paste while the person drives it. -->
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the remote browser is one application widget, its keys, pointer and paste the person's while they drive it. -->
        <div
          bind:this={layer}
          aria-label={browserWords.view}
          class="absolute inset-0 outline-none data-driving:cursor-default data-driving:touch-none"
          data-driving={driving || undefined}
          data-slot="browser-input"
          oncontextmenu={(event) => {
            if (driving) {
              event.preventDefault();
            }
          }}
          onkeydown={(event) => key(event, true)}
          onkeyup={(event) => key(event, false)}
          onmousedown={(event) => {
            if (keyboardUp) {
              event.preventDefault();
            }
          }}
          onpaste={paste}
          onpointercancel={(event) => pointer(event, "cancel")}
          onpointerdown={(event) => pointer(event, "down")}
          onpointermove={(event) => pointer(event, "move")}
          onpointerup={(event) => pointer(event, "up")}
          {@attach (node) => {
            // Not passive: a wheel the browser takes doesn't scroll the panel.
            node.addEventListener("wheel", wheel, { passive: false });
            return () => node.removeEventListener("wheel", wheel);
          }}
          role="application"
          tabindex={driving ? 0 : -1}
        ></div>
      </div>
      {#if shown?.kind === "wait"}
        <!-- A wait as the preview's cover draws one (The Real Wait Rule),
             in the very box the stream will take: unseen for the grace,
             then the screen to come as a skeleton, the live mark and what
             it waits on in its middle, where the eye already is. -->
        <div
          class="absolute inset-0 grid place-items-center animate-wait-grace-in"
          data-slot="browser-wait"
          role="status"
        >
          <Skeleton fill="frame" hold="cover" radius="flush" />
          <div class="relative px-space-5">
            <CoverState waiting={{ line: shown.line }} />
          </div>
        </div>
      {/if}
      {#if zoomedIn}
        <!-- The whole page in small over the picture's corner, the part in
             view marked: a button that moves the view, to where it is
             pressed, or a step at a time by the arrow keys. -->
        <button
          aria-label={browserWords.overview}
          class="absolute end-space-3 top-space-3 z-1 aspect-(--page-ratio) w-22 touch-none overflow-hidden rounded-xs border border-border-contrast bg-surface-raised p-0 shadow-raised"
          data-slot="browser-overview"
          onkeydown={overviewKey}
          onpointerdown={overviewAt}
          onpointermove={overviewAt}
          style:--page-ratio={page.w / page.h}
          type="button"
        >
          <canvas bind:this={overviewCanvas} class="absolute inset-0 size-full"
          ></canvas>
          <div
            class="absolute start-(--view-x) top-(--view-y) h-(--view-h) w-(--view-w) rounded-hair border-2 border-coral-9"
            style:--view-h="{Math.min(100, (screen.h / pageBox.h) * 100)}%"
            style:--view-w="{Math.min(100, (screen.w / pageBox.w) * 100)}%"
            style:--view-x="{(pageBox.x / pageBox.w) * 100}%"
            style:--view-y="{(pageBox.y / pageBox.h) * 100}%"
          ></div>
        </button>
      {/if}
      {#if driving && coarse.current && !addressAtFoot}
        <!-- On a desk's screen under a finger, Show keyboard floats at the
             screen's trailing foot. -->
        <div class="absolute end-space-3 bottom-space-3 z-1 flex">
          <BarGlass form="group">
            {@render keyboardKey()}
          </BarGlass>
        </div>
      {/if}
    </div>
    {#if addressAtFoot && live}
      <!-- Under the page, where a phone browser keeps it: where it is, and
           while the person drives its controls: Fit the page on the
           desktop layout, Reload page, and Show keyboard. -->
      <div
        class="flex w-(--screen-w) min-w-0 items-center gap-space-2"
        data-slot="browser-foot"
        style:--screen-w="{screen.w}px"
        {@attach frameSize(
          (node: HTMLElement) => node.offsetHeight,
          (value) => {
            footH = value;
          }
        )}
      >
        <div class="flex min-w-0 flex-1">
          <BrowserAddress
            connecting={streamState.kind !== "live"}
            {mine}
            origin={browser?.origin ?? null}
          />
        </div>
        {#if driving}
          <BarGlass form="group">
            {#if picturing}
              <BarItem
                icon={IconMinimizeLinear}
                label={browserWords.fitPage}
                onclick={fitPage}
                pressed={!zoomedIn}
                props={{ "data-slot": "browser-fit" }}
              />
            {/if}
            <BarItem
              icon={IconRefreshLinear}
              label={browserWords.reloadPage}
              onclick={reloadPage}
              props={{ "data-slot": "browser-reload" }}
            />
            {#if coarse.current}
              {@render keyboardKey()}
            {/if}
          </BarGlass>
        {/if}
      </div>
    {/if}
    {#if driving}
      <!-- The phone's keyboard types here (keyboard-sink.ts): out of sight
           at the well's top, focused by Show keyboard. Autocorrect stays the
           person's; capitals are theirs to type, as on a desk. -->
      <textarea
        bind:this={sink}
        aria-label={browserWords.keyboardField}
        autocapitalize="off"
        autocomplete="off"
        class="absolute top-0 left-0 size-px p-0 border-0 opacity-0 resize-none overflow-hidden pointer-events-none"
        data-slot="browser-keys"
        id={sinkId}
        onbeforeinput={sinkBeforeInput}
        onblur={() => {
          sinkFocused = false;
        }}
        onfocus={() => {
          sinkFocused = true;
        }}
        oninput={sinkInput}
        onkeydown={(event) => sinkKey(event, true)}
        onkeyup={(event) => sinkKey(event, false)}
        onpaste={paste}
        tabindex="-1"
        value={SINK_PAD}
        {@attach () => () => {
          // Gone with the person's control: a focused field removed sends no blur.
          sinkFocused = false;
        }}></textarea>
    {/if}
    {#if refusal}
      <p
        class="absolute inset-x-0 bottom-0 m-0 px-space-3 py-space-2 border-t border-border-hairline bg-surface-raised text-error-9 text-size-body text-pretty wrap-anywhere"
        data-slot="browser-refusal"
        role="alert"
      >
        {refusal}
      </p>
    {/if}
  </div>
  <!-- A failure is the panel's own words, not the browser's page: it runs
       to the card's top under the head and takes its room on its scroller,
       as the panel's other failures do. -->
  {#if shown?.kind === "fail"}
    {@const failed = shown}
    <!-- A failure as the house's region fault draws one (RegionFault): Caw
         on the axis, the largest thing, over one headline and one line;
         under them the one way out leads on the coral, the others quiet
         under it, Show details last. It runs to the card's top under the
         head and takes its room on its own scroller. -->
    <div
      class="absolute inset-0 z-1 grid place-items-center overflow-y-auto overscroll-contain px-space-5 pt-(--side-room,0px) pb-space-5 bg-surface-well max-phone:px-space-3"
      data-slot="browser-down"
      role="alert"
      transition:appear
    >
      <div class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center">
        <div class="mb-space-4 flex-none" data-slot="browser-down-caw">
          {@render animatedCaw({ again: false, head: false, size: CAW_SIZE })}
        </div>
        <h2 class="m-0 text-center text-balance text-ink-strong type-title">
          {failed.title}
        </h2>
        <p
          class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body wrap-anywhere"
        >
          {failed.line}
        </p>
        <div class="mt-space-5 flex flex-col items-center gap-space-2">
          {#if failed.again}
            <Button
              data-lead
              icon={IconRefresh}
              label={commonWords.tryAgain}
              onclick={tryAgain}
              pending={starting}
              pendingLabel={browserWords.tryingAgain}
            />
          {/if}
          {#if failed.relay}
            <Button
              href="/config/browsers"
              label={browserWords.relaySettings}
              pad="none"
              variant={failed.again ? "link" : undefined}
            />
          {/if}
          {#if failed.details}
            <ShowDetails controls={detailsId} bind:shown={details} />
          {/if}
        </div>
        {#if failed.details && details}
          <div class="mt-space-3 w-full min-w-0">
            <FaultDetails details={failed.details} id={detailsId} />
          </div>
        {/if}
      </div>
    </div>
  {/if}
  {#if host === "local"}
    <!-- Content under the stream, never a band over it: why this machine
         shows one page at a time. -->
    <p
      class="m-0 flex-none px-space-3 py-space-2 text-ink-muted type-meta text-pretty"
      data-slot="browser-local"
    >
      {browserWords.localLine}
    </p>
  {/if}
</section>
