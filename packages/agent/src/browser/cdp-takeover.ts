/**
 * A take-over (Projects spec §5.11): one page of the project's browser
 * shown to the person as JPEG frames, their pointer, fingers and keys sent
 * back in, on either host. It runs on the daemon's own connection to
 * Chromium's DevTools, never through the gate, which the shield holds
 * closed meanwhile.
 *
 * Raw CDP (`Page.startScreencast`, `Input.dispatch*`, `Emulation.*`), not
 * Playwright's `page.screencast` and `page.mouse`: the standalone binary
 * keeps playwright-core out of itself (scripts/build-binary.ts
 * `PUBLISHED_PACKAGES`). The wire is the one Playwright's wrappers speak
 * (spec check C11's branch).
 *
 * The page takes the layout of the device the person holds (core
 * {@link TakeoverLayout}): the desktop's, or a phone's shape with touch.
 * Only its shape and input change (`Emulation.setDeviceMetricsOverride`,
 * `setTouchEmulationEnabled`), never its user agent or client hints, so a
 * sign-in in progress sees the same browser. The layout reaches every page
 * a sign-in opens from the taken one and every cross-site frame in them:
 * each is attached as it opens, paused, laid out and let run in one go
 * (the takeover layout study, §2: awaited before the run, the layout call
 * never answers). A page the taken one opens (a sign-in's popup or new tab)
 * is the one shown until it closes. Chromium drops every override with the
 * connection that set it, so the agent's desktop layout comes back when
 * the take-over ends ({@link CdpTakeover.stop}); with no view attached the
 * layout is cleared at once, so a phone that drops leaves no phone layout
 * behind.
 *
 * A view attaches as a {@link CdpViewer}: every frame goes to it as one
 * binary message, a 4-byte header (the page's viewport width and height in
 * CSS pixels, uint16 big-endian) then the JPEG; where the page's focus
 * stands goes as JSON text (core {@link TakeoverFocus}). It sends
 * core {@link TakeoverInput} as JSON text, its coordinates in those CSS pixels.
 * Frames are made only while a view is attached.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  BROWSER_SCREEN,
  TAKEOVER_SCALE_MOST,
  type TakeoverFocus,
  type TakeoverInput,
  type TakeoverLayout,
} from "@cawco/core/browser";
import { z } from "zod";
import { CdpCalls } from "./cdp-calls";

/** One open view of the take-over: where its frames, and word of the page's focus, go. */
export interface CdpViewer {
  close: (code: number, why: string) => void;
  send: (frame: Uint8Array | string) => void;
}

type Json = Record<string, unknown>;

const JSON_OBJECT = z.record(z.string(), z.unknown());
const MessageSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
  id: z.number().optional(),
  method: z.string().optional(),
  params: JSON_OBJECT.optional(),
  result: JSON_OBJECT.optional(),
  sessionId: z.string().optional(),
});
type Message = z.infer<typeof MessageSchema>;

/** A take-over's screencast: none yet, frames being made, or ended. */
type CastState = "idle" | "casting" | "stopped";

/** The frame's largest edges, and the page's viewport in the desktop layout: the container host's screen. */
const FRAME = BROWSER_SCREEN;
const QUALITY = 70;
/** The sharp picture's quality: it stands while the page is still, so it is read closely. */
const SHARP_QUALITY = 80;
/**
 * How long the page shows no new frame before its sharp picture is taken:
 * the screencast is one image px per CSS px whatever the page's scale, soft
 * on a phone's 3x screen, so a still page is captured again at its scale
 * (the sharpness check: about 250 ms from the last move to the sharp frame).
 */
const SETTLE_MS = 150;
/** Fingers a phone layout's page takes at once. */
const TOUCH_POINTS = 5;
/** A phone layout's page is never laid out smaller than this, CSS px: a sheet's least room. */
const PHONE_LEAST = 120;
/** Nor larger than this, CSS px. */
const PHONE_MOST = 4096;
/** Fingers a view sends at most at once. */
const FINGERS_MOST = 10;

/** How long one call to Chromium may take before it is given up. */
const CALL_MS = 15_000;

/**
 * One CDP connection of the daemon's own, at the browser's level, with
 * flat sessions: calls answered by id, events handed to `onEvent`.
 */
