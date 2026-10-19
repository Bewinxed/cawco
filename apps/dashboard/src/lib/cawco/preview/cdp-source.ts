/**
 * The local host's stream (Projects spec §5.11): a machine with no container
 * runtime runs its browser as a local Chromium, and its take-over streams
 * one page over the hub's socket, `/ws/browser/<instance>/<artifact>/cdp`
 * (hub browser-routes.ts, agent shield.ts `cdpView`). While the person
 * holds the browser it is the take-over's screencast and their input;
 * while nobody does, the page in front's frames alone (agent cdp-watch.ts),
 * so this source takes no input then (`interactive` false). A live browser
 * showing no page closes the socket with 4404, said as `idle`; a close with
 * 4205 (the page in front moved, or a take-over's own screencast began) is
 * opened again at once, the last frame kept.
 *
 * - **Frames out.** Each binary message is a 4-byte header, the page's
 *   viewport width and height in CSS pixels (uint16, big-endian), then a
 *   JPEG (agent cdp-takeover.ts). It is drawn as an `<img>` at
 *   `object-fit: contain` in the well; the page is laid out at
 *   `BROWSER_SCREEN` (core browser.ts, 1280x800).
 * - **Input in.** The person's pointer, wheel, keys and words, as the JSON
 *   the machine accepts (agent cdp-takeover.ts `cdpInputOf`), every
 *   coordinate in the frame's CSS pixels: read off the image's drawn box
 *   (`getBoundingClientRect`, which a pinch's transform moves), less the
 *   letterbox `contain` leaves round the picture. A press on the frame
 *   focuses a hidden field, which takes the keys and, on a phone, raises
 *   the soft keyboard; its typed words go as `text`, its named keys as
 *   `key`.
 */
import { BROWSER_SCREEN } from "@cawco/core/browser";
import type { StreamSource, StreamStatus } from "./source";

/** The machine's close when the browser is no live local one or shows no page (agent preview.ts `NO_VIEW`). */
const NO_VIEW = 4404;

/** The machine's close when what the view shows moved (agent cdp-watch.ts `FRONT_MOVED`): opened again at once. */
const FRONT_MOVED = 4205;

/** How many times a dropped stream is opened again before it is given up; each waits a step longer. Our call, as neko's client's own. */
const RECONNECT_MAX = 5;
const RECONNECT_STEP_MS = 1500;

/** How far a finger may move and still be a tap, px. Our call. */
const TAP_SLOP = 8;

/** Keys that act without a character (agent cdp-takeover.ts `VIRTUAL_KEYS`): sent as `key`, every other one as its text. */
const NAMED_KEYS = new Set([
  "Backspace",
  "Tab",
  "Enter",
  "Escape",
  "PageUp",
  "PageDown",
  "End",
  "Home",
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "Delete",
]);

/** CDP's modifier bits (`Input.dispatchKeyEvent` `modifiers`): Alt 1, Ctrl 2, Meta 4, Shift 8. */
const modifiersOf = (event: KeyboardEvent | MouseEvent): number =>
  (event.altKey ? 1 : 0) +
  (event.ctrlKey ? 2 : 0) +
  (event.metaKey ? 4 : 0) +
  (event.shiftKey ? 8 : 0);

const BUTTONS = ["left", "middle", "right"] as const;

type Input =
  | {
      t: "move" | "down" | "up";
      x: number;
      y: number;
      button?: (typeof BUTTONS)[number];
      modifiers?: number;
    }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; type: "down" | "up"; key: string; modifiers?: number }
  | { t: "text"; text: string }
  | { t: "tap"; x: number; y: number };

export class CdpSource implements StreamSource {
  readonly #url: string;
  readonly #report: (status: StreamStatus) => void;
  #socket: WebSocket | null = null;
  #image: HTMLImageElement | null = null;
  #field: HTMLTextAreaElement | null = null;
  /** The frame's CSS size, from its header. */
  #frame: { width: number; height: number } = { ...BROWSER_SCREEN };
  #shown: string | null = null;
  /** Whether a frame was drawn on this connection. */
  #seen: "none" | "drawn" = "none";
  /** Open until it is closed, by its view or by its own give-up. */
  #life: "open" | "closed" = "open";
  #tries = 0;
  #retry: ReturnType<typeof setTimeout> | undefined;

