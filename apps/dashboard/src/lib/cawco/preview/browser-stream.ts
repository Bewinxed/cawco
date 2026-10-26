/**
 * A browser artifact's stream in the panel (Projects spec §5.11, "The
 * view"), on the hub's own origin (hub browser-routes.ts), one of two ways
 * by the browser's host:
 *
 * - **container** (`/ws/browser/<instance>/<artifact>/api/ws`): neko's
 *   signaling. neko offers (`signal/provide`, its ICE servers the hub's), this
 *   screen answers, the video comes on an `RTCPeerConnection` and the
 *   person's input goes back on the data channel neko opens, as neko's own
 *   client sends it (m1k1o/neko client/core/src/transport/webrtc.ts and
 *   input/datachannel.ts: "big-endian binary messages", an opcode, a u16
 *   length, the fields). neko takes input only from the session it hosts,
 *   which the shield gives control to (agent shield.ts `control/give`).
 * - **local** (`/ws/browser/<instance>/<artifact>/cdp`): the local
 *   browser's one page as JPEG frames, each a 4-byte header (its CSS width
 *   and height, u16 big-endian) and the picture; input goes back as JSON
 *   (agent cdp-takeover.ts `CdpInput`).
 *
 * Neither keeps anything of the page: the frames are drawn and dropped.
 */
import { BROWSER_VIEW_MOVED } from "@cawco/core/browser";

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
  /** neko's session for this view, once it introduced it; the shield gives it control. */
  session: (id: string | null) => void;
  state: (state: StreamState) => void;
}

/** What the person does on the stream, in the stream's own pixels. */
export interface StreamInput {
  button: (x: number, y: number, button: number, down: boolean) => void;
  key: (event: KeyboardEvent, down: boolean) => void;
  move: (x: number, y: number) => void;
  paste: (text: string) => void;
  wheel: (x: number, y: number, event: WheelEvent) => void;
}