export class CdpLink {
  readonly #socket: WebSocket;
  readonly #calls: CdpCalls;
  onEvent: (message: Message) => void = () => undefined;
  onClose: () => void = () => undefined;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    this.#calls = new CdpCalls((text) => socket.send(text));
    socket.onmessage = (event) => {
      let message: Message;
      try {
        message = MessageSchema.parse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        this.#calls.settle(message.id, message);
        return;
      }
      this.onEvent(message);
    };
    socket.onclose = () => {
      this.#calls.fail("The browser's DevTools connection closed.");
      this.onClose();
    };
  }

  /** The browser-level connection of the Chromium whose DevTools answer at `devtools` (`http://127.0.0.1:<port>`). */
  static async open(devtools: string): Promise<CdpLink> {
    const read = await readWithin(CALL_MS, (signal) =>
      fetch(`${devtools}/json/version`, { signal }).then(
        (response) =>
          response.json() as Promise<{ webSocketDebuggerUrl?: string }>
      )
    );
    if (read.kind === "unanswered") {
      throw new Error(
        `The browser's DevTools at ${devtools} did not answer within ${CALL_MS / 1000} s.`
      );
    }
    const url = read.value.webSocketDebuggerUrl;
    if (!url) {
      throw new Error(`The browser's DevTools at ${devtools} named no socket.`);
    }
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error(`${url} did not open.`));
    });
    return new CdpLink(socket);
  }

  /** One call, answered within `ms` (a page's script reading a whole database takes longer than a protocol call). */
  async call(
    method: string,
    params: Json = {},
    sessionId?: string,
    ms = CALL_MS
  ): Promise<Json> {
    const read = await readWithin(ms, (signal) =>
      this.#calls.call(method, params, sessionId, signal)
    );
    if (read.kind === "unanswered") {
      throw new Error(`${method} got no answer within ${ms / 1000} s.`);
    }
    return read.value;
  }

  /**
   * Sends one call and waits for no answer: for a command whose answer is
   * another party's to give (a navigation's, which comes with the site's
   * response), where the caller must not wait on it.
   */
  post(method: string, params: Json = {}, sessionId?: string): void {
    this.#calls.post(method, params, sessionId);
  }

  /** A flat session on `targetId`. */
  async attach(targetId: string): Promise<string> {
    const { sessionId } = await this.call("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    if (typeof sessionId !== "string") {
      throw new Error(`The browser did not attach to ${targetId}.`);
    }
    return sessionId;
  }

  close(): void {
    this.#socket.close();
  }
}

/** The CDP button name a view's button stands for. */
const BUTTON = { left: "left", middle: "middle", right: "right" } as const;

/** The touch event each of a view's finger phases is. */
const TOUCH = {
  start: "touchStart",
  move: "touchMove",
  end: "touchEnd",
  cancel: "touchCancel",
} as const;

/** Windows virtual key codes for the keys that act without a character (Chromium reads them to edit and move). */
const VIRTUAL_KEYS: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Escape: 27,
  " ": 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
  Meta: 91,
};

/** What `Input.dispatchKeyEvent` takes for a view's key, beside its type. */
const keyEvent = (key: string): Json => {
  const named = VIRTUAL_KEYS[key];
  if (named !== undefined) {
    return {
      key,
      windowsVirtualKeyCode: named,
      ...(key === "Enter" ? { text: "\r" } : {}),
    };
  }
  // One letter or digit: its code is its capital's (Chromium's key map).
  const code = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  return { key, windowsVirtualKeyCode: code };
};

/** A point on the page, CSS px (zod 4's numbers are finite). */
const AT = { x: z.number(), y: z.number() };
const MODIFIERS = z.number().int().optional();
const PHONE_SIDE = z.number().int().min(PHONE_LEAST).max(PHONE_MOST);
const POINTER = {
  ...AT,
  button: z.enum(["left", "middle", "right"]).optional(),
  modifiers: MODIFIERS,
};

const InputSchema: z.ZodType<TakeoverInput> = z.discriminatedUnion("t", [
  z.object({ t: z.literal("move"), ...POINTER }),
  z.object({ t: z.literal("down"), ...POINTER }),
  z.object({ t: z.literal("up"), ...POINTER }),
  z.object({
    t: z.literal("wheel"),
    ...AT,
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    t: z.literal("key"),
    type: z.enum(["down", "up"]),
    key: z.string(),
    modifiers: MODIFIERS,
  }),
  z.object({ t: z.literal("text"), text: z.string() }),
  z.object({
    t: z.literal("layout"),
    layout: z.discriminatedUnion("form", [
      z.object({ form: z.literal("desk") }),
      z.object({
        form: z.literal("phone"),
        width: PHONE_SIDE,
        height: PHONE_SIDE,
        scale: z.number().min(1).max(TAKEOVER_SCALE_MOST),
        landscape: z.boolean(),
      }),
    ]),
  }),
  z.object({
    t: z.literal("touch"),
    phase: z.enum(["start", "move", "end", "cancel"]),
    points: z
      .array(z.object({ id: z.number().int(), ...AT }))
      .max(FINGERS_MOST),
    time: z.number(),
  }),
  z.object({ t: z.literal("hold"), ...AT }),
  z.object({ t: z.literal("select"), ...AT }),
  z.object({ t: z.literal("reload") }),
]);

