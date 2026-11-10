/**
 * The local host's take-over (Projects spec §5.11): one page of the local
 * Chromium shown to the person as JPEG frames, their pointer and keys sent
 * back in. It runs on the daemon's own connection to Chromium's DevTools,
 * never through the gate, which the shield holds closed meanwhile.
 *
 * Raw CDP (`Page.startScreencast`, `Input.dispatch*`), not Playwright's
 * `page.screencast` and `page.mouse`: the standalone binary keeps
 * playwright-core out of itself (scripts/build-binary.ts `PUBLISHED_PACKAGES`), and a
 * machine with no container runtime is the one this runs on. The wire is the
 * one Playwright's wrappers speak (spec check C11's branch).
 *
 * A view attaches as a {@link CdpViewer}: every frame goes to it as one
 * binary message, a 4-byte header (the page's viewport width and height in
 * CSS pixels, uint16 big-endian) then the JPEG; it sends {@link CdpInput}
 * as JSON text, its coordinates in those CSS pixels. Frames are made only
 * while a view is attached.
 */

import { readWithin } from "@cawco/core/bounded";
import { BROWSER_SCREEN } from "@cawco/core/browser";
import { z } from "zod";
import { CdpCalls, DevtoolsVersion } from "./cdp-calls";

/** What a view sends: the person's pointer, keys and words, in the page's CSS pixels. */
const CdpInputSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.enum(["move", "down", "up"]),
    x: z.number(),
    y: z.number(),
    button: z.enum(["left", "middle", "right"]).optional(),
    modifiers: z.number().optional(),
  }),
  z.object({
    t: z.literal("wheel"),
    x: z.number(),
    y: z.number(),
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    t: z.literal("key"),
    type: z.enum(["down", "up"]),
    key: z.string(),
    modifiers: z.number().optional(),
  }),
  z.object({ t: z.literal("text"), text: z.string() }),
  z.object({ t: z.literal("tap"), x: z.number(), y: z.number() }),
]);
export type CdpInput = z.infer<typeof CdpInputSchema>;