  /** Whether the person's input goes to the page: only while they hold the browser. */
  readonly #interactive: boolean;

  /**
   * `url` is the view's socket, `ws(s)://<origin>/ws/browser/<instance>/<artifact>/cdp`;
   * `interactive` while the person holds the browser.
   */
  constructor(
    url: string,
    report: (status: StreamStatus) => void,
    interactive: boolean
  ) {
    this.#url = url;
    this.#report = report;
    this.#interactive = interactive;
    report({ kind: "connecting" });
    this.#open();
  }

  #open(): void {
    const socket = new WebSocket(this.#url);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.#draw(event.data);
      }
    };
    socket.onclose = (event) => {
      if (this.#socket !== socket || this.#life === "closed") {
        return;
      }
      this.#socket = null;
      if (event.code === NO_VIEW) {
        this.#report({ kind: "idle" });
        return;
      }
      if (event.code === FRONT_MOVED) {
        this.#open();
        return;
      }
      if (this.#seen === "none" || this.#tries >= RECONNECT_MAX) {
        this.#report({ kind: "lost" });
        return;
      }
      this.#tries += 1;
      this.#report({ kind: "reconnecting" });
      this.#retry = setTimeout(
        () => this.#open(),
        RECONNECT_STEP_MS * this.#tries
      );
    };
  }

  /** One frame: its header's size, then its JPEG in the image. */
  #draw(data: ArrayBuffer): void {
    if (data.byteLength <= 4) {
      return;
    }
    const header = new DataView(data, 0, 4);
    this.#frame = { width: header.getUint16(0), height: header.getUint16(2) };
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(data, 4)], { type: "image/jpeg" })
    );
    const was = this.#shown;
    this.#shown = url;
    if (this.#image) {
      this.#image.src = url;
    }
    if (was) {
      URL.revokeObjectURL(was);
    }
    if (this.#seen === "none" || this.#tries > 0) {
      this.#seen = "drawn";
      this.#tries = 0;
      this.#report({ kind: "live", viaRelay: false });
    }
  }

  #send(input: Input): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(input));
    }
  }

  /** A point on the screen as the page's CSS pixels, or null outside the picture. */
  #at(clientX: number, clientY: number): { x: number; y: number } | null {
    const image = this.#image;
    if (!image) {
      return null;
    }
    const box = image.getBoundingClientRect();
    const { width, height } = this.#frame;
    const scale = Math.min(box.width / width, box.height / height);
    if (!(scale > 0)) {
      return null;
    }
    const x = (clientX - box.left - (box.width - width * scale) / 2) / scale;
    const y = (clientY - box.top - (box.height - height * scale) / 2) / scale;
    if (x < 0 || y < 0 || x > width || y > height) {
      return null;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  attach(box: HTMLElement): () => void {
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.dataset.slot = "browser-frame";
    image.className =
      "absolute inset-0 size-full touch-none select-none object-contain";
    if (this.#shown) {
      image.src = this.#shown;
    }
    // The keys' and the soft keyboard's field: in the box, out of sight.
    const field = document.createElement("textarea");
    field.setAttribute("aria-label", "Type into the page");
    field.autocapitalize = "off";
    field.autocomplete = "off";
    field.spellcheck = false;
    // 16px: iOS Safari zooms the page into a smaller field as it focuses.
    field.className =
      "pointer-events-none absolute start-0 bottom-0 size-px resize-none border-0 p-0 text-[16px] opacity-0";
    box.append(image, field);
    this.#image = image;
    this.#field = field;
    /** Takes the image and the field out again. */
    const detach = () => {
      image.remove();
      field.remove();
      if (this.#image === image) {
        this.#image = null;
        this.#field = null;
      }
    };

    /** The finger down, for a tap or a scroll. */
    let touch: { id: number; x: number; y: number; moved: boolean } | null =
      null;

    const onDown = (event: PointerEvent) => {
      const at = this.#at(event.clientX, event.clientY);
      if (!(at && event.isPrimary)) {
        return;
      }
      event.preventDefault();
      field.focus({ preventScroll: true });
      if (event.pointerType === "touch") {
        touch = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
        return;
      }
      image.setPointerCapture(event.pointerId);
      this.#send({
        t: "down",
        ...at,
        button: BUTTONS[event.button] ?? "left",
        modifiers: modifiersOf(event),
      });
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (!(touch && touch.id === event.pointerId)) {
          return;
        }
        const dx = touch.x - event.clientX;
        const dy = touch.y - event.clientY;
        if (!touch.moved && Math.hypot(dx, dy) < TAP_SLOP) {
          return;
        }
        // A finger dragged over the page scrolls it, as on the phone's own browser.
        touch.moved = true;
        const at = this.#at(event.clientX, event.clientY);
        if (at) {
          this.#send({ t: "wheel", ...at, dx, dy });
        }
        touch.x = event.clientX;
        touch.y = event.clientY;
        return;
      }
      const at = this.#at(event.clientX, event.clientY);
      if (at) {
        this.#send({ t: "move", ...at, modifiers: modifiersOf(event) });
      }
    };
    const onUp = (event: PointerEvent) => {
      const at = this.#at(event.clientX, event.clientY);
      if (event.pointerType === "touch") {
        if (touch?.id === event.pointerId && !touch.moved && at) {
          this.#send({ t: "tap", ...at });
        }
        touch = null;
        return;
      }
      if (at) {
        this.#send({
          t: "up",
          ...at,
          button: BUTTONS[event.button] ?? "left",
          modifiers: modifiersOf(event),
        });
      }
    };
    const onCancel = () => {
      touch = null;
    };
    const onWheel = (event: WheelEvent) => {
      const at = this.#at(event.clientX, event.clientY);
      if (!at) {
        return;
      }
      event.preventDefault();
      this.#send({ t: "wheel", ...at, dx: event.deltaX, dy: event.deltaY });
    };
    const onKey = (event: KeyboardEvent) => {
      const chord = event.ctrlKey || event.metaKey || event.altKey;
      if (!(NAMED_KEYS.has(event.key) || (chord && event.key.length === 1))) {
        // A character: the field's input says it, IME and the soft keyboard alike.
        return;
      }
      event.preventDefault();
      this.#send({
        t: "key",
        type: event.type === "keydown" ? "down" : "up",
        key: event.key,
        modifiers: modifiersOf(event),
      });
    };
    const onInput = () => {
      if (field.value) {
        this.#send({ t: "text", text: field.value });
        field.value = "";
      }
    };
    const onContext = (event: Event) => event.preventDefault();

    if (!this.#interactive) {
      // A picture alone while nobody holds the browser.
      return detach;
    }
    image.addEventListener("pointerdown", onDown);
    image.addEventListener("pointermove", onMove);
    image.addEventListener("pointerup", onUp);
    image.addEventListener("pointercancel", onCancel);
    image.addEventListener("wheel", onWheel, { passive: false });
    image.addEventListener("contextmenu", onContext);
    field.addEventListener("keydown", onKey);
    field.addEventListener("keyup", onKey);
    field.addEventListener("input", onInput);
    return detach;
  }

  keyboard(): void {
    this.#field?.focus({ preventScroll: true });
  }

  /** The local browser is headless and sends no sound. */
  sound(_on: boolean): void {
    // Nothing to turn on: the frames carry no sound.
  }

  close(): void {
    if (this.#life === "closed") {
      return;
    }
    this.#life = "closed";
    clearTimeout(this.#retry);
    this.#socket?.close(1000);
    this.#socket = null;
    if (this.#shown) {
      URL.revokeObjectURL(this.#shown);
      this.#shown = null;
    }
  }
}