/** A view's message as {@link TakeoverInput}, or undefined when it is none. */
export const cdpInputOf = (text: string): TakeoverInput | undefined => {
  try {
    const read = InputSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    // Not JSON: no input.
  }
};

/** Where the page's focus stands, as {@link TakeoverFocus} reads it: the field the agent left the person at. */
const FOCUS_SCRIPT = `(() => {
  const at = document.activeElement;
  if (!at || at === document.body || at === document.documentElement) return null;
  const box = at.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? [box.x, box.y, box.width, box.height] : null;
})()`;

/** The world a long press selects in: the take-over's own, beside the page's (`Page.createIsolatedWorld`). */
const SELECT_WORLD = "cawco-takeover";

/**
 * Selects the word at (`x`, `y`), a point of the page's picture in its
 * visual viewport's CSS px (a pinch moves and scales it over the layout
 * viewport the caret is found in), or with `extend` carries the selection
 * on to the word there, back or forth from where it started. A word is
 * Intl.Segmenter's, the one a phone's long press selects.
 */
const SELECT_SCRIPT = `(x, y, extend) => {
  const view = visualViewport;
  const at = document.caretPositionFromPoint(
    view.offsetLeft + x / view.scale,
    view.offsetTop + y / view.scale
  );
  const node = at && at.offsetNode;
  if (!node) return;
  const offset = at.offset;
  let start = offset;
  let end = offset;
  if (node.nodeType === Node.TEXT_NODE) {
    const words = new Intl.Segmenter(undefined, { granularity: "word" });
    for (const part of words.segment(node.data)) {
      const after = part.index + part.segment.length;
      if (part.isWordLike && part.index <= offset && offset <= after) {
        start = part.index;
        end = after;
        break;
      }
    }
  }
  const selection = getSelection();
  if (extend && selection.anchorNode) {
    const from = document.createRange();
    from.setStart(selection.anchorNode, selection.anchorOffset);
    selection.extend(node, from.comparePoint(node, offset) < 0 ? start : end);
  } else {
    selection.setBaseAndExtent(node, start, node, end);
  }
}`;

/** How a take-over attaches the pages and frames it lays out: each paused as it opens (Chromium's `waitForDebuggerOnStart`). */
const PAUSED = {
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true,
};

/**
 * A JPEG's size, px, from its frame header (ITU T.81 B.2.2: a start-of-frame
 * marker, SOF0 to SOF15 but DHT, JPG and DAC, then its length, precision,
 * height and width); undefined when it names none.
 */
const jpegSize = (
  jpeg: Uint8Array
): { width: number; height: number } | undefined => {
  const bytes = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  let at = 2;
  while (at + 9 < jpeg.length && bytes.getUint8(at) === 0xff) {
    const marker = bytes.getUint8(at + 1);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: bytes.getUint16(at + 5),
        width: bytes.getUint16(at + 7),
      };
    }
    at += 2 + bytes.getUint16(at + 2);
  }
};

/** A page or a cross-site frame the take-over lays out, on its own flat session. */
type Kind = "page" | "iframe";

/**
 * One take-over of one page of a project's browser: started by the shield
 * on the page it brought to the front, stopped at hand-back. With `watch`,
 * a screencast alone (cdp-watch.ts).
 */
