/**
 * A browser artifact's stream in the panel (Projects spec §5.11, "The
 * view"), on the hub's own origin (hub browser-routes.ts), one of two ways:
 *
 * - **video** (`/ws/browser/<instance>/<artifact>/api/ws`): the container
 *   host's screen while nobody holds it, watched alone: neko's signaling.
 *   neko offers (`signal/provide`, its ICE servers the hub's), this screen
 *   answers, and the video comes on an `RTCPeerConnection` (m1k1o/neko
 *   client/core/src/transport/webrtc.ts).
 * - **frames** (`/ws/browser/<instance>/<artifact>/cdp`): one page as JPEG
 *   frames, each a 4-byte header (its CSS width and height, u16
 *   big-endian) and the picture; input goes back as JSON (core
 *   `TakeoverInput`). The local browser's page in front while
 *   nobody holds it, and the person's take-over on either host, in the
 *   layout they hold.
 *
 * Neither keeps anything of the page: the frames are drawn and dropped.
 */
import {
  BROWSER_SCREEN,
  BROWSER_VIEW_MOVED,
  type TakeoverFocus,
  type TakeoverInput,
  type TakeoverLayout,
  type TakeoverTouchPoint,
} from "@cawco/core/browser";
import { z } from "zod";
import type { Typed } from "./keyboard-sink";

/** Where the stream stands, for the well to say. */
export type StreamState =
  | { kind: "connecting" }
  | { kind: "live" }
  /** The socket closed: it opens again on its own, and Try again opens it now. */
  | { kind: "lost"; why: string }
  /** The hub refused it (4000 plus an HTTP status, its sentence as the reason): opened again only by Try again. */
  | { kind: "refused"; why: string }
  /** The media found no way to this screen (ICE failed, past its retries). */
  | { kind: "no-stream" }
  /** No video codec in common with this browser. */
  | { kind: "no-codec"; codec: string };

export interface StreamEvents {
  state: (state: StreamState) => void;
}

/** What the person does on the stream, in the stream's own pixels. */
interface StreamInput {
  button: (x: number, y: number, button: number, down: boolean) => void;
  key: (event: KeyboardEvent, down: boolean) => void;
  move: (x: number, y: number) => void;
  paste: (text: string) => void;
  /** What the phone's keyboard typed (keyboard-sink.ts): deletions, then text, a newline as Enter. */
  type: (typed: Typed) => void;
  wheel: (x: number, y: number, event: WheelInput) => void;
}

/** What a wheel step needs of an event: a real WheelEvent, or two fingers' scroll said as one. */
type WheelInput = Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">;

export interface BrowserStream {
  close: () => void;
  /** The page's size in the stream's pixels (neko's screen, the page's CSS size); null before the first. */
  size: () => { width: number; height: number } | null;
}

/** The hub's refusals close with 4000 + their HTTP status (browser-routes.ts `refusalCode`, 4401 a device not paired). */
const REFUSED_FROM = 4400;
const REFUSED_TO = 4600;

/**
 * How a view's socket closed: what it shows moved (core
 * `BROWSER_VIEW_MOVED`: another page in front, or the person's take-over's
 * own screencast), opened again at once; refused by the hub, opened again
 * only by Try again; or lost, opened again on its own after a wait.
 */
const closedHow = (code: number): "moved" | "refused" | "lost" => {
  if (code === BROWSER_VIEW_MOVED) {
    return "moved";
  }
  return code >= REFUSED_FROM && code < REFUSED_TO ? "refused" : "lost";
};
/** Waits before opening a lost socket again, longest last. Our call. */
const RETRY_MS = [1000, 2000, 5000, 10_000] as const;

/**
 * A view's socket opened again as it closes, with what the well says: at
 * once when what it shows moved, only by Try again when the hub refused
 * it, else after the next of {@link RETRY_MS}, its tries counted until it
 * opens (`opened`). `said` is what the far end said as it closed, when it
 * said more than the close.
 */