export interface BrowserStream extends StreamInput {
  close: () => void;
  /** The page's size in the stream's pixels (neko's screen, the local page's CSS size); null before the first. */
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
/** ICE failures in a row before the view says the stream didn't connect. Our call: neko's client gives up after 10 at a growing backoff; a person waits less. */
const ICE_TRIES = 3;
const ICE_BACKOFF_MS = 1500;
/** neko's wheel: a step per this many px of delta, the first of a gesture at once (its overlay.ts `WHEEL_STEP`). */
const WHEEL_STEP = 53;
const WHEEL_LINE = 19;
const WHEEL_GESTURE_MS = 250;
/** An answer whose video section this browser rejected (port 0), and the offer's first video codec. */
const VIDEO_REJECTED = /^m=video 0 /mu;
const VIDEO_CODEC = /^m=video[\s\S]*?a=rtpmap:\d+ ([\w-]+)/mu;

/** The hub's socket for a view: `kind` is neko's signaling or the local browser's frames. */
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

/**
 * X11 keysyms for the keys a keyboard names (X.Org keysymdef.h): a
 * character is its Latin-1 code, else `0x01000000` plus its code point.
 */
const KEYSYMS: Record<string, number> = {
  Backspace: 0xff_08,
  Tab: 0xff_09,
  Enter: 0xff_0d,
  Escape: 0xff_1b,
  Delete: 0xff_ff,
  Home: 0xff_50,
  ArrowLeft: 0xff_51,
  ArrowUp: 0xff_52,
  ArrowRight: 0xff_53,
  ArrowDown: 0xff_54,
  PageUp: 0xff_55,
  PageDown: 0xff_56,
  End: 0xff_57,
  Insert: 0xff_63,
  ContextMenu: 0xff_67,
  CapsLock: 0xff_e5,
  Shift: 0xff_e1,
  Control: 0xff_e3,
  Alt: 0xff_e9,
  AltGraph: 0xfe_03,
  Meta: 0xff_eb,
};
for (let n = 1; n <= 12; n += 1) {
  KEYSYMS[`F${n}`] = 0xff_be + n - 1;
}
const LATIN1_LAST = 0xff;
const UNICODE_KEYSYM = 0x01_00_00_00;

/** The keysym of a keyboard event's key; undefined for a key X has none for ("Unidentified", "Dead"). */
export const keysymOf = (key: string): number | undefined => {
  const named = KEYSYMS[key];
  if (named !== undefined) {
    return named;
  }
  const point = key.codePointAt(0);
  if (point === undefined || [...key].length !== 1) {
    return;
  }
  return point <= LATIN1_LAST ? point : UNICODE_KEYSYM + point;
};

/** The ctrl key pressed with V: the paste comes as the browser's own paste event, with the person's text. */
const pastes = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";

const NEKO_OP = {
  move: 1,
  scroll: 2,
  keyDown: 3,
  keyUp: 4,
  buttonDown: 5,
  buttonUp: 6,
} as const;

interface NekoMessage {
  event: string;
  payload?: Record<string, unknown>;
}

/** neko's stream into `video`, with its input on the data channel. */
export const nekoStream = (
  url: string,
  video: HTMLVideoElement,
  events: StreamEvents
): BrowserStream => {
  let socket: WebSocket | null = null;
  let peer: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let held: RTCIceCandidateInit[] = [];
  let screen: { width: number; height: number } | null = null;
  let closed = false;
  let tries = 0;
  let iceFailures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let refusedWhy: string | null = null;
  const wheel = { x: 0, y: 0, at: 0 };

  const send = (event: string, payload?: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, payload }));
    }
  };

  /** One input message: its opcode, its length and its big-endian fields (`[bytes, value]`, negative bytes signed). */
  const input = (op: number, ...fields: [number, number][]) => {
    if (channel?.readyState !== "open") {
      return;
    }
    const length = fields.reduce((sum, [bytes]) => sum + Math.abs(bytes), 0);
    const view = new DataView(new ArrayBuffer(3 + length));
    view.setUint8(0, op);
    view.setUint16(1, length);
    let at = 3;
    for (const [bytes, value] of fields) {
      if (bytes === 1) {
        view.setUint8(at, value);
      } else if (bytes === 2) {
        view.setUint16(at, value);
      } else if (bytes === -2) {
        view.setInt16(at, value);
      } else {
        view.setUint32(at, value);
      }
      at += Math.abs(bytes);
    }
    channel.send(view.buffer);
  };

  const closePeer = () => {
    peer?.close();
    peer = null;
    channel = null;
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
    at.ondatachannel = ({ channel: opened }) => {
      opened.binaryType = "arraybuffer";
      channel = opened;
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
        tries = 0;
        const size = payload.screen_size as
          { width: number; height: number } | undefined;
        screen = size ? { width: size.width, height: size.height } : null;
        events.session(
          typeof payload.session_id === "string" ? payload.session_id : null
        );
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
        heard(JSON.parse(String(event.data)) as NekoMessage);
      } catch {
        // Not neko's JSON: nothing to act on.
      }
    };
    at.onclose = (event) => {
      if (socket !== at || closed) {
        return;
      }
      socket = null;
      closePeer();
      events.session(null);
      const how = closedHow(event.code);
      if (how === "moved") {
        open();
        return;
      }
      if (how === "refused") {
        events.state({
          kind: "refused",
          why: event.reason || refusedWhy || `closed with ${event.code}`,
        });
        return;
      }
      events.state({
        kind: "lost",
        why: refusedWhy ?? (event.reason || `closed with ${event.code}`),
      });
      const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)];
      tries += 1;
      retry = setTimeout(open, wait);
    };
  };
  open();

  return {
    close: () => {
      closed = true;
      clearTimeout(retry);
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
    move: (x, y) => input(NEKO_OP.move, [2, x], [2, y]),
    button: (x, y, button, down) => {
      input(NEKO_OP.move, [2, x], [2, y]);
      // X numbers buttons from 1: left, middle, right.
      input(down ? NEKO_OP.buttonDown : NEKO_OP.buttonUp, [4, button + 1]);
    },
    wheel: (x, y, event) => {
      input(NEKO_OP.move, [2, x], [2, y]);
      const first = event.timeStamp - wheel.at > WHEEL_GESTURE_MS;
      if (first) {
        wheel.x = 0;
        wheel.y = 0;
      }
      wheel.at = event.timeStamp;
      const scale = event.deltaMode === 0 ? 1 : WHEEL_LINE;
      wheel.x += event.deltaX * scale;
      wheel.y += event.deltaY * scale;
      const step = (axis: "x" | "y") => {
        const value = wheel[axis];
        if (!first && Math.abs(value) < WHEEL_STEP) {
          return 0;
        }
        wheel[axis] = 0;
        return Math.sign(value);
      };
      const dx = step("x");
      const dy = step("y");
      if (dx || dy) {
        input(NEKO_OP.scroll, [-2, dx], [-2, dy], [1, event.ctrlKey ? 1 : 0]);
      }
    },
    key: (event, down) => {
      // Ctrl+V's V waits for the browser's paste, which carries the text.
      if (down && pastes(event)) {
        return;
      }
      const keysym = keysymOf(event.key);
      if (keysym !== undefined) {
        input(down ? NEKO_OP.keyDown : NEKO_OP.keyUp, [4, keysym]);
      }
    },
    paste: (text) => {
      // The person's clipboard into the browser's, then its paste keystroke.
      send("clipboard/set", { text });
      const v = keysymOf("v") as number;
      const control = KEYSYMS.Control as number;
      input(NEKO_OP.keyDown, [4, control]);
      input(NEKO_OP.keyDown, [4, v]);
      input(NEKO_OP.keyUp, [4, v]);
      input(NEKO_OP.keyUp, [4, control]);
    },
  };
};