/** One open view of the take-over: where its frames go. */
export interface CdpViewer {
  close: (code: number, why: string) => void;
  send: (frame: Uint8Array) => void;
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

/** The page size a screencast frame names (`Page.screencastFrame` metadata). */
const FrameMetadata = z.object({
  deviceHeight: z.number().optional(),
  deviceWidth: z.number().optional(),
});

/** A take-over's screencast: none yet, frames being made, or ended. */
type CastState = "idle" | "casting" | "stopped";

/** The frame's largest edges, and the page's viewport while it is taken over: the container host's screen. */
const FRAME = BROWSER_SCREEN;
const QUALITY = 70;

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
      fetch(`${devtools}/json/version`, { signal }).then(async (response) =>
        DevtoolsVersion.parse(await response.json())
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

/** A view's message as {@link CdpInput}, or undefined when it is none. */
export const cdpInputOf = (text: string): CdpInput | undefined => {
  try {
    const input = CdpInputSchema.safeParse(JSON.parse(text));
    return input.success ? input.data : undefined;
  } catch {
    // Not JSON: no input.
    return undefined;
  }
};

/**
 * One take-over of one page of a local browser: started by the shield on
 * the page it brought to the front, stopped at hand-back.
 */
export class CdpTakeover {
  readonly #link: CdpLink;
  readonly #session: string;
  readonly targetId: string;
  readonly #viewers = new Set<CdpViewer>();
  /** Frames being made (a view is attached), or the take-over over. */
  #state: CastState = "idle";
  /** The pointer's held button, which a move carries. */
  #held: keyof typeof BUTTON | undefined;
  /** A screencast alone: the view's input is dropped. */
  readonly #watch: boolean;

  private constructor(
    link: CdpLink,
    session: string,
    targetId: string,
    watch = false
  ) {
    this.#link = link;
    this.#session = session;
    this.targetId = targetId;
    this.#watch = watch;
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
      if (watch) {
        return new CdpTakeover(link, session, targetId, true);
      }
      // The person's view is the container host's 1280x800 (its neko
      // screen). Headless Chromium lays the page out in its window less the
      // browser's own UI, whose height changes by version (1280x657 under
      // Chrome 156's new headless for a 1280,800 window); the page's viewport
      // is set as Playwright sets every viewport (`Emulation.
      // setDeviceMetricsOverride`, playwright-core 1.64.1 `_updateViewport`),
      // and lasts while this take-over's session is attached.
      await link.call(
        "Emulation.setDeviceMetricsOverride",
        {
          width: FRAME.width,
          height: FRAME.height,
          deviceScaleFactor: 1,
          mobile: false,
        },
        session
      );
      return new CdpTakeover(link, session, targetId);
    } catch (error) {
      link.close();
      throw error;
    }
  }

  /** How many views are attached now. */
  get viewers(): number {
    return this.#viewers.size;
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
      await this.#link.call(
        "Page.startScreencast",
        {
          format: "jpeg",
          quality: QUALITY,
          maxWidth: FRAME.width,
          maxHeight: FRAME.height,
        },
        this.#session
      );
    }
    return () => this.#detach(viewer);
  }

  #detach(viewer: CdpViewer): void {
    if (!this.#viewers.delete(viewer) || this.#viewers.size > 0) {
      return;
    }
    this.#state = "idle";
    this.#link
      .call("Page.stopScreencast", {}, this.#session)
      .catch(() => undefined);
  }

  /** The inputs landing, one after another. */
  #landing: Promise<void> = Promise.resolve();

  /**
   * One message of a view's: the person's pointer, keys or words, onto the
   * page, after every message before it has landed. A message can take more
   * than one call (Enter's press, then its character), and the view sends
   * the next without waiting: run side by side, a word typed after Return
   * went in before Return's newline.
   */
  input(input: CdpInput): Promise<void> {
    const landed = this.#landing.then(() => this.#land(input));
    this.#landing = landed.catch(() => undefined);
    return landed;
  }

  async #land(input: CdpInput): Promise<void> {
    if (this.#state === "stopped" || this.#watch) {
      return;
    }
    const at = (x: number, y: number) => ({ x, y });
    switch (input.t) {
      case "move":
        await this.#mouse("mouseMoved", input.x, input.y, input.modifiers);
        return;
      case "down":
        this.#held = input.button ?? "left";
        await this.#mouse("mousePressed", input.x, input.y, input.modifiers);
        return;
      case "up":
        await this.#mouse("mouseReleased", input.x, input.y, input.modifiers);
        this.#held = undefined;
        return;
      case "wheel":
        await this.#link.call(
          "Input.dispatchMouseEvent",
          {
            type: "mouseWheel",
            ...at(input.x, input.y),
            deltaX: input.dx,
            deltaY: input.dy,
          },
          this.#session
        );
        return;
      case "tap":
        // A tap on the frame is a click on the page: the local browser is a
        // desktop Chromium, which takes no touch until it emulates one.
        this.#held = "left";
        await this.#mouse("mousePressed", input.x, input.y);
        await this.#mouse("mouseReleased", input.x, input.y);
        this.#held = undefined;
        return;
      case "key":
        await this.#link.call(
          "Input.dispatchKeyEvent",
          {
            type: input.type === "down" ? "rawKeyDown" : "keyUp",
            modifiers: input.modifiers ?? 0,
            ...keyEvent(input.key),
          },
          this.#session
        );
        // Enter's character goes with its press, as a keyboard's does.
        if (input.type === "down" && input.key === "Enter") {
          await this.#link.call(
            "Input.dispatchKeyEvent",
            { type: "char", text: "\r", key: "Enter" },
            this.#session
          );
        }
        return;
      case "text":
        await this.#link.call(
          "Input.insertText",
          { text: input.text },
          this.#session
        );
        return;
      default:
        return;
    }
  }

  #mouse(
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
      this.#session
    );
  }

  #event(message: Message): void {
    if (
      message.method !== "Page.screencastFrame" ||
      message.sessionId !== this.#session
    ) {
      return;
    }
    const params = message.params ?? {};
    const metadata = FrameMetadata.catch({}).parse(params.metadata);
    // Acknowledged first: Chromium sends the next frame only after it.
    this.#link
      .call(
        "Page.screencastFrameAck",
        { sessionId: params.sessionId },
        this.#session
      )
      .catch(() => undefined);
    if (typeof params.data !== "string") {
      return;
    }
    const jpeg = Buffer.from(params.data, "base64");
    const frame = new Uint8Array(4 + jpeg.length);
    const header = new DataView(frame.buffer);
    header.setUint16(0, Math.round(metadata.deviceWidth ?? FRAME.width));
    header.setUint16(2, Math.round(metadata.deviceHeight ?? FRAME.height));
    frame.set(jpeg, 4);
    for (const viewer of this.#viewers) {
      viewer.send(frame);
    }
  }

  #end(why: string, code = 1001): void {
    if (this.#state === "stopped") {
      return;
    }
    this.#state = "stopped";
    for (const viewer of this.#viewers) {
      viewer.close(code, why);
    }
    this.#viewers.clear();
  }

  /** Ends the screencast, every view (with `code` and `why`) and the connection. */
  async stop(
    code = 1001,
    why = "The person handed the browser back."
  ): Promise<void> {
    if (this.#state === "casting") {
      await this.#link
        .call("Page.stopScreencast", {}, this.#session)
        .catch(() => undefined);
    }
    this.#end(why, code);
    this.#link.close();
  }
}