const reopening = (events: StreamEvents, open: () => void) => {
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  return {
    opened: () => {
      tries = 0;
    },
    closed: (event: CloseEvent, said: string | null = null) => {
      const how = closedHow(event.code);
      if (how === "moved") {
        open();
        return;
      }
      const named = event.reason || `closed with ${event.code}`;
      if (how === "refused") {
        events.state({ kind: "refused", why: event.reason || said || named });
        return;
      }
      events.state({ kind: "lost", why: said ?? named });
      const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)];
      tries += 1;
      retry = setTimeout(open, wait);
    },
    stop: () => clearTimeout(retry),
  };
};
/** ICE failures in a row before the view says the stream didn't connect. Our call: neko's client gives up after 10 at a growing backoff; a person waits less. */
const ICE_TRIES = 3;
const ICE_BACKOFF_MS = 1500;
/** A wheel's line, px, for a wheel that counts in lines. */
const WHEEL_LINE = 19;
/** An answer whose video section this browser rejected (port 0), and the offer's first video codec. */
const VIDEO_REJECTED = /^m=video 0 /mu;
const VIDEO_CODEC = /^m=video[\s\S]*?a=rtpmap:\d+ ([\w-]+)/mu;

/** The hub's socket for a view: `kind` is neko's signaling or the page's frames. */
export const streamUrl = (
  instanceId: string,
  artifactId: string,
  kind: "api" | "cdp",
  viewer: string
): string => {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const path = `/ws/browser/${encodeURIComponent(instanceId)}/${encodeURIComponent(artifactId)}/${kind === "api" ? "api/ws" : "cdp"}`;
  return `${scheme}//${location.host}${path}?token=${encodeURIComponent(viewer)}`;
};

/** The ctrl key pressed with V: the paste comes as the browser's own paste event, with the person's text. */
const pastes = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";

const NekoMessageSchema = z.object({
  event: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
type NekoMessage = z.infer<typeof NekoMessageSchema>;

/** neko's stream into `video`: the container host's screen, watched. */
export const nekoStream = (
  url: string,
  video: HTMLVideoElement,
  events: StreamEvents
): BrowserStream => {
  let socket: WebSocket | null = null;
  let peer: RTCPeerConnection | null = null;
  let held: RTCIceCandidateInit[] = [];
  let screen: { width: number; height: number } | null = null;
  let closed = false;
  let iceFailures = 0;
  /** The wait before ICE is asked again. */
  let retry: ReturnType<typeof setTimeout> | undefined;
  let refusedWhy: string | null = null;

  const send = (event: string, payload?: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, payload }));
    }
  };

  const closePeer = () => {
    peer?.close();
    peer = null;
  };

  const requestPeer = () => {
    held = [];
    send("signal/request", { video: {}, audio: {} });
  };

  const answer = async (sdp: string) => {
    const at = peer;
    if (!at) {
      return;
    }
    await at.setRemoteDescription({ type: "offer", sdp });
    for (const candidate of held.splice(0)) {
      at.addIceCandidate(candidate).catch(() => undefined);
    }
    await at.setLocalDescription(await at.createAnswer());
    const local = at.localDescription?.sdp ?? "";
    // No video codec in common: the browser rejected the video section.
    if (VIDEO_REJECTED.test(local)) {
      const codec = sdp.match(VIDEO_CODEC)?.[1] ?? "its";
      events.state({ kind: "no-codec", codec });
      return;
    }
    send("signal/answer", { sdp: local });
  };

  const provided = async (payload: Record<string, unknown>) => {
    closePeer();
    const at = new RTCPeerConnection({
      iceServers: (payload.iceservers as RTCIceServer[] | undefined) ?? [],
    });
    peer = at;
    at.onicecandidate = (found) => {
      if (found.candidate) {
        send("signal/candidate", found.candidate.toJSON());
      }
    };
    at.ontrack = ({ track, streams }) => {
      if (track.kind !== "video") {
        return;
      }
      video.srcObject = streams[0] ?? new MediaStream([track]);
      video.play().catch(() => undefined);
    };
    at.onconnectionstatechange = () => {
      if (peer !== at) {
        return;
      }
      if (at.connectionState === "connected") {
        iceFailures = 0;
        events.state({ kind: "live" });
      } else if (at.connectionState === "failed") {
        closePeer();
        iceFailures += 1;
        if (iceFailures >= ICE_TRIES) {
          events.state({ kind: "no-stream" });
          return;
        }
        clearTimeout(retry);
        retry = setTimeout(requestPeer, ICE_BACKOFF_MS * iceFailures);
      }
    };
    await answer(String(payload.sdp ?? ""));
  };

  const heard = (message: NekoMessage) => {
    const payload = message.payload ?? {};
    switch (message.event) {
      case "system/init": {
        again.opened();
        const size = payload.screen_size as
          { width: number; height: number } | undefined;
        screen = size ? { width: size.width, height: size.height } : null;
        requestPeer();
        return;
      }
      case "system/heartbeat":
        send("client/heartbeat");
        return;
      case "system/disconnect":
        refusedWhy =
          typeof payload.message === "string" ? payload.message : null;
        return;
      case "screen/updated":
        screen = {
          width: Number(payload.width),
          height: Number(payload.height),
        };
        return;
      case "signal/provide":
        provided(payload).catch(() => events.state({ kind: "no-stream" }));
        return;
      case "signal/offer":
      case "signal/restart":
        answer(String(payload.sdp ?? "")).catch(() => undefined);
        return;
      case "signal/candidate":
        if (peer?.remoteDescription) {
          peer
            .addIceCandidate(payload as RTCIceCandidateInit)
            .catch(() => undefined);
        } else {
          held.push(payload as RTCIceCandidateInit);
        }
        return;
      case "signal/close":
        closePeer();
        requestPeer();
        return;
      default:
        return;
    }
  };

  const open = () => {
    refusedWhy = null;
    events.state({ kind: "connecting" });
    const at = new WebSocket(url);
    socket = at;
    at.onmessage = (event) => {
      try {
        heard(NekoMessageSchema.parse(JSON.parse(String(event.data))));
      } catch (error) {
        // Not neko's JSON: nothing to act on.
        if (!(error instanceof SyntaxError || error instanceof z.ZodError)) {
          throw error;
        }
      }
    };
    at.onclose = (event) => {
      if (socket !== at || closed) {
        return;
      }
      socket = null;
      closePeer();
      again.closed(event, refusedWhy);
    };
  };
  const again = reopening(events, open);
  open();

  return {
    close: () => {
      closed = true;
      clearTimeout(retry);
      again.stop();
      closePeer();
      socket?.close();
      socket = null;
      video.srcObject = null;
    },
    size: () =>
      screen ??
      (video.videoWidth
        ? { width: video.videoWidth, height: video.videoHeight }
        : null),
  };
};

