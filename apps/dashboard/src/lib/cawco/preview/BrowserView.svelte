<script lang="ts">
  import type { ListedBrowser } from "@cawco/core/browser";
  /**
   * A browser artifact in the panel (Projects spec §5.11, "The view"): the
   * browser's stream, drawn here from the hub's socket (browser-stream.ts),
   * never a page of its own, standing under the panel's floating head as
   * any page not CawCo's own does (its layout is not ours to push down).
   * No band claims a row over it: while the browser is live, where it is
   * and who drives stand in the head after its title (BrowserAddress) on a
   * desk. The stream draws in its screen, one box at the stream's own
   * shape that its wait draws in too: contained and centred in the well on
   * a desk; on a phone's sheet (`addressAtFoot`) at the well's top at its
   * width, framed, where it is and its controls (Zoom, Show keyboard) right
   * under it, as a phone browser frames a page. Zoomed, the page is drawn
   * twice its fitted size in a taller screen a finger pans, and a tap
   * there is a click. Take over stands in the head only while the stream
   * is drawn here (`viewing`). The local browser's line, on a machine with
   * no container runtime, stands under the stream.
   * No comments and no ink: nothing the person sees here reaches an agent
   * (§5.11, "Private").
   *
   * The well's states: waiting (the browser waking, its image building,
   * its stream connecting), drawn as the preview's cover draws a wait, a
   * skeleton of the page to come over its live line; live (the agent
   * driving, the person watching); you have control (the person's pointer,
   * keys and paste go to the browser; on a touch screen Show keyboard,
   * floating at the stream's foot, raises the phone's keyboard, its typing
   * read from a field of the view's own, keyboard-sink.ts); and each
   * failure as the house's region fault draws one, Caw over its headline
   * and line, its way out leading: the machine away, the browser that
   * didn't start, the view's link lost or refused, the stream that found
   * no way here (the stream relay's settings), a codec this browser can't
   * play.
   */
  import { browserWords } from "@cawco/core/words/browser";
  import { commonWords } from "@cawco/core/words/common";
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { track } from "#lib/cawco/track.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IsCoarsePointer } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconKeyboardLinear,
    IconRefresh,
    IconZoomInLinear,
    IconZoomOutLinear,
  } from "#lib/icons.js";
  import FaultDetails from "../fault/FaultDetails.svelte";
  import ShowDetails from "../fault/ShowDetails.svelte";
  import { animatedCaw } from "../home/FaultCaw.svelte";
  import { newId } from "../id";
  import { appear } from "../motion/curves.svelte";
  import { store, stored } from "../storage";
  import BrowserAddress from "./BrowserAddress.svelte";
  import { startFromPanel, takeOverFromPanel } from "./browser-acts";
  import {
    type BrowserStream,
    cdpStream,
    nekoStream,
    type StreamState,
    streamUrl,
  } from "./browser-stream";
  import CoverState from "./CoverState.svelte";
  import {
    SINK_AT_SPACE,
    SINK_MOST,
    SINK_PAD,
    sinkKeyRole,
    typedBetween,
  } from "./keyboard-sink";

  let {
    instanceId,
    artifactId,
    browser,
    machine,
    addressAtFoot = false,
    viewing = $bindable(false),
  }: {
    instanceId: string;
    artifactId: string;
    /** The address floats at the stream's foot (a phone's sheet, whose head has no room for it); else the head holds it. */
    addressAtFoot?: boolean;
    /** The stream is drawn here: there is a page to take over (PreviewPane's Take over). */
    viewing?: boolean;
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

  /** What each host streams: neko's video, or the local browser's frames. */
  const STREAM_OF = { container: "video", local: "frames" } as const;

  const mine = $derived(!!browser?.takeover);
  const host = $derived(browser?.host ?? null);
  const live = $derived(browser?.state === "live" && machine.online);

  let stream: BrowserStream | null = null;
  let streamState = $state<StreamState>({ kind: "connecting" });
  /** neko's session for this view, once introduced: the shield gives it control. */
  let session = $state<string | null>(null);
  /** Each press of a failure's Try again opens the stream again. */
  let again = $state(0);
  let video = $state<HTMLVideoElement>();
  let canvas = $state<HTMLCanvasElement>();
  let well = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  /** The field the phone's keyboard types into (keyboard-sink.ts), while the person drives. */
  let sink = $state<HTMLTextAreaElement>();
  /** The sink has the focus: the phone's keyboard is up for it. */
  let sinkFocused = $state(false);
  /** What the sink held when its typing was last sent. */
  let sent = SINK_PAD;
  /** A finger, not a cursor: Show keyboard floats at the stream's foot. */
  const coarse = new IsCoarsePointer();
  let details = $state(false);
  /** A start or a control hand-off the hub refused, in its words. */
  let refusal = $state<string | null>(null);
  let starting = $state(false);

  /** A frame's shape before the stream says its own: a desktop screen's 16:10. */
  const SCREEN_RATIO = 16 / 10;
  /** How much a zoomed page is drawn up on a phone. */
  const ZOOM = 2;
  /** How far a finger may move, px, and still tap rather than pan. */
  const TAP_SLOP = 8;
  /** A finger held this long without moving presses the button, so a drag then selects. Our call: the phone's long-press. */
  const HOLD_MS = 400;

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
  }

  /** The stream's own shape, from its frames; a screen's 16:10 until the first. */
  let ratio = $state(SCREEN_RATIO);
  /** The well's room for the screen, px: its own box less its padding. */
  let room = $state({ w: 0, h: 0, gap: 0 });
  /** The phone's foot under the screen, px: where it is and its controls. */
  let footH = $state(0);
  /**
   * The screen: the box the stream draws in, at the stream's own shape, and
   * the one its wait draws in too, so nothing jumps or changes shape as the
   * stream arrives. On a desk it is contained in the well, centred; on a
   * phone's sheet it stands at the well's top at its width, with where it
   * is and its controls right under it, as a phone browser frames a page.
   */
  const screen = $derived.by(() => {
    const w = addressAtFoot
      ? room.w
      : Math.max(0, Math.min(room.w, room.h * ratio));
    const fitted = w / ratio;
    // Zoomed on a phone, the screen takes the well's height down to its
    // foot, so more of the page drawn up stands in view to pan.
    const h =
      addressAtFoot && zoomed
        ? Math.max(fitted, Math.min(fitted * ZOOM, room.h - room.gap - footH))
        : fitted;
    return { w, h, fitted };
  });
  /** On a phone the page is drawn twice its fitted size, panned under a finger, so its links take a tap. */
  let zoomed = $state(false);
  /** Where a finger came down on a zoomed page: a tap there is a click, a drag pans. */
  let tapFrom: { x: number; y: number } | null = null;
  /** The one finger on the page at its own size: where it came down, where it last was in the stream's pixels, and what it is doing. */
  interface Finger {
    from: { x: number; y: number };
    id: number;
    last: { x: number; y: number };
    mode: "wait" | "scroll" | "select";
  }
  let drag = null as Finger | null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** A second finger came down: nothing is sent until every finger is up. */
  let pinching = false;

  // The stream, while the browser is live: neko's on the container host,
  // the local browser's frames on the local host.
  $effect(() => {
    track(again);
    const kind = host;
    const media = kind === "container" ? video : canvas;
    if (!(live && kind && media)) {
      return;
    }
    const events = {
      state: (next: StreamState) => {
        streamState = next;
      },
      session: (id: string | null) => {
        session = id;
      },
    };
    const opened = untrack(() =>
      kind === "container"
        ? nekoStream(
            streamUrl(instanceId, artifactId, "api", viewer),
            media as HTMLVideoElement,
            events
          )
        : cdpStream(
            streamUrl(instanceId, artifactId, "cdp", viewer),
            media as HTMLCanvasElement,
            events,
            counted
          )
    );
    stream = opened;
    return () => {
      opened.close();
      if (stream === opened) {
        stream = null;
      }
      session = null;
      streamState = { kind: "connecting" };
    };
  });

  // The video's frames, counted as they are presented.
  $effect(() => {
    const playing = video;
    if (!(playing && host === "container")) {
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

  // While the person holds the browser, control goes to this view's neko
  // session, once per take-over and session (the hub's /takeover sent
  // again with `viewer`, agent shield.ts `control/give`).
  let gaveTo = "";
  $effect(() => {
    const held = browser?.takeover;
    const own = session;
    if (!(held && own && host === "container" && browser)) {
      return;
    }
    const mark = `${held.since}:${own}`;
    if (gaveTo === mark) {
      return;
    }
    gaveTo = mark;
    const { key: browserKey } = browser;
    untrack(() =>
      takeOverFromPanel(browserKey, {
        instanceId,
        machineId: machine.machineId,
        viewer: own,
      }).then((why) => {
        refusal = why ? browserWords.cantTakeOver(why) : null;
      })
    );
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

  /** A point on the well in the stream's own pixels, the picture letterboxed in the well. */
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

  function pointer(event: PointerEvent, phase: "down" | "move" | "up") {
    if (!(driving && stream)) {
      return;
    }
    if (zoomed && event.pointerType === "touch") {
      tap(event, phase);
      return;
    }
    if (event.pointerType !== "mouse") {
      finger(event, phase);
      return;
    }
    const point = at(event);
    if (!point) {
      return;
    }
    if (phase === "move") {
      stream.move(point.x, point.y);
      return;
    }
    if (phase === "down") {
      // With the keyboard up the sink keeps the focus, so it stays up while
      // the person taps from field to field; what it held was typed where
      // the caret stood before.
      if (keyboardUp) {
        resetSink();
      } else {
        layer?.focus();
      }
      layer?.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    stream.button(point.x, point.y, event.button, phase === "down");
  }

  /**
   * A finger (or stylus) on the page at its own size, which the surface
   * takes whole (`touch-none`, so the phone neither scrolls the panel nor
   * pulls to refresh). The remote Chromium is spoken to in mouse and wheel
   * (the agent's wire has no touch message), so the finger is translated
   * the way every remote-desktop client does: a drag is wheel steps
   * following it, a tap is a click as it lifts, and a press held still
   * then dragged is a button held down, which selects text.
   */
  function finger(event: PointerEvent, phase: "down" | "move" | "up") {
    if (phase === "down") {
      fingerDown(event);
      return;
    }
    if (!drag || drag.id !== event.pointerId) {
      if (phase === "up" && !drag && event.isPrimary) {
        pinching = false;
      }
      return;
    }
    const point = at(event);
    if (phase === "up") {
      endDrag(true, point);
    } else if (point) {
      fingerMove(event, point, drag);
    }
  }

  function fingerDown(event: PointerEvent) {
    if (drag) {
      // A second finger: a pinch, which the page can't take. What the
      // first began ends, its button released.
      endDrag(false);
      pinching = true;
      return;
    }
    const point = at(event);
    if (pinching || !point) {
      return;
    }
    if (keyboardUp) {
      resetSink();
    } else {
      layer?.focus();
    }
    layer?.setPointerCapture(event.pointerId);
    const current: Finger = {
      id: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      last: point,
      mode: "wait",
    };
    drag = current;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (drag === current && current.mode === "wait") {
        current.mode = "select";
        stream?.button(current.last.x, current.last.y, 0, true);
      }
    }, HOLD_MS);
    event.preventDefault();
  }

  function fingerMove(
    event: PointerEvent,
    point: { x: number; y: number },
    current: Finger
  ) {
    if (current.mode === "select") {
      stream?.move(point.x, point.y);
      current.last = point;
      return;
    }
    const still =
      Math.hypot(
        event.clientX - current.from.x,
        event.clientY - current.from.y
      ) <= TAP_SLOP;
    if (current.mode === "wait" && still) {
      return;
    }
    clearTimeout(holdTimer);
    current.mode = "scroll";
    // The page follows the finger: a finger up reads the page further down.
    stream?.wheel(point.x, point.y, {
      ctrlKey: false,
      deltaMode: 0,
      deltaX: current.last.x - point.x,
      deltaY: current.last.y - point.y,
      timeStamp: event.timeStamp,
    });
    current.last = point;
  }

  /** The finger's gesture ends: a tap clicks, a held press releases; `lifted` is false when it is cut short (a second finger, cancel). */
  function endDrag(lifted: boolean, point?: { x: number; y: number } | null) {
    clearTimeout(holdTimer);
    const current = drag;
    drag = null;
    if (!(current && stream)) {
      return;
    }
    const end = point ?? current.last;
    if (current.mode === "select") {
      stream.button(end.x, end.y, 0, false);
    } else if (current.mode === "wait" && lifted) {
      stream.button(end.x, end.y, 0, true);
      stream.button(end.x, end.y, 0, false);
    }
  }

  /**
   * A finger on a zoomed page: a drag pans the page (the screen scrolls
   * natively), and a tap, one that barely moved, is a click where it
   * landed, its press and release sent together as it lifts.
   */
  function tap(event: PointerEvent, phase: "down" | "move" | "up") {
    if (phase === "down") {
      tapFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    if (phase === "move") {
      return;
    }
    const from = tapFrom;
    tapFrom = null;
    const point = at(event);
    if (
      !(from && point && stream) ||
      Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_SLOP
    ) {
      return;
    }
    if (keyboardUp) {
      resetSink();
    } else {
      layer?.focus();
    }
    stream.button(point.x, point.y, 0, true);
    stream.button(point.x, point.y, 0, false);
  }

  function wheel(event: WheelEvent) {
    if (!(driving && stream)) {
      return;
    }
    const point = at(event);
    if (point) {
      event.preventDefault();
      stream.wheel(point.x, point.y, event);
    }
  }

  function key(event: KeyboardEvent, down: boolean) {
    if (!(driving && stream)) {
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
    stream.key(event, down);
  }

  function paste(event: ClipboardEvent) {
    if (!(driving && stream)) {
      return;
    }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    if (text) {
      stream.paste(text);
    }
  }

  /** The phone's keyboard is up for the sink while the person drives. */
  const keyboardUp = $derived(driving && sinkFocused);

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

  /** The keyboard changed the sink: the change typed into the browser. */
  function sinkInput(event: Event) {
    if (!(driving && stream && sink)) {
      return;
    }
    const now = sink.value;
    const typed = typedBetween(sent, now);
    sent = now;
    if (typed.back > 0 || typed.text) {
      stream.type(typed);
    }
    // A composition's field is the IME's until it ends.
    if ((event as InputEvent).isComposing) {
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
    if (!(driving && stream)) {
      return;
    }
    const breaks =
      event.inputType === "insertLineBreak" ||
      event.inputType === "insertParagraph";
    // One that can't be cancelled reaches the sink, and its input types it.
    if (breaks && event.cancelable) {
      event.preventDefault();
      stream.type({ back: 0, text: "\n" });
    }
  }

  /** A key in the sink: the sink takes what edits it, the browser the rest (keyboard-sink.ts `sinkKeyRole`). */
  function sinkKey(event: KeyboardEvent, down: boolean) {
    if (!(driving && stream)) {
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
        stream.type({ back: 0, text: "\n" });
      }
      return;
    }
    key(event, down);
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
       and its controls right under it. -->
  <div
    bind:this={well}
    class="relative grid flex-1 min-h-0 place-items-center overflow-hidden bg-surface-recess data-framed:content-start data-framed:justify-items-start data-framed:gap-space-3 data-framed:p-space-3"
    data-framed={addressAtFoot || undefined}
    data-slot="browser-well"
    data-stream={host ? STREAM_OF[host] : undefined}
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
    <!-- The screen: the stream's own box, at its own shape. Zoomed on a
         phone it scrolls: the page drawn twice its size, a drag panning it. -->
    <div
      class="relative h-(--screen-h) w-(--screen-w) overflow-hidden data-zoomed:overflow-auto data-zoomed:overscroll-contain in-data-framed:rounded-md in-data-framed:border in-data-framed:border-border-hairline"
      data-slot="browser-screen"
      data-zoomed={zoomed || undefined}
      style:--screen-w="{screen.w}px"
      style:--screen-h="{screen.h}px"
    >
      <div
        class="relative h-(--page-h) w-(--page-w)"
        data-slot="browser-page"
        style:--page-w="{screen.w * (zoomed ? ZOOM : 1)}px"
        style:--page-h="{screen.fitted * (zoomed ? ZOOM : 1)}px"
      >
        {#if host === "container"}
          <video
            bind:this={video}
            class="absolute inset-0 size-full object-contain pointer-events-none"
            data-slot="browser-video"
            disablepictureinpicture
            muted
            playsinline
          ></video>
        {:else if host === "local"}
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
          class="absolute inset-0 outline-none data-driving:cursor-default data-driving:not-data-zoomed:touch-none"
          data-driving={driving || undefined}
          data-slot="browser-input"
          data-zoomed={zoomed || undefined}
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
          onpointercancel={() => {
            tapFrom = null;
            endDrag(false);
            pinching = false;
          }}
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
           its controls: Zoom, and while the person drives Show keyboard. -->
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
          <BrowserAddress {mine} origin={browser?.origin ?? null} />
        </div>
        <BarGlass form="group">
          <BarItem
            icon={zoomed ? IconZoomOutLinear : IconZoomInLinear}
            label={zoomed ? browserWords.zoomOut : browserWords.zoomIn}
            onclick={() => {
              zoomed = !zoomed;
            }}
            props={{ "data-slot": "browser-zoom" }}
          />
          {#if driving && coarse.current}
            {@render keyboardKey()}
          {/if}
        </BarGlass>
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