/** CDP's modifier bits: Alt 1, Ctrl 2, Meta 4, Shift 8. */
const modifiersOf = (event: KeyboardEvent | MouseEvent): number =>
  (event.altKey ? 1 : 0) +
  (event.ctrlKey ? 2 : 0) +
  (event.metaKey ? 4 : 0) +
  (event.shiftKey ? 8 : 0);

const BUTTONS = ["left", "middle", "right"] as const;

/**
 * The local browser's page into `canvas`, frame by frame; `drawn` is told
 * each frame's size once it is on the canvas.
 */
export const cdpStream = (
  url: string,
  canvas: HTMLCanvasElement,
  events: StreamEvents,
  drawn: (width: number, height: number) => void
): BrowserStream => {
  let socket: WebSocket | null = null;
  let size: { width: number; height: number } | null = null;
  let closed = false;
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** A frame being decoded: the next waits, and only the newest is kept. */
  let decoding = false;
  let next: ArrayBuffer | null = null;
  const context = canvas.getContext("2d");

  const send = (message: object) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const draw = async (frame: ArrayBuffer) => {
    decoding = true;
    try {
      const header = new DataView(frame, 0, 4);
      const width = header.getUint16(0);
      const height = header.getUint16(2);
      const picture = await createImageBitmap(
        new Blob([frame.slice(4)], { type: "image/jpeg" })
      );
      if (closed) {
        picture.close();
        return;
      }
      if (canvas.width !== picture.width || canvas.height !== picture.height) {
        canvas.width = picture.width;
        canvas.height = picture.height;
      }
      context?.drawImage(picture, 0, 0);
      picture.close();
      size = { width, height };
      drawn(width, height);
    } catch {
      // A frame that doesn't decode is skipped; the next one draws.
    } finally {
      decoding = false;
      const waiting = next;
      next = null;
      if (waiting && !closed) {
        draw(waiting).catch(() => undefined);
      }
    }
  };

  const open = () => {
    events.state({ kind: "connecting" });
    const at = new WebSocket(url);
    at.binaryType = "arraybuffer";
    socket = at;
    let first = true;
    at.onmessage = (event) => {
      if (typeof event.data === "string") {
        return;
      }
      if (first) {
        first = false;
        tries = 0;
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
      const how = closedHow(event.code);
      // The person took it over: its frames come on the take-over's own
      // screencast from the socket opened again now.
      if (how === "moved") {
        open();
        return;
      }
      if (how === "refused") {
        events.state({
          kind: "refused",
          why: event.reason || `closed with ${event.code}`,
        });
        return;
      }
      events.state({
        kind: "lost",
        why: event.reason || `closed with ${event.code}`,
      });
      const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)];
      tries += 1;
      retry = setTimeout(open, wait);
    };
  };
  events.session(null);
  open();

  return {
    close: () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
      socket = null;
    },
    size: () => size,
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
  };
};