/** CDP's modifier bits: Alt 1, Ctrl 2, Meta 4, Shift 8. */
const modifiersOf = (event: KeyboardEvent | MouseEvent): number =>
  (event.altKey ? 1 : 0) +
  (event.ctrlKey ? 2 : 0) +
  (event.metaKey ? 4 : 0) +
  (event.shiftKey ? 8 : 0);

const BUTTONS = ["left", "middle", "right"] as const;

/** What the take-over's daemon says beside its frames (agent cdp-takeover.ts). */
const FocusSchema = z.object({
  t: z.literal("focus"),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * How much of a soft frame may change and still be drawn over the sharp
 * picture as a patch, as a share of the frame: a caret's blink or a letter
 * typed is, a scroll is not (the whole frame is drawn then). Our call.
 */
const PATCH_MOST = 0.25;

/** The local browser's frames, or a take-over's on either host: a view that also says the layout it holds and its fingers. */
export interface TakeoverStream extends BrowserStream, StreamInput {
  /** Where the page's focus stands, asked: the daemon tells it as on a desktop layout's opening. */
  askFocus: () => void;
  /** A finger held still at a point: the word there selected, and nothing under it activated. */
  hold: (x: number, y: number) => void;
  /** The layout the person holds: sent now, and first on every connection; frames of another size are dropped until the layout's come. */
  layout: (layout: TakeoverLayout | null) => void;
  /** The page loaded again. */
  reload: () => void;
  /** The held finger dragged to a point: the selection carried to the word there. */
  select: (x: number, y: number) => void;
  /** The fingers on a phone layout's page, in the stream's pixels, at `time` (ms since the epoch, the event's own). */
  touch: (
    phase: "start" | "move" | "end" | "cancel",
    points: TakeoverTouchPoint[],
    time: number
  ) => void;
}

/** The CSS size a layout's frames come at. */
/** The CSS size a layout lays the page out at; none for the browser's own viewport (core `TakeoverLayout`). */
const laidSize = (
  layout: TakeoverLayout
): { width: number; height: number } | null => {
  if (layout.form === "phone") {
    return { width: layout.width, height: layout.height };
  }
  return layout.height === undefined
    ? null
    : { width: BROWSER_SCREEN.width, height: layout.height };
};

/**
 * A changed region between two frames' pixels, or null when none changed.
 * A JPEG's blocks are coded each on its own, so a region the page did not
 * change decodes to the very same pixels in the next frame.
 */
const changed = (
  before: Uint32Array,
  now: Uint32Array,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null => {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (before[row + x] !== now[row + x]) {
        top = Math.min(top, y);
        bottom = y;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return bottom < 0
    ? null
    : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
};

/**
 * A browser's page into `canvas`, frame by frame: the local browser's
 * while nobody holds it, a take-over's on either host. `drawn` is told
 * each frame's size once it is on the canvas; `focus`, where the page's
 * focus stands once a desktop layout is laid out.
 *
 * The daemon sends the screencast's frames, one image px per CSS px, and
 * once the page is still a sharp picture at the layout's scale. A frame
 * after a sharp picture that changes little of it (a caret's blink, a
 * letter typed) is drawn over it as a patch, so text does not go soft and
 * sharp again with every blink; one that changes more is drawn whole.
 */
export const cdpStream = (
  url: string,
  canvas: HTMLCanvasElement,
  events: StreamEvents,
  drawn: (width: number, height: number) => void,
  focus: (at: TakeoverFocus) => void = () => undefined
): TakeoverStream => {
  let socket: WebSocket | null = null;
  let size: { width: number; height: number } | null = null;
  let closed = false;
  /** A frame being decoded: the next waits, and only the newest is kept. */
  let decoding = false;
  let next: ArrayBuffer | null = null;
  /** The layout the person holds; null while watching. */
  let held: TakeoverLayout | null = null;
  /** The size of the layout held before the browser's own viewport: its frames still on their way are dropped. */
  let left: { width: number; height: number } | null = null;
  /** The canvas holds a sharp picture, patched since by soft frames at most. */
  let sharp = false;
  /** The last soft frame, and its pixels once read: what a patch is measured against. */
  let soft: { picture: ImageBitmap; pixels: Uint32Array | null } | null = null;
  const context = canvas.getContext("2d");
  let reader: OffscreenCanvasRenderingContext2D | null = null;

  const send = (message: TakeoverInput) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  /** A picture's pixels, one word each. */
  const pixelsOf = (picture: ImageBitmap): Uint32Array | null => {
    if (
      !reader ||
      reader.canvas.width !== picture.width ||
      reader.canvas.height !== picture.height
    ) {
      reader = new OffscreenCanvas(picture.width, picture.height).getContext(
        "2d",
        { willReadFrequently: true }
      );
    }
    if (!reader) {
      return null;
    }
    reader.drawImage(picture, 0, 0);
    const { data } = reader.getImageData(0, 0, picture.width, picture.height);
    return new Uint32Array(data.buffer);
  };

  /** Keeps `picture` as the last soft frame, its pixels with it once read. */
  const keepSoft = (picture: ImageBitmap, pixels: Uint32Array | null) => {
    if (soft && soft.picture !== picture) {
      soft.picture.close();
    }
    soft = { picture, pixels };
  };

  const whole = (picture: ImageBitmap) => {
    if (canvas.width !== picture.width || canvas.height !== picture.height) {
      canvas.width = picture.width;
      canvas.height = picture.height;
    }
    context?.drawImage(picture, 0, 0);
  };

  /** A soft frame over the sharp picture: only what it changed, when that is little. */
  const patched = (picture: ImageBitmap, width: number): boolean => {
    const last = soft;
    if (!(
      sharp &&
      context &&
      last &&
      last.picture.width === picture.width &&
      last.picture.height === picture.height
    )) {
      return false;
    }
    const before = last.pixels ?? pixelsOf(last.picture);
    const now = pixelsOf(picture);
    if (!(before && now)) {
      return false;
    }
    keepSoft(picture, now);
    const box = changed(before, now, picture.width, picture.height);
    if (!box) {
      return true;
    }
    if (box.w * box.h > picture.width * picture.height * PATCH_MOST) {
      return false;
    }
    const k = canvas.width / width;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      picture,
      box.x,
      box.y,
      box.w,
      box.h,
      box.x * k,
      box.y * k,
      box.w * k,
      box.h * k
    );
    return true;
  };

  /**
   * A frame of the layout before the one asked for, still on its way as the
   * layout changed: it would draw a desktop page in a phone's box. Into the
   * browser's own viewport, whose size is the frames' own, one of the
   * layout left is.
   */
  const stale = (width: number, height: number): boolean => {
    const expected = held ? laidSize(held) : null;
    if (expected) {
      return width !== expected.width || height !== expected.height;
    }
    return left !== null && width === left.width && height === left.height;
  };

  const draw = async (frame: ArrayBuffer) => {
    decoding = true;
    try {
      const header = new DataView(frame, 0, 4);
      const width = header.getUint16(0);
      const height = header.getUint16(2);
      if (stale(width, height)) {
        return;
      }
      const picture = await createImageBitmap(
        new Blob([frame.slice(4)], { type: "image/jpeg" })
      );
      if (closed) {
        picture.close();
        return;
      }
      if (picture.width > width) {
        // The still page's sharp picture: drawn whole, kept until it changes.
        whole(picture);
        picture.close();
        sharp = true;
      } else if (!patched(picture, width)) {
        whole(picture);
        sharp = false;
        if (held?.form === "phone") {
          keepSoft(picture, null);
        } else {
          picture.close();
        }
      }
      size = { width, height };
      drawn(width, height);
    } catch (error) {
      // A frame that doesn't decode is skipped; the next one draws.
      if (!(error instanceof DOMException)) {
        throw error;
      }
    } finally {
      decoding = false;
      const waiting = next;
      next = null;
      if (waiting && !closed) {
        draw(waiting).catch(() => undefined);
      }
    }
  };

  const heard = (text: string) => {
    try {
      const said = FocusSchema.safeParse(JSON.parse(text));
      if (said.success) {
        focus(said.data);
      }
    } catch (error) {
      // Not the daemon's JSON: nothing to act on.
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
    }
  };

  const open = () => {
    events.state({ kind: "connecting" });
    const at = new WebSocket(url);
    at.binaryType = "arraybuffer";
    socket = at;
    let first = true;
    // The layout first, before any input: the daemon lays the page out in
    // it again on every connection (it cleared it when the last view left).
    at.onopen = () => {
      if (held) {
        send({ t: "layout", layout: held });
      }
    };
    at.onmessage = (event) => {
      if (typeof event.data === "string") {
        heard(event.data);
        return;
      }
      if (first) {
        first = false;
        again.opened();
        events.state({ kind: "live" });
      }
      if (decoding) {
        next = event.data as ArrayBuffer;
      } else {
        draw(event.data as ArrayBuffer).catch(() => undefined);
      }
    };
    at.onclose = (event) => {
      if (socket !== at || closed) {
        return;
      }
      socket = null;
      // Moved (the person took it over: its frames come on the take-over's
      // own screencast), it opens again now.
      again.closed(event);
    };
  };
  const again = reopening(events, open);
  open();

  return {
    close: () => {
      closed = true;
      again.stop();
      socket?.close();
      socket = null;
      soft?.picture.close();
      soft = null;
    },
    size: () => size,
    layout: (layout) => {
      left = held ? laidSize(held) : null;
      held = layout;
      sharp = false;
      soft?.picture.close();
      soft = null;
      if (layout) {
        send({ t: "layout", layout });
      }
    },
    touch: (phase, points, time) => send({ t: "touch", phase, points, time }),
    hold: (x, y) => send({ t: "hold", x, y }),
    select: (x, y) => send({ t: "select", x, y }),
    reload: () => send({ t: "reload" }),
    askFocus: () => send({ t: "askFocus" }),
    move: (x, y) => send({ t: "move", x, y }),
    button: (x, y, button, down) =>
      send({
        t: down ? "down" : "up",
        x,
        y,
        button: BUTTONS[button] ?? "left",
      }),
    wheel: (x, y, event) => {
      const scale = event.deltaMode === 0 ? 1 : WHEEL_LINE;
      send({
        t: "wheel",
        x,
        y,
        dx: event.deltaX * scale,
        dy: event.deltaY * scale,
      });
    },
    key: (event, down) => {
      if (down && pastes(event)) {
        return;
      }
      // A character typed alone is text; anything else is its key.
      const typed =
        [...event.key].length === 1 && !(event.ctrlKey || event.metaKey);
      if (typed) {
        if (down) {
          send({ t: "text", text: event.key });
        }
        return;
      }
      send({
        t: "key",
        type: down ? "down" : "up",
        key: event.key,
        modifiers: modifiersOf(event),
      });
    },
    paste: (text) => send({ t: "text", text }),
    type: ({ back, text }) => {
      const press = (key: string) => {
        send({ t: "key", type: "down", key, modifiers: 0 });
        send({ t: "key", type: "up", key, modifiers: 0 });
      };
      for (let n = 0; n < back; n += 1) {
        press("Backspace");
      }
      // Text goes in as CDP's `Input.insertText` ("inserting text that
      // doesn't come from a key press, for example an emoji keyboard or an
      // IME"); a newline is Enter's press, as a keyboard sends it.
      text.split("\n").forEach((line, at) => {
        if (at > 0) {
          press("Enter");
        }
        if (line) {
          send({ t: "text", text: line });
        }
      });
    },
  };
};