export class CdpTakeover {
  readonly #link: CdpLink;
  readonly targetId: string;
  readonly #viewers = new Set<CdpViewer>();
  /** Frames being made (a view is attached), or the take-over over. */
  #state: CastState = "idle";
  /** The pointer's held button, which a move carries. */
  #held: keyof typeof BUTTON | undefined;
  /** A screencast alone: the view's input is dropped. */
  readonly #watch: boolean;
  /** Every page and cross-site frame laid out, by session: the taken page's, each page opened since, and their frames. */
  readonly #sessions = new Map<string, Kind>();
  /** The pages by session, oldest first: the taken page, then each opened since. The last is shown. */
  readonly #pages: string[] = [];
  /** The layout the views hold; null while none is attached, and nothing is laid out. */
  #layout: TakeoverLayout | null = null;
  /** The page session frames are being made of; frames of any other are dropped. */
  #cast: string | undefined;
  /** The last frame as Chromium sent it: one that changes nothing is not sent over the sharp picture. */
  #lastData = "";
  /** The last frame sent, for a view that attaches while the page is still (Chromium sends one only on a change). */
  #lastFrame: Uint8Array | undefined;
  /** The shown page's viewport, CSS px, as its frames say it. */
  #size: { width: number; height: number } = { ...FRAME };
  /** Frames sent; a sharp picture taken while one came is dropped. */
  #frames = 0;
  #settle: ReturnType<typeof setTimeout> | undefined;
  /** The daemon's clock less the phone's, the least seen: a finger's time on this machine's clock, never ahead of it. */
  #skew: number | undefined;
  /** The page shown moved to another (a sign-in's popup, or back): the shield names it in the address. */
  onShown: (targetId: string) => void = () => undefined;
  /** Each page's target, by session. */
  readonly #targets = new Map<string, string>();

  private constructor(
    link: CdpLink,
    session: string,
    targetId: string,
    watch: boolean
  ) {
    this.#link = link;
    this.targetId = targetId;
    this.#watch = watch;
    this.#sessions.set(session, "page");
    this.#pages.push(session);
    this.#targets.set(session, targetId);
    link.onEvent = (message) => this.#event(message);
    link.onClose = () => this.#end("The browser stopped.");
  }

  /**
   * Starts a take-over of page `targetId` of the Chromium at `devtools`;
   * with `watch`, a screencast alone, for a view while nobody holds the
   * browser (cdp-watch.ts): the page keeps the viewport the agent drives it
   * at, and the view's input never reaches it.
   */
  static async start(
    devtools: string,
    targetId: string,
    { watch = false }: { watch?: boolean } = {}
  ): Promise<CdpTakeover> {
    const link = await CdpLink.open(devtools);
    try {
      const session = await link.attach(targetId);
      await link.call("Page.enable", {}, session);
      const takeover = new CdpTakeover(link, session, targetId, watch);
      if (!watch) {
        // The taken page's cross-site frames, and every page opened from
        // here on (a page's own `Target.setAutoAttach` reaches its frames,
        // the browser's its pages), each laid out before its first script.
        await Promise.all([
          link.call(
            "Target.setAutoAttach",
            { ...PAUSED, filter: [{ type: "iframe" }] },
            session
          ),
          link.call("Target.setAutoAttach", {
            ...PAUSED,
            filter: [{ type: "page" }],
          }),
        ]);
      }
      return takeover;
    } catch (error) {
      link.close();
      throw error;
    }
  }

  /** How many views are attached now. */
  get viewers(): number {
    return this.#viewers.size;
  }

  /** The page shown: the newest page opened, else the taken one. */
  get #shown(): string | undefined {
    return this.#pages.at(-1);
  }

  /** A view attached: frames start with the first. Answers how it is let go. */
  async attach(viewer: CdpViewer): Promise<() => void> {
    if (this.#state === "stopped") {
      viewer.close(1001, "The take-over ended.");
      return () => undefined;
    }
    this.#viewers.add(viewer);
    if (this.#state === "idle") {
      this.#state = "casting";
      await this.#castOn(this.#shown);
    } else if (this.#lastFrame) {
      viewer.send(this.#lastFrame);
    }
    return () => this.#detach(viewer);
  }

  #detach(viewer: CdpViewer): void {
    if (!this.#viewers.delete(viewer) || this.#viewers.size > 0) {
      return;
    }
    this.#state = "idle";
    const cast = this.#cast;
    this.#cast = undefined;
    this.#lastFrame = undefined;
    clearTimeout(this.#settle);
    if (cast) {
      this.#link.call("Page.stopScreencast", {}, cast).catch(() => undefined);
    }
    // Nobody sees the page: it goes back to the desktop's own layout, so a
    // phone that dropped leaves no phone layout behind. The next view says
    // its layout first.
    if (!this.#watch) {
      this.#queue(() => this.#lay(null));
    }
  }

  /** The inputs landing, one after another. */
  #landing: Promise<void> = Promise.resolve();

  /** `work` once everything queued before it has landed. */
  #queue(work: () => Promise<void>): Promise<void> {
    const landed = this.#landing.then(work);
    this.#landing = landed.catch(() => undefined);
    return landed;
  }

  /**
   * One message of a view's: the person's pointer, fingers, keys or words,
   * onto the page shown, or the layout they hold, after every message before
   * it has landed. A message can take more than one call (Enter's press,
   * then its character), and the view sends the next without waiting: run
   * side by side, a word typed after Return went in before Return's newline.
   */
  input(input: TakeoverInput): Promise<void> {
    return this.#queue(() => this.#land(input));
  }

  async #land(input: TakeoverInput): Promise<void> {
    if (this.#state === "stopped" || this.#watch) {
      return;
    }
    if (input.t === "layout") {
      await this.#lay(input.layout);
      return;
    }
    const page = this.#shown;
    if (!page) {
      return;
    }
    switch (input.t) {
      case "touch":
        await this.#touch(page, input);
        return;
      case "hold":
        // A finger held still: the word under it selected, as a phone's
        // long press does, and never what is under it activated (Chromium's
        // own long press is not fed by these touches, the sharpness check
        // §3, and a mouse's double press would click on its release). Its
        // touch is cancelled first, so the page takes no tap either.
        await this.#link
          .call(
            "Input.dispatchTouchEvent",
            { type: "touchCancel", touchPoints: [] },
            page
          )
          .catch(() => undefined);
        await this.#select(page, input.x, input.y, false);
        return;
      case "select":
        await this.#select(page, input.x, input.y, true);
        return;
      case "move":
        await this.#mouse(
          page,
          "mouseMoved",
          input.x,
          input.y,
          input.modifiers
        );
        return;
      case "down":
        this.#held = input.button ?? "left";
        await this.#mouse(
          page,
          "mousePressed",
          input.x,
          input.y,
          input.modifiers
        );
        return;
      case "up":
        await this.#mouse(
          page,
          "mouseReleased",
          input.x,
          input.y,
          input.modifiers
        );
        this.#held = undefined;
        return;
      case "wheel":
        await this.#link.call(
          "Input.dispatchMouseEvent",
          {
            type: "mouseWheel",
            x: input.x,
            y: input.y,
            deltaX: input.dx,
            deltaY: input.dy,
          },
          page
        );
        return;
      case "key":
        await this.#link.call(
          "Input.dispatchKeyEvent",
          {
            type: input.type === "down" ? "rawKeyDown" : "keyUp",
            modifiers: input.modifiers ?? 0,
            ...keyEvent(input.key),
          },
          page
        );
        // Enter's character goes with its press, as a keyboard's does.
        if (input.type === "down" && input.key === "Enter") {
          await this.#link.call(
            "Input.dispatchKeyEvent",
            { type: "char", text: "\r", key: "Enter" },
            page
          );
        }
        return;
      case "text":
        await this.#link.call("Input.insertText", { text: input.text }, page);
        return;
      case "reload":
        await this.#link.call("Page.reload", {}, page);
        return;
      default:
        return;
    }
  }

  /**
   * The fingers on the page, as the phone saw them: each event at the
   * phone's own time (moved onto this machine's clock), so the page's
   * fling takes the finger's real speed, however the events were spaced on
   * the way (the sharpness check §2: unstamped, a fling ran 4-15x short).
   * Chromium presses, moves and lifts each finger by its id against the
   * last event's; an end or a cancel lifts every finger.
   */
  #touch(
    page: string,
    input: Extract<TakeoverInput, { t: "touch" }>
  ): Promise<unknown> {
    const skew = Date.now() - input.time;
    this.#skew = Math.min(this.#skew ?? skew, skew);
    const lifts = input.phase === "end" || input.phase === "cancel";
    return this.#link.call(
      "Input.dispatchTouchEvent",
      {
        type: TOUCH[input.phase],
        touchPoints: lifts
          ? []
          : input.points.map(({ id, x, y }) => ({ id, x, y })),
        timestamp: (input.time + this.#skew) / 1000,
      },
      page
    );
  }

  /**
   * The word at a point of the picture (its CSS px) selected in the page's
   * own Selection, or with `extend` the selection carried on to the word
   * there: in a world of the take-over's own (`Page.createIsolatedWorld`),
   * which shares the page's document and none of its scripts, so the page
   * hears a selection change and no pointer, mouse or click event.
   */
  async #select(
    page: string,
    x: number,
    y: number,
    extend: boolean
  ): Promise<void> {
    const tree = await this.#link.call("Page.getFrameTree", {}, page);
    const frameId = (tree.frameTree as { frame?: { id?: unknown } } | undefined)
      ?.frame?.id;
    if (typeof frameId !== "string") {
      return;
    }
    const world = await this.#link.call(
      "Page.createIsolatedWorld",
      { frameId, worldName: SELECT_WORLD },
      page
    );
    await this.#link.call(
      "Runtime.evaluate",
      {
        expression: `(${SELECT_SCRIPT})(${x}, ${y}, ${extend})`,
        contextId: world.executionContextId,
      },
      page
    );
  }

  #mouse(
    page: string,
    type: "mouseMoved" | "mousePressed" | "mouseReleased",
    x: number,
    y: number,
    modifiers = 0
  ): Promise<unknown> {
    const button = this.#held ? BUTTON[this.#held] : "none";
    return this.#link.call(
      "Input.dispatchMouseEvent",
      {
        type,
        x,
        y,
        modifiers,
        button,
        ...(type === "mouseMoved" ? {} : { clickCount: 1 }),
      },
      page
    );
  }

  /**
   * The calls that lay a page or frame out in `layout`; null clears what
   * the take-over set. A frame takes the layout's touch alone: its size is
   * its page's.
   */
  #layCalls(
    session: string,
    kind: Kind,
    layout: TakeoverLayout | null
  ): Promise<unknown>[] {
    const call = (method: string, params: Json = {}) =>
      this.#link.call(method, params, session).catch(() => undefined);
    const phone = layout?.form === "phone";
    const touch = call(
      "Emulation.setTouchEmulationEnabled",
      phone
        ? { enabled: true, maxTouchPoints: TOUCH_POINTS }
        : { enabled: false }
    );
    if (kind === "iframe") {
      return [touch];
    }
    if (!layout) {
      return [
        call("Emulation.clearDeviceMetricsOverride"),
        touch,
        call("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }),
      ];
    }
    // The desktop layout is the container host's screen on both hosts: the
    // local host's headless Chromium lays the page out in its window less
    // the browser's own UI, whose height changes by version (1280x657
    // under Chrome 156's new headless for a 1280,800 window). The
    // viewport is set as Playwright sets every viewport (playwright-core
    // 1.64.1 `_updateViewport`).
    const metrics =
      layout.form === "phone"
        ? {
            width: layout.width,
            height: layout.height,
            deviceScaleFactor: layout.scale,
            mobile: true,
            screenOrientation: layout.landscape
              ? { type: "landscapePrimary", angle: 90 }
              : { type: "portraitPrimary", angle: 0 },
          }
        : {
            width: FRAME.width,
            height: FRAME.height,
            deviceScaleFactor: 1,
            mobile: false,
          };
    return [call("Emulation.setDeviceMetricsOverride", metrics), touch];
  }

  /**
   * Every page and frame laid out in `layout` (null: cleared), the
   * screencast made again at its size. Frames of the old layout already on
   * their way are dropped (they would draw a desktop page in a phone's
   * box): none is sent between the old screencast's end and the new one's.
   */
  async #lay(layout: TakeoverLayout | null): Promise<void> {
    const before = this.#layout;
    this.#layout = layout;
    // A new view's clock may be another's.
    this.#skew = undefined;
    const cast = this.#cast;
    this.#cast = undefined;
    clearTimeout(this.#settle);
    if (cast) {
      await this.#link
        .call("Page.stopScreencast", {}, cast)
        .catch(() => undefined);
    }
    const formMoved = before?.form !== layout?.form;
    await Promise.all(
      [...this.#sessions].flatMap(([session, kind]) => [
        ...this.#layCalls(session, kind, layout),
        // A pinch on the phone layout is not carried into the desktop's.
        ...(formMoved && kind === "page"
          ? [
              this.#link
                .call(
                  "Emulation.setPageScaleFactor",
                  { pageScaleFactor: 1 },
                  session
                )
                .catch(() => undefined),
            ]
          : []),
      ])
    );
    if (this.#state === "casting" && layout) {
      await this.#castOn(this.#shown);
    }
    if (layout?.form === "desk" && formMoved) {
      await this.#tellFocus();
    }
  }

  /** Frames of page `session` from now on, at the layout's size. */
  async #castOn(session: string | undefined): Promise<void> {
    if (!session || this.#state !== "casting") {
      return;
    }
    this.#cast = session;
    this.#lastData = "";
    const most =
      this.#layout?.form === "phone"
        ? { width: this.#layout.width, height: this.#layout.height }
        : FRAME;
    await this.#link.call(
      "Page.startScreencast",
      {
        format: "jpeg",
        quality: QUALITY,
        maxWidth: most.width,
        maxHeight: most.height,
      },
      session
    );
  }

  /** The page shown moved (one opened, or the newest closed): its frames from now on. */
  async #reshow(): Promise<void> {
    const shown = this.#shown;
    const cast = this.#cast;
    if (shown === cast) {
      return;
    }
    this.#cast = undefined;
    clearTimeout(this.#settle);
    if (cast && this.#sessions.has(cast)) {
      await this.#link
        .call("Page.stopScreencast", {}, cast)
        .catch(() => undefined);
    }
    await this.#castOn(shown).catch(() => undefined);
    const target = shown ? this.#targets.get(shown) : undefined;
    if (target) {
      this.onShown(target);
    }
  }

  /** Tells the views where the shown page's focus stands, for a view that opens a wide page where the person is to type. */
  async #tellFocus(): Promise<void> {
    const page = this.#shown;
    if (!page) {
      return;
    }
    const read = await this.#link
      .call(
        "Runtime.evaluate",
        { expression: FOCUS_SCRIPT, returnByValue: true },
        page
      )
      .catch((): Json => ({}));
    const box = (read.result as { value?: unknown } | undefined)?.value;
    if (!(Array.isArray(box) && box.length === 4)) {
      return;
    }
    const [x, y, width, height] = box as number[];
    const focus: TakeoverFocus = { t: "focus", x, y, width, height };
    const said = JSON.stringify(focus);
    for (const viewer of this.#viewers) {
      viewer.send(said);
    }
  }

  /** A page or frame attached, paused as it opened: laid out, then let run, in one go. */
  #adopt(session: string, kind: Kind, waiting: boolean): void {
    this.#sessions.set(session, kind);
    const call = (method: string, params: Json = {}) =>
      this.#link.call(method, params, session).catch(() => undefined);
    Promise.all([
      ...this.#layCalls(session, kind, this.#layout),
      ...(kind === "page" ? [call("Page.enable")] : []),
      call("Target.setAutoAttach", { ...PAUSED, filter: [{ type: "iframe" }] }),
      ...(waiting ? [call("Runtime.runIfWaitingForDebugger")] : []),
    ]).catch(() => undefined);
  }

  #attached(message: Message): void {
    const params = (message.params ?? {}) as {
      sessionId?: unknown;
      targetInfo?: { targetId?: unknown; type?: unknown };
      waitingForDebugger?: unknown;
    };
    const session = params.sessionId;
    const targetId = params.targetInfo?.targetId;
    if (typeof session !== "string" || typeof targetId !== "string") {
      return;
    }
    const waiting = params.waitingForDebugger === true;
    const type = params.targetInfo?.type;
    // A page opened while the person holds the browser (agents are cut
    // off): shown from now on. A page open before is no business of the
    // take-over's, the taken one aside, which has its session already.
    if (!message.sessionId && type === "page") {
      if (!waiting) {
        this.#link
          .call("Target.detachFromTarget", { sessionId: session })
          .catch(() => undefined);
        return;
      }
      this.#adopt(session, "page", waiting);
      this.#targets.set(session, targetId);
      this.#pages.push(session);
      this.#queue(() => this.#reshow());
      return;
    }
    if (
      type === "iframe" &&
      message.sessionId &&
      this.#sessions.has(message.sessionId)
    ) {
      this.#adopt(session, "iframe", waiting);
      return;
    }
    if (waiting) {
      this.#link
        .call("Runtime.runIfWaitingForDebugger", {}, session)
        .catch(() => undefined);
    }
  }

  #detached(message: Message): void {
    const session = message.params?.sessionId;
    if (typeof session !== "string" || !this.#sessions.delete(session)) {
      return;
    }
    this.#targets.delete(session);
    const at = this.#pages.indexOf(session);
    if (at < 0) {
      return;
    }
    this.#pages.splice(at, 1);
    if (this.#cast === session) {
      this.#cast = undefined;
    }
    this.#queue(() => this.#reshow());
  }

  #event(message: Message): void {
    switch (message.method) {
      case "Page.screencastFrame":
        this.#frame(message);
        return;
      case "Target.attachedToTarget":
        if (!this.#watch) {
          this.#attached(message);
        }
        return;
      case "Target.detachedFromTarget":
        this.#detached(message);
        return;
      // A method off the wire is any string, or none: one this does not
      // name is no business of the take-over's.
      case undefined:
        return;
      default:
        return;
    }
  }

  #frame(message: Message): void {
    const params = message.params ?? {};
    // Acknowledged first: Chromium sends the next frame only after it.
    this.#link
      .call(
        "Page.screencastFrameAck",
        { sessionId: params.sessionId },
        message.sessionId
      )
      .catch(() => undefined);
    if (
      message.sessionId === undefined ||
      message.sessionId !== this.#cast ||
      typeof params.data !== "string" ||
      params.data === this.#lastData
    ) {
      return;
    }
    this.#lastData = params.data;
    const jpeg = Buffer.from(params.data, "base64");
    const laid = this.#laidSize();
    if (laid) {
      // A frame whose picture is not the layout's size was drawn before the
      // layout took (a desktop page shrunk into a phone's frame), whatever
      // its metadata says: it is dropped, and the layout's own follows.
      const picture = jpegSize(jpeg);
      if (
        picture &&
        (picture.width !== laid.width || picture.height !== laid.height)
      ) {
        return;
      }
      this.#size = laid;
    } else {
      const metadata = (params.metadata ?? {}) as {
        deviceHeight?: number;
        deviceWidth?: number;
      };
      this.#size = {
        width: Math.round(metadata.deviceWidth ?? FRAME.width),
        height: Math.round(metadata.deviceHeight ?? FRAME.height),
      };
    }
    this.#send(jpeg);
    clearTimeout(this.#settle);
    const scale = this.#layout?.form === "phone" ? this.#layout.scale : 1;
    if (scale > 1) {
      const page = message.sessionId;
      this.#settle = setTimeout(() => {
        this.#sharpen(page).catch(() => undefined);
      }, SETTLE_MS);
    }
  }

  /**
   * The still page's sharp picture, at its layout's scale: the frame
   * source while nothing moves. Dropped when a frame came while it was
   * taken (the page moved again; its own sharp picture follows).
   */
  async #sharpen(page: string): Promise<void> {
    const before = this.#frames;
    const shot = await this.#link.call(
      "Page.captureScreenshot",
      { format: "jpeg", quality: SHARP_QUALITY },
      page
    );
    const laid = this.#laidSize();
    if (
      before !== this.#frames ||
      page !== this.#cast ||
      typeof shot.data !== "string" ||
      this.#layout?.form !== "phone" ||
      !laid
    ) {
      return;
    }
    const jpeg = Buffer.from(shot.data, "base64");
    const picture = jpegSize(jpeg);
    const { scale } = this.#layout;
    if (
      picture &&
      (Math.abs(picture.width - laid.width * scale) > 1 ||
        Math.abs(picture.height - laid.height * scale) > 1)
    ) {
      return;
    }
    this.#send(jpeg);
  }

  /** The CSS size the layout lays the page out at; none while no layout is held, or for a screencast alone. */
  #laidSize(): { width: number; height: number } | undefined {
    if (this.#watch || !this.#layout) {
      return;
    }
    return this.#layout.form === "phone"
      ? { width: this.#layout.width, height: this.#layout.height }
      : { width: FRAME.width, height: FRAME.height };
  }

  /** One picture of the shown page to every view: its viewport's CSS size, then the JPEG. */
  #send(jpeg: Buffer): void {
    this.#frames += 1;
    const frame = new Uint8Array(4 + jpeg.length);
    const header = new DataView(frame.buffer);
    header.setUint16(0, this.#size.width);
    header.setUint16(2, this.#size.height);
    frame.set(jpeg, 4);
    this.#lastFrame = frame;
    for (const viewer of this.#viewers) {
      viewer.send(frame);
    }
  }

  #end(why: string, code = 1001): void {
    if (this.#state === "stopped") {
      return;
    }
    this.#state = "stopped";
    clearTimeout(this.#settle);
    for (const viewer of this.#viewers) {
      viewer.close(code, why);
    }
    this.#viewers.clear();
  }

  /**
   * Ends every view (with `code` and `why`) and the connection at once,
   * which takes the screencast and every layout it set with it (Chromium
   * drops a session's overrides as its connection closes): the agent has
   * the desktop's own again. Nothing here waits on Chromium, so a browser
   * that no longer answers, or a link already gone, ends it all the same.
   */
  stop(code = 1001, why = "The person handed the browser back."): void {
    this.#cast = undefined;
    this.#end(why, code);
    this.#link.close();
  }
}
